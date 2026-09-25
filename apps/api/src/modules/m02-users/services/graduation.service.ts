// GraduationService (SL-03, DP-10, SDD-05 §4.7d): menonaktifkan akun siswa yang
// ditandai lulus SETELAH tahun ajarannya berakhir. Akun tidak dihapus (BR-067).
//
// Idempoten (`JOB-03`): siswa yang sudah nonaktif tidak dipilih lagi, sehingga
// menjalankannya ulang atas hari yang sama tidak menghasilkan apa pun.
//
// BELUM dipasang sebagai pekerjaan worker: pelaku job adalah `SYSTEM`
// (`SDD-03`, `AL-06`) dan `SystemAuthContext` belum ada — butir terbuka log
// phase-01 §10. Service ini menerima `AuthContext` dari pemanggil.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { createStudentEnrollmentRepository } from "../repositories/student-enrollment.repository.js";
import { createUserRepository } from "../repositories/user.repository.js";
import type { StudentObligation, StudentObligationRegistry } from "./student-obligation-registry.js";
import { studentObligations } from "./student-obligation-registry.js";

const MODUL = "m02-users";

export interface BlockedGraduate {
    readonly userId: number;
    readonly kewajiban: readonly StudentObligation[];
}

export interface GraduationResult {
    readonly diproses: number;
    readonly dinonaktifkan: number;
    /** SL-04: tetap AKTIF; daftarnya ditampilkan kepada Administrator. */
    readonly terblokir: readonly BlockedGraduate[];
}

/** Hari WIB (`YYYY-MM-DD`) dari sebuah instan — batas hari mengikuti `CAL-03`, bukan UTC. */
export function tanggalWib(instan: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(instan);
}

export class GraduationService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly obligations: StudentObligationRegistry = studentObligations,
    ) {}

    /** `hariIni` = hari WIB (`tanggalWib(clock.now())`); tahun ajaran berakhir bila `tanggal_selesai` < `hariIni`. */
    async deactivateDueGraduates(ctx: AuthContext, hariIni: string): Promise<GraduationResult> {
        const due = await createStudentEnrollmentRepository(this.db).listDueGraduates(ctx, hariIni);

        let dinonaktifkan = 0;
        const terblokir: BlockedGraduate[] = [];
        for (const lulusan of due) {
            const userId = Number(lulusan.userId);
            const hasil = await withTransaction(
                ctx,
                async (scope) => {
                    const users = createUserRepository(scope.tx);
                    const sebelum = await users.findById(scope.ctx, userId);
                    // Diperiksa ulang di dalam transaksi: dapat berubah sejak daftar dibaca.
                    if (sebelum === undefined || sebelum.status !== "AKTIF") return "LEWAT" as const;

                    const kewajiban = await this.obligations.cek(scope, userId);
                    if (kewajiban.length > 0) return { kewajiban };

                    const sesudah = await users.updateStatus(scope.ctx, userId, "NONAKTIF");
                    await this.audit.write(scope, {
                        modul: MODUL,
                        aksi: "STUDENT_GRADUATION_DEACTIVATED",
                        entitas: "users",
                        entitasId: userId,
                        nilaiSebelum: sebelum,
                        nilaiSesudah: sesudah,
                        keterangan: `Lulus — tahun ajaran ${lulusan.academicYearId} berakhir (SL-03).`,
                    });
                    return "NONAKTIF" as const;
                },
                this.db,
            );
            if (hasil === "NONAKTIF") dinonaktifkan += 1;
            else if (hasil !== "LEWAT") terblokir.push({ userId, kewajiban: hasil.kewajiban });
        }
        return { diproses: due.length, dinonaktifkan, terblokir };
    }
}
