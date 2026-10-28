// Repository kategori aset (FR-04.5; SDD-AUTH-02, PM-03). PRIVAT terhadap
// modul — hanya services/category.service.ts yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

const KOLOM_KATEGORI = [
    "id",
    "parent_id",
    "nama",
    "kode",
    "umur_teknis_tahun",
    "interval_preventif_hari",
    "created_at",
    "updated_at",
] as const;

export interface KategoriAsetRow {
    readonly id: string;
    readonly parent_id: string | null;
    readonly nama: string;
    readonly kode: string;
    readonly umur_teknis_tahun: number | null;
    readonly interval_preventif_hari: number | null;
    readonly created_at: Date;
    readonly updated_at: Date;
}

export interface KategoriFields {
    readonly nama: string;
    readonly kode: string;
    readonly parentId: number | null;
    readonly umurTeknisTahun: number | null;
    readonly intervalPreventifHari: number | null;
}

export class CategoryRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Terpaginasi (SDD-PERF-04), `total` lewat `COUNT(*) OVER()` (SDD-API §4.5). */
    async list(
        ctx: AuthContext,
        page: number,
        perPage: number,
    ): Promise<{ rows: readonly KategoriAsetRow[]; total: number }> {
        const rows = await this.query(ctx)
            .selectFrom("asset_categories")
            .select([
                ...KOLOM_KATEGORI,
                sql<string>`count(*) over()`.as("total"),
            ])
            .orderBy("kode")
            .orderBy("id")
            .limit(perPage)
            .offset((page - 1) * perPage)
            .execute();
        return {
            rows: rows.map((baris) => {
                const sisanya: Partial<typeof baris> = { ...baris };
                delete sisanya.total;
                return sisanya as KategoriAsetRow;
            }),
            total: rows.length > 0 ? Number(rows[0]?.total) : 0,
        };
    }

    async findById(
        ctx: AuthContext,
        id: number,
    ): Promise<KategoriAsetRow | undefined> {
        return this.query(ctx)
            .selectFrom("asset_categories")
            .select(KOLOM_KATEGORI)
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    /** FR-04.5 A1: kode duplikat ditolak dengan pesan spesifik sebelum INSERT/UPDATE. */
    async existsKode(
        ctx: AuthContext,
        kode: string,
        kecualiId: number | null,
    ): Promise<boolean> {
        let q = this.query(ctx)
            .selectFrom("asset_categories")
            .select("id")
            .where("kode", "=", kode);
        if (kecualiId !== null) q = q.where("id", "<>", String(kecualiId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    /** FR-04.5 A2/A4: aset TERMASUK yang dihapuskan — barisnya tetap ada (BR-008) dan tetap berkode. */
    async countAssets(ctx: AuthContext, id: number): Promise<number> {
        const baris = await this.query(ctx)
            .selectFrom("assets")
            .select(sql<string>`count(*)`.as("n"))
            .where("category_id", "=", String(id))
            .executeTakeFirst();
        return Number(baris?.n ?? 0);
    }

    /** FR-04.5 A3. */
    async countChildren(ctx: AuthContext, id: number): Promise<number> {
        const baris = await this.query(ctx)
            .selectFrom("asset_categories")
            .select(sql<string>`count(*)`.as("n"))
            .where("parent_id", "=", String(id))
            .executeTakeFirst();
        return Number(baris?.n ?? 0);
    }

    /**
     * Apakah `id` ada di jalur leluhur `calonInduk` (termasuk dirinya)? Bila ya,
     * menjadikan `calonInduk` induk `id` membentuk siklus. Kedalaman tak dibatasi
     * — AC FR-04.5 "minimal dua tingkat".
     */
    async wouldCycle(
        ctx: AuthContext,
        id: number,
        calonInduk: number,
    ): Promise<boolean> {
        const hasil = await sql<{ ada: boolean }>`
            WITH RECURSIVE leluhur AS (
                SELECT id, parent_id FROM asset_categories WHERE id = ${calonInduk}
                UNION ALL
                SELECT c.id, c.parent_id FROM asset_categories c JOIN leluhur l ON c.id = l.parent_id
            )
            SELECT EXISTS (SELECT 1 FROM leluhur WHERE id = ${id}) AS ada
        `.execute(this.query(ctx));
        return hasil.rows[0]?.ada === true;
    }

    async insert(
        ctx: AuthContext,
        data: KategoriFields,
    ): Promise<KategoriAsetRow> {
        return this.query(ctx)
            .insertInto("asset_categories")
            .values({
                nama: data.nama,
                kode: data.kode,
                parent_id: data.parentId,
                umur_teknis_tahun: data.umurTeknisTahun,
                interval_preventif_hari: data.intervalPreventifHari,
                created_by: ctx.userId,
                updated_by: ctx.userId,
            })
            .returning(KOLOM_KATEGORI)
            .executeTakeFirstOrThrow();
    }

    async update(
        ctx: AuthContext,
        id: number,
        data: KategoriFields,
    ): Promise<KategoriAsetRow> {
        return this.query(ctx)
            .updateTable("asset_categories")
            .set({
                nama: data.nama,
                kode: data.kode,
                parent_id: data.parentId,
                umur_teknis_tahun: data.umurTeknisTahun,
                interval_preventif_hari: data.intervalPreventifHari,
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .returning(KOLOM_KATEGORI)
            .executeTakeFirstOrThrow();
    }

    async delete(ctx: AuthContext, id: number): Promise<void> {
        await this.query(ctx)
            .deleteFrom("asset_categories")
            .where("id", "=", String(id))
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createCategoryRepository(
    executor: QueryExecutor,
): CategoryRepository {
    return defineRepository(new CategoryRepository(executor));
}
