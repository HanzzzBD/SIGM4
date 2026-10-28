// AcademicYearService (Lampiran E.2, AC-YR-01, AC-YR-02, SDD-DB-18, SDD-05 §4.7b).
// Batas transaksi SDD-07: perubahan tahun ajaran dan entri log (§11) satu transaksi.
//
// Aktivasi TIDAK menjalankan kenaikan kelas maupun pekerjaan siklus akun siswa:
// pemicu `AC-YR-02` berupa pekerjaan `student-graduation` yang menunggu
// `SystemAuthContext` (`PR-02-32`); kelulusan berbasis `tanggal_selesai`
// (`GraduationService`, `SL-03`), bukan berbasis aktivasi.

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { createAcademicYearRepository } from "../repositories/academic-year.repository.js";
import type {
    AcademicTermRow,
    AcademicYearRepository,
    AcademicYearRow,
    TermData,
} from "../repositories/academic-year.repository.js";
import { MODUL, duplikat, tolak } from "./rules.js";

export interface AcademicYearInput {
    readonly nama: string;
    readonly tanggalMulai: string;
    readonly tanggalSelesai: string;
    readonly semester: readonly TermData[];
}

export interface AcademicYearView {
    readonly tahun: AcademicYearRow;
    readonly semester: readonly AcademicTermRow[];
}

export interface ListAcademicYearsResult {
    readonly rows: readonly AcademicYearView[];
    readonly page: number;
    readonly perPage: number;
    readonly total: number;
    readonly totalPages: number;
}

function snapshot(v: AcademicYearView): Record<string, unknown> {
    return {
        nama: v.tahun.nama,
        tanggal_mulai: v.tahun.tanggal_mulai,
        tanggal_selesai: v.tahun.tanggal_selesai,
        is_active: v.tahun.is_active,
        semester: v.semester
            .map((s) => ({ nama: s.nama, tanggal_mulai: s.tanggal_mulai, tanggal_selesai: s.tanggal_selesai }))
            .toSorted((a, b) => (a.nama < b.nama ? -1 : 1)),
    };
}

