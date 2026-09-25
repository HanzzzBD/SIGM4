// Repository `academic_years` + `academic_terms` (Lampiran E.2, SDD-AUTH-02).
// PRIVAT terhadap modul (SDD-SYS-03) — hanya services/ modul ini yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

/** Kunci advisory tunggal atas seluruh perubahan tahun ajaran (lihat `lockKalender`). */
const KUNCI_KALENDER = 4_815_162_344;

/**
 * Kolom `date` dibaca sebagai teks `YYYY-MM-DD`: driver `pg` mengembalikan `Date` (tengah
 * malam zona proses), yang tampil sebagai `...T00:00:00.000Z` di JSON dan membuat
 * perbandingan rentang bergantung pada zona waktu. Bentuk yang sama dengan
 * `BusinessCalendarService`.
 */
const tgl = (kolom: "tanggal_mulai" | "tanggal_selesai") => sql<string>`to_char(${sql.ref(kolom)}, 'YYYY-MM-DD')`.as(kolom);

const KOLOM_TAHUN = ["id", "nama", tgl("tanggal_mulai"), tgl("tanggal_selesai"), "is_active"] as const;
const KOLOM_SEMESTER = ["id", "academic_year_id", "nama", tgl("tanggal_mulai"), tgl("tanggal_selesai")] as const;

export interface AcademicYearRow {
    readonly id: string;
    readonly nama: string;
    readonly tanggal_mulai: string;
    readonly tanggal_selesai: string;
    readonly is_active: boolean;
}

export type NamaSemester = "GANJIL" | "GENAP";

export interface AcademicTermRow {
    readonly id: string;
    readonly academic_year_id: string;
    readonly nama: NamaSemester;
    readonly tanggal_mulai: string;
    readonly tanggal_selesai: string;
}

export interface TermData {
    readonly nama: NamaSemester;
    readonly tanggalMulai: string;
    readonly tanggalSelesai: string;
}

export interface YearData {
    readonly nama: string;
    readonly tanggalMulai: string;
    readonly tanggalSelesai: string;
}

