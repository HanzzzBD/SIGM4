// ClassPromotionService (SL-01, SL-02, SDD-05 §4.7d). Kenaikan kelas massal:
// per siswa, `NAIK` menetapkan kelas pada satu tahun ajaran dan `LULUS`
// menandainya lulus. Penonaktifan lulusan BUKAN di sini — menunggu tahun ajaran
// berakhir (SL-03, `GraduationService`).
//
// Satu transaksi PER SISWA (pola impor `IMPT-01`): siswa yang gagal tidak
// membatalkan siswa lain, dan laporannya dikembalikan per siswa.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { Logger } from "../../../shared/observability/index.js";
import type { StudentEnrollmentRepository } from "../repositories/student-enrollment.repository.js";
import {
    KODE_ROLE_SISWA,
    createStudentEnrollmentRepository,
} from "../repositories/student-enrollment.repository.js";
import type { StudentObligation, StudentObligationRegistry } from "./student-obligation-registry.js";
import { studentObligations } from "./student-obligation-registry.js";

const MODUL = "m02-users";

/** Batas satu permintaan sinkron — pola `BATAS_BARIS_IMPOR` (`IMPT-04`); klien membagi kelompok yang lebih besar. */
export const BATAS_ITEM_KENAIKAN = 200;

export type PromotionItem =
    | { readonly userId: number; readonly tindakan: "NAIK"; readonly kelasId: number }
    | { readonly userId: number; readonly tindakan: "LULUS" };

export interface PromotionOutcome {
    readonly userId: number;
    readonly tindakan: "NAIK" | "LULUS";
    readonly status: "SUKSES" | "GAGAL";
    readonly pesan: string | null;
    /** Hanya untuk `LULUS`: kewajiban yang akan memblokir penonaktifan (SL-04), bila ada. */
    readonly kewajiban: readonly StudentObligation[];
}

export interface PromotionResult {
    readonly total: number;
    readonly sukses: number;
    readonly gagal: number;
    readonly baris: readonly PromotionOutcome[];
}

function tolak(pesan: string, field?: string): never {
    throw new DomainError("VALIDATION_ERROR", pesan, field === undefined ? undefined : { field });
}

export class ClassPromotionService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
        private readonly logger: Logger,
        private readonly obligations: StudentObligationRegistry = studentObligations,
    ) {}

    /** `POST /class-promotions` (`SL-02`). */
    async promote(
        ctx: AuthContext,
        academicYearId: number,
        items: readonly PromotionItem[],
    ): Promise<PromotionResult> {
        if (items.length > BATAS_ITEM_KENAIKAN) {
            tolak(`Permintaan melebihi ${String(BATAS_ITEM_KENAIKAN)} siswa; bagi menjadi beberapa permintaan.`);
        }
        if (!(await createStudentEnrollmentRepository(this.db).academicYearExists(ctx, academicYearId))) {
            tolak("Tahun ajaran tidak ditemukan.", "academic_year_id");
        }

        const baris: PromotionOutcome[] = [];
        for (const item of items) {
            baris.push(await this.prosesItem(ctx, academicYearId, item));
        }
        const sukses = baris.filter((b) => b.status === "SUKSES").length;
        return { total: baris.length, sukses, gagal: baris.length - sukses, baris };
    }

    private async prosesItem(
        ctx: AuthContext,
        academicYearId: number,
        item: PromotionItem,
    ): Promise<PromotionOutcome> {
        try {
            const kewajiban = await withTransaction(
                ctx,
                async (scope) => {
                    const repo = createStudentEnrollmentRepository(scope.tx);
                    await this.pastikanSiswaAktif(repo, scope, item.userId);
                    if (item.tindakan === "NAIK") {
                        await this.naik(repo, scope, academicYearId, item.userId, item.kelasId);
                        return [];
                    }
                    return this.lulus(repo, scope, academicYearId, item.userId);
                },
                this.db,
            );
            return { userId: item.userId, tindakan: item.tindakan, status: "SUKSES", pesan: null, kewajiban };
        } catch (galat) {
            if (galat instanceof DomainError) {
                return {
                    userId: item.userId,
                    tindakan: item.tindakan,
                    status: "GAGAL",
                    pesan: galat.message,
                    kewajiban: [],
                };
            }
            // Kegagalan tak terduga tidak boleh menggagalkan siswa lain (pola IMPT-01).
            this.logger.error("Kenaikan kelas gagal tak terduga", galat, {
                modul: MODUL,
                user_id: item.userId,
            });
            return {
                userId: item.userId,
                tindakan: item.tindakan,
                status: "GAGAL",
                pesan: "Kesalahan tak terduga saat memproses siswa.",
                kewajiban: [],
            };
        }
    }

    private async pastikanSiswaAktif(
        repo: StudentEnrollmentRepository,
        scope: TransactionScope,
        userId: number,
    ): Promise<void> {
        const akun = await repo.findAccount(scope.ctx, userId);
        if (akun === undefined) tolak("Pengguna tidak ditemukan.");
        if (akun.roleKode !== KODE_ROLE_SISWA) tolak("Bukan akun siswa.");
        if (akun.status !== "AKTIF") tolak("Akun siswa tidak aktif.");
    }

    private async naik(
        repo: StudentEnrollmentRepository,
        scope: TransactionScope,
        academicYearId: number,
        userId: number,
        kelasId: number,
    ): Promise<void> {
        const kelas = await repo.findKelas(scope.ctx, kelasId);
        if (kelas === undefined) tolak("Kelas tidak ditemukan.", "kelas_id");
        if (kelas.jenis !== "KELAS") tolak("Unit kerja itu bukan kelas.", "kelas_id");
        if (kelas.status !== "AKTIF") tolak("Kelas tidak aktif.", "kelas_id");

        const sebelum = await repo.findEnrollment(scope.ctx, userId, academicYearId);
        if (sebelum !== undefined && sebelum.kelas_id === String(kelasId) && !sebelum.lulus) return;

        const sesudah = await repo.upsertKelas(scope.ctx, userId, academicYearId, kelasId);
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "STUDENT_ENROLLMENT_SET",
            entitas: "student_enrollments",
            entitasId: sesudah.id,
            nilaiSebelum: sebelum ?? null,
            nilaiSesudah: sesudah,
        });
    }

    private async lulus(
        repo: StudentEnrollmentRepository,
        scope: TransactionScope,
        academicYearId: number,
        userId: number,
    ): Promise<readonly StudentObligation[]> {
        const sebelum = await repo.findEnrollment(scope.ctx, userId, academicYearId);
        if (sebelum === undefined) {
            tolak("Siswa belum memiliki kelas pada tahun ajaran ini; tetapkan kelas (NAIK) lebih dulu.");
        }
        if (!sebelum.lulus) {
            const sesudah = await repo.markLulus(scope.ctx, sebelum.id);
            await this.audit.write(scope, {
                modul: MODUL,
                aksi: "STUDENT_MARKED_GRADUATED",
                entitas: "student_enrollments",
                entitasId: sesudah.id,
                nilaiSebelum: sebelum,
                nilaiSesudah: sesudah,
            });
        }
        // SL-04: kewajiban ditampilkan SEKARANG agar Administrator dapat menuntaskannya
        // sebelum tahun ajaran berakhir; penandaan lulus tetap sah.
        return this.obligations.cek(scope, userId);
    }
}