export class AcademicYearService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    async list(ctx: AuthContext, page: number, perPage: number): Promise<ListAcademicYearsResult> {
        const repo = createAcademicYearRepository(this.db);
        const { rows, total } = await repo.list(ctx, page, perPage);
        const semester = await repo.termsOf(
            ctx,
            rows.map((r) => r.id),
        );
        return {
            rows: rows.map((tahun) => ({ tahun, semester: semester.filter((s) => s.academic_year_id === tahun.id) })),
            page,
            perPage,
            total,
            totalPages: Math.max(1, Math.ceil(total / perPage)),
        };
    }

    /** Tahun ajaran pertama otomatis aktif (AC-YR-01); selebihnya lahir tidak aktif. */
    async create(ctx: AuthContext, input: AcademicYearInput): Promise<AcademicYearView> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAcademicYearRepository(scope.tx);
                await repo.lockKalender(ctx);
                await this.validasi(repo, ctx, input);

                const aktif = (await repo.count(ctx)) === 0;
                const tahun = await repo.insertYear(ctx, input, aktif);
                const semester = await repo.replaceTerms(ctx, tahun.id, input.semester);
                const hasil = { tahun, semester };
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ACADEMIC_YEAR_CREATED",
                    entitas: "academic_years",
                    entitasId: tahun.id,
                    nilaiSesudah: snapshot(hasil),
                });
                return hasil;
            },
            this.db,
        );
    }

    /** Pengganti penuh nama, rentang, dan kedua semester. `is_active` tidak berubah di sini. */
    async update(ctx: AuthContext, id: number, input: AcademicYearInput): Promise<AcademicYearView> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAcademicYearRepository(scope.tx);
                await repo.lockKalender(ctx);
                const sebelum = await this.muat(repo, ctx, id);
                await this.validasi(repo, ctx, input, id);

                const tahun = await repo.updateYear(ctx, id, input);
                const semester = await repo.replaceTerms(ctx, tahun.id, input.semester);
                const sesudah = { tahun, semester };
                if (JSON.stringify(snapshot(sebelum)) === JSON.stringify(snapshot(sesudah))) return sesudah;

                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ACADEMIC_YEAR_UPDATED",
                    entitas: "academic_years",
                    entitasId: tahun.id,
                    nilaiSebelum: snapshot(sebelum),
                    nilaiSesudah: snapshot(sesudah),
                });
                return sesudah;
            },
            this.db,
        );
    }

    /**
     * Menukar tahun ajaran aktif dalam SATU transaksi (AC-YR-02, SDD-DB-18): yang
     * lama dinonaktifkan lebih dulu (indeks unik parsial bersifat segera), lalu
     * yang baru diaktifkan; constraint trigger "tepat satu aktif" diperiksa saat
     * COMMIT. Mengaktifkan tahun yang sudah aktif tidak mengubah apa pun.
     */
    async activate(ctx: AuthContext, id: number): Promise<AcademicYearView> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createAcademicYearRepository(scope.tx);
                await repo.lockKalender(ctx);
                const sebelum = await this.muat(repo, ctx, id);
                if (sebelum.tahun.is_active) return sebelum;

                const lama = await repo.findActive(ctx);
                if (lama !== undefined) await repo.setActive(ctx, lama.id, false);
                await repo.setActive(ctx, id, true);

                const sesudah = await this.muat(repo, ctx, id);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ACADEMIC_YEAR_ACTIVATED",
                    entitas: "academic_years",
                    entitasId: id,
                    nilaiSebelum: lama === undefined ? null : { id: lama.id, nama: lama.nama },
                    nilaiSesudah: { id: sesudah.tahun.id, nama: sesudah.tahun.nama },
                });
                return sesudah;
            },
            this.db,
        );
    }

    private async muat(repo: AcademicYearRepository, ctx: AuthContext, id: number): Promise<AcademicYearView> {
        const tahun = await repo.findById(ctx, id);
        if (tahun === undefined) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
        return { tahun, semester: await repo.termsOf(ctx, [tahun.id]) };
    }

    /** Aturan `SDD-05 §4.7b` yang tidak dapat ditegakkan skema (semester di dalam rentang tahunnya) beserta pesan yang jelas bagi pengguna. */
    private async validasi(repo: AcademicYearRepository, ctx: AuthContext, input: AcademicYearInput, kecualiId?: number): Promise<void> {
        if (input.tanggalMulai >= input.tanggalSelesai) tolak("Tanggal mulai harus sebelum tanggal selesai.", "tanggal_mulai");
        if (await repo.namaSudahDipakai(ctx, input.nama, kecualiId)) duplikat("Nama tahun ajaran sudah digunakan.", "nama");
        const irisan = await repo.irisan(ctx, input.tanggalMulai, input.tanggalSelesai, kecualiId);
        if (irisan !== undefined) tolak(`Rentang tanggal beririsan dengan tahun ajaran ${irisan}.`, "tanggal_mulai");

        for (const s of input.semester) {
            const label = s.nama === "GANJIL" ? "Ganjil" : "Genap";
            if (s.tanggalMulai >= s.tanggalSelesai) tolak(`Semester ${label}: tanggal mulai harus sebelum tanggal selesai.`, "semester");
            if (s.tanggalMulai < input.tanggalMulai || s.tanggalSelesai > input.tanggalSelesai) {
                tolak(`Semester ${label} harus berada di dalam rentang tahun ajaran.`, "semester");
            }
        }
        const [a, b] = input.semester;
        if (a !== undefined && b !== undefined && a.tanggalMulai <= b.tanggalSelesai && b.tanggalMulai <= a.tanggalSelesai) {
            tolak("Semester Ganjil dan Genap tidak boleh beririsan.", "semester");
        }
    }
}