export class AcademicYearRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * Menserialkan setiap perubahan tahun ajaran. Tanpa ini, dua pembuatan
     * bersamaan pada tabel kosong sama-sama melihat "belum ada tahun ajaran" dan
     * sama-sama menjadi aktif (AC-YR-01), dan dua aktivasi bersamaan saling
     * menimpa. Kalender dikelola satu-dua Administrator — kunci tunggal cukup.
     */
    async lockKalender(ctx: AuthContext): Promise<void> {
        await sql`SELECT pg_advisory_xact_lock(${KUNCI_KALENDER})`.execute(this.query(ctx));
    }

    async list(ctx: AuthContext, page: number, perPage: number): Promise<{ rows: readonly AcademicYearRow[]; total: number }> {
        const [rows, hitung] = await Promise.all([
            this.query(ctx)
                .selectFrom("academic_years")
                .select(KOLOM_TAHUN)
                .orderBy(sql`tanggal_mulai`, "desc")
                .limit(perPage)
                .offset((page - 1) * perPage)
                .execute(),
            this.query(ctx)
                .selectFrom("academic_years")
                .select(sql<string>`count(*)`.as("total"))
                .executeTakeFirst(),
        ]);
        return { rows, total: Number(hitung?.total ?? 0) };
    }

    async findById(ctx: AuthContext, id: number): Promise<AcademicYearRow | undefined> {
        return this.query(ctx).selectFrom("academic_years").select(KOLOM_TAHUN).where("id", "=", String(id)).executeTakeFirst();
    }

    async findActive(ctx: AuthContext): Promise<AcademicYearRow | undefined> {
        return this.query(ctx).selectFrom("academic_years").select(KOLOM_TAHUN).where("is_active", "=", true).executeTakeFirst();
    }

    async count(ctx: AuthContext): Promise<number> {
        const baris = await this.query(ctx)
            .selectFrom("academic_years")
            .select(sql<string>`count(*)`.as("total"))
            .executeTakeFirst();
        return Number(baris?.total ?? 0);
    }

    async termsOf(ctx: AuthContext, yearIds: readonly string[]): Promise<readonly AcademicTermRow[]> {
        if (yearIds.length === 0) return [];
        return this.query(ctx)
            .selectFrom("academic_terms")
            .select(KOLOM_SEMESTER)
            .where("academic_year_id", "in", [...yearIds])
            .orderBy(sql`tanggal_mulai`, "asc")
            .execute();
    }

    async namaSudahDipakai(ctx: AuthContext, nama: string, kecualiId?: number): Promise<boolean> {
        let q = this.query(ctx).selectFrom("academic_years").select("id").where("nama", "=", nama);
        if (kecualiId !== undefined) q = q.where("id", "!=", String(kecualiId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    /** Nama tahun ajaran yang rentangnya beririsan (batas inklusif, sama dengan constraint `0016`). */
    async irisan(ctx: AuthContext, mulai: string, selesai: string, kecualiId?: number): Promise<string | undefined> {
        let q = this.query(ctx)
            .selectFrom("academic_years")
            .select("nama")
            .where(sql<boolean>`daterange(tanggal_mulai, tanggal_selesai, '[]') && daterange(${mulai}::date, ${selesai}::date, '[]')`);
        if (kecualiId !== undefined) q = q.where("id", "!=", String(kecualiId));
        return (await q.executeTakeFirst())?.nama;
    }

    async insertYear(ctx: AuthContext, data: YearData, aktif: boolean): Promise<AcademicYearRow> {
        return this.query(ctx)
            .insertInto("academic_years")
            .values({
                nama: data.nama,
                tanggal_mulai: data.tanggalMulai,
                tanggal_selesai: data.tanggalSelesai,
                is_active: aktif,
                created_by: ctx.userId,
            })
            .returning(KOLOM_TAHUN)
            .executeTakeFirstOrThrow();
    }

    async updateYear(ctx: AuthContext, id: number, data: YearData): Promise<AcademicYearRow> {
        return this.query(ctx)
            .updateTable("academic_years")
            .set({
                nama: data.nama,
                tanggal_mulai: data.tanggalMulai,
                tanggal_selesai: data.tanggalSelesai,
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .returning(KOLOM_TAHUN)
            .executeTakeFirstOrThrow();
    }

    async setActive(ctx: AuthContext, id: string | number, aktif: boolean): Promise<void> {
        await this.query(ctx)
            .updateTable("academic_years")
            .set({ is_active: aktif, updated_by: ctx.userId })
            .where("id", "=", String(id))
            .execute();
    }

    /**
     * Mengganti kedua semester. Dihapus semua lalu disisipkan ulang, bukan
     * di-UPDATE satu per satu: constraint `academic_terms_tidak_beririsan`
     * diperiksa per baris, sehingga menggeser Ganjil ke rentang Genap yang lama
     * ditolak sesaat sebelum Genap sempat ikut bergeser.
     */
    async replaceTerms(ctx: AuthContext, yearId: string | number, terms: readonly TermData[]): Promise<readonly AcademicTermRow[]> {
        await this.query(ctx).deleteFrom("academic_terms").where("academic_year_id", "=", String(yearId)).execute();
        return this.query(ctx)
            .insertInto("academic_terms")
            .values(
                terms.map((t) => ({
                    academic_year_id: yearId,
                    nama: t.nama,
                    tanggal_mulai: t.tanggalMulai,
                    tanggal_selesai: t.tanggalSelesai,
                    created_by: ctx.userId,
                })),
            )
            .returning(KOLOM_SEMESTER)
            .execute();
    }
}

export function createAcademicYearRepository(executor: QueryExecutor): AcademicYearRepository {
    return defineRepository(new AcademicYearRepository(executor));
}
