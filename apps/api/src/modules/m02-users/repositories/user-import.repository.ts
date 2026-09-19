// Repository `user_import_jobs` (IMPT-02, IMPT-03, SDD-AUTH-02). PRIVAT terhadap
// modul (SDD-SYS-03) — hanya services/ modul ini yang boleh memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

const KOLOM_RINGKAS = [
    "id",
    "nama_berkas",
    "status",
    "total_baris",
    "baris_terproses",
    "sukses",
    "gagal",
    "laporan_gagal",
    "pesan_galat",
    "selesai_pada",
    "created_at",
    "created_by",
] as const;

export interface ImportFailure {
    readonly baris: number;
    readonly email: string | null;
    readonly pesan: string;
}

export type ImportStatus = "MENUNGGU" | "BERJALAN" | "SELESAI" | "GAGAL";

/** Satu pekerjaan impor tanpa isi berkas (`berkas` dibaca terpisah, hanya worker). */
export interface ImportJobRow {
    readonly id: string;
    readonly nama_berkas: string;
    readonly status: ImportStatus;
    readonly total_baris: number;
    readonly baris_terproses: number;
    readonly sukses: number;
    readonly gagal: number;
    readonly laporan_gagal: readonly ImportFailure[];
    readonly pesan_galat: string | null;
    readonly selesai_pada: Date | null;
    readonly created_at: Date;
    readonly created_by: string | null;
}

export interface CreateImportJobData {
    readonly fileHash: string;
    readonly namaBerkas: string;
    readonly status: "MENUNGGU" | "BERJALAN";
    readonly totalBaris: number;
    /** Hanya untuk jalur asinkron; jalur sinkron memprosesnya di memori. */
    readonly berkas: Buffer | null;
}

export class UserImportRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * Kunci advisory tingkat transaksi atas hash berkas: dua unggahan berkas
     * identik yang bersamaan bergantian melewati pencarian idempotensi lalu
     * penyisipan, sehingga yang kedua pasti melihat yang pertama (IMPT-03).
     */
    async lockHash(ctx: AuthContext, fileHash: string): Promise<void> {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${fileHash}, 0))`.execute(
            this.query(ctx),
        );
    }

    /** Pekerjaan terbaru berhash sama sejak `sejak` yang tidak berakhir GAGAL (IMPT-03). */
    async findReplay(
        ctx: AuthContext,
        fileHash: string,
        sejak: Date,
    ): Promise<ImportJobRow | undefined> {
        return this.query(ctx)
            .selectFrom("user_import_jobs")
            .select(KOLOM_RINGKAS)
            .where("file_hash", "=", fileHash)
            .where("created_at", ">=", sejak)
            .where("status", "<>", "GAGAL")
            .orderBy("id", "desc")
            .limit(1)
            .executeTakeFirst();
    }

    async findById(ctx: AuthContext, id: number): Promise<ImportJobRow | undefined> {
        return this.query(ctx)
            .selectFrom("user_import_jobs")
            .select(KOLOM_RINGKAS)
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    async insert(ctx: AuthContext, data: CreateImportJobData): Promise<ImportJobRow> {
        return this.query(ctx)
            .insertInto("user_import_jobs")
            .values({
                file_hash: data.fileHash,
                nama_berkas: data.namaBerkas,
                status: data.status,
                total_baris: data.totalBaris,
                berkas: data.berkas,
                created_by: ctx.userId,
            })
            .returning(KOLOM_RINGKAS)
            .executeTakeFirstOrThrow();
    }

    /** Isi berkas untuk worker; `null` setelah pekerjaan berakhir (DP-03). */
    async findBerkas(ctx: AuthContext, id: number): Promise<Buffer | null | undefined> {
        const baris = await this.query(ctx)
            .selectFrom("user_import_jobs")
            .select("berkas")
            .where("id", "=", String(id))
            .executeTakeFirst();
        return baris?.berkas;
    }

    /** Menandai BERJALAN. Pekerjaan yang sudah berakhir tidak disentuh (worker idempoten). */
    async mulai(ctx: AuthContext, id: number): Promise<ImportJobRow | undefined> {
        return this.query(ctx)
            .updateTable("user_import_jobs")
            .set({ status: "BERJALAN", updated_by: ctx.userId })
            .where("id", "=", String(id))
            .where("status", "in", ["MENUNGGU", "BERJALAN"])
            .returning(KOLOM_RINGKAS)
            .executeTakeFirst();
    }

    /**
     * Titik lanjut: baris ke-`nomorUrut` selesai diproses. Dijalankan per baris,
     * sehingga percobaan ulang worker melanjutkan dari baris berikutnya dan tidak
     * membuat ulang pengguna yang sudah ada (JOB-06).
     */
    async catatBaris(
        ctx: AuthContext,
        id: number,
        nomorUrut: number,
        gagal: ImportFailure | null,
    ): Promise<void> {
        await this.query(ctx)
            .updateTable("user_import_jobs")
            .set({
                baris_terproses: nomorUrut,
                sukses: sql`sukses + ${gagal === null ? 1 : 0}`,
                gagal: sql`gagal + ${gagal === null ? 0 : 1}`,
                ...(gagal === null
                    ? {}
                    : {
                          laporan_gagal: sql`laporan_gagal || ${JSON.stringify([gagal])}::jsonb`,
                      }),
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .execute();
    }

    async selesai(ctx: AuthContext, id: number, sekarang: Date): Promise<ImportJobRow | undefined> {
        return this.tutup(ctx, id, "SELESAI", null, sekarang);
    }

    async gagalkan(
        ctx: AuthContext,
        id: number,
        pesan: string,
        sekarang: Date,
    ): Promise<ImportJobRow | undefined> {
        return this.tutup(ctx, id, "GAGAL", pesan, sekarang);
    }

    private async tutup(
        ctx: AuthContext,
        id: number,
        status: "SELESAI" | "GAGAL",
        pesan: string | null,
        sekarang: Date,
    ): Promise<ImportJobRow | undefined> {
        // Hanya pekerjaan yang masih terbuka: yang sudah berakhir tidak ditimpa
        // (pekerjaan SELESAI tidak berubah menjadi GAGAL oleh percobaan yang terlambat).
        return this.query(ctx)
            .updateTable("user_import_jobs")
            .set({
                status,
                pesan_galat: pesan,
                selesai_pada: sekarang,
                berkas: null,
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .where("status", "in", ["MENUNGGU", "BERJALAN"])
            .returning(KOLOM_RINGKAS)
            .executeTakeFirst();
    }
}

export const createUserImportRepository = (executor: QueryExecutor): UserImportRepository =>
    defineRepository(new UserImportRepository(executor));
