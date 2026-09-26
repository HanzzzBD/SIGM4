// Skema Zod M-04 (SDD-API-01, SDD-API-11, `m04-assets.md` §7).

import { z } from "zod";

/** Katalog `asset_condition`/`asset_status` (0002, Phase 00) — tabel `assets` belum ada. */
const AssetConditionSchema = z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"]);
const AssetStatusSchema = z.enum([
    "TERSEDIA",
    "DIRESERVASI",
    "DIPINJAM",
    "DALAM_PERBAIKAN",
    "TIDAK_TERSEDIA",
]);

const SumberPerolehanSchema = z.enum(["PEMBELIAN", "HIBAH", "BANTUAN_PEMERINTAH", "SUMBANGAN", "LAINNYA"]);

export const RoomIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

/**
 * `POST /assets` (FR-04.1 langkah 2-3, `m04-assets.md` §7). `jumlah_unit`
 * dibatasi sama dengan rentang impor massal (conventions.md E.5.1: 1-500).
 * Rentang wajar tahun (1900-2100) HANYA pagar teknis dasar — validasi bisnis
 * "1950 - tahun berjalan" adalah aturan jalur impor (E.5.1), belum diterapkan
 * di jalur manual ini.
 */
export const CreateAssetBodySchema = z.object({
    nama: z.string().trim().min(1).max(150),
    category_id: z.coerce.number().int().positive(),
    merek: z.string().trim().min(1).max(100).nullable().optional(),
    model: z.string().trim().min(1).max(100).nullable().optional(),
    nomor_seri: z.string().trim().min(1).max(100).nullable().optional(),
    tahun_perolehan: z.coerce.number().int().min(1900).max(2100),
    sumber_perolehan: SumberPerolehanSchema,
    nilai_perolehan: z.coerce.number().nonnegative().nullable().optional(),
    room_id: z.coerce.number().int().positive(),
    kondisi: z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"]),
    dapat_dipinjam: z.boolean().default(true),
    boleh_dipinjam_siswa: z.boolean().default(false),
    penanggung_jawab_id: z.coerce.number().int().positive().nullable().optional(),
    procurement_id: z.coerce.number().int().positive().nullable().optional(),
    jumlah_unit: z.coerce.number().int().min(1).max(500).default(1),
});

const AssetSchema = z.object({
    id: z.string(),
    uuid: z.string(),
    kode_barang: z.string(),
    nama: z.string(),
    category_id: z.string(),
    merek: z.string().nullable(),
    model: z.string().nullable(),
    nomor_seri: z.string().nullable(),
    tahun_perolehan: z.number(),
    sumber_perolehan: SumberPerolehanSchema,
    nilai_perolehan: z.string().nullable(),
    room_id: z.string(),
    kondisi: z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"]),
    status: z.enum(["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"]),
    dapat_dipinjam: z.boolean(),
    boleh_dipinjam_siswa: z.boolean(),
    penanggung_jawab_id: z.string().nullable(),
    procurement_id: z.string().nullable(),
    created_at: z.string(),
});

/** FR-04.1 langkah 6: daftar SELURUH unit yang baru dibuat (1..jumlah_unit). */
export const CreateAssetResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(AssetSchema),
    meta: z.object({ jumlah_unit: z.number() }),
});

/** `GET /rooms/{id}/assets` (FR-03.2 langkah 4). */
export const ListRoomAssetsQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
    kategori_id: z.coerce.number().int().positive().optional(),
    kondisi: AssetConditionSchema.optional(),
    status: AssetStatusSchema.optional(),
});

const AssetSummarySchema = z.object({
    kode_barang: z.string(),
    nama: z.string(),
    kondisi: AssetConditionSchema,
    status: AssetStatusSchema,
});

const RoomAssetsRingkasanSchema = z.object({
    total: z.number(),
    per_kondisi: z.record(AssetConditionSchema, z.number()),
    jumlah_dipinjam: z.number(),
    jumlah_dalam_perbaikan: z.number(),
});

/** FR-03.2 langkah 2-3: daftar aset ruangan + ringkasan kondisi/status. */
export const RoomAssetsResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        room_id: z.string(),
        assets: z.array(AssetSummarySchema),
        ringkasan: RoomAssetsRingkasanSchema,
    }),
    meta: z.object({
        page: z.number(),
        per_page: z.number(),
        total: z.number(),
        total_pages: z.number(),
    }),
});

/**
 * `sort` (SDD-API §4.5 allow-list): awalan `-` = menurun. Sama dengan
 * `AssetSortField` di repository — diulang di sini karena Zod (validasi
 * masukan) dan tipe TypeScript (repository) adalah dua lapisan berbeda yang
 * SENGAJA memvalidasi hal yang sama (SDD-API-01).
 */
const AssetSortSchema = z
    .enum(["created_at", "-created_at", "nama", "-nama", "kode_barang", "-kode_barang", "tahun_perolehan", "-tahun_perolehan"])
    .default("-created_at");

/** Query boolean `filter[dapat_dipinjam]` — pola `consent_wali` (`user-import.schema.ts`). */
const FilterBooleanSchema = z
    .preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(["true", "false"]).or(z.boolean()))
    .transform((v) => v === true || v === "true")
    .optional();

/**
 * `GET /assets` (FR-04.2 langkah 2-4, SDD-API §4.5). `q` mencari kode aset,
 * nama, merek, atau nomor seri (langkah 3); `filter[...]` menyaring kategori,
 * lokasi, kondisi, status, tahun perolehan, dan kelayakan pinjam (langkah 4).
 */
export const ListAssetsQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
    q: z.string().trim().min(1).max(150).optional(),
    sort: AssetSortSchema,
    kategori_id: z.coerce.number().int().positive().optional(),
    lokasi_id: z.coerce.number().int().positive().optional(),
    kondisi: AssetConditionSchema.optional(),
    status: AssetStatusSchema.optional(),
    tahun_perolehan: z.coerce.number().int().min(1900).max(2100).optional(),
    dapat_dipinjam: FilterBooleanSchema,
});

/**
 * Item katalog (FR-04.2). `sumber_perolehan`/`nilai_perolehan` OPSIONAL —
 * tidak pernah ter-SELECT bagi pemanggil tanpa `asset.view_financial`
 * (BR-073, SDD-AUTH-06) — bukan `null`, melainkan TIDAK ADA pada respons.
 */
const AssetCatalogItemSchema = z.object({
    id: z.string(),
    uuid: z.string(),
    kode_barang: z.string(),
    nama: z.string(),
    category_id: z.string(),
    merek: z.string().nullable(),
    model: z.string().nullable(),
    nomor_seri: z.string().nullable(),
    tahun_perolehan: z.number(),
    room_id: z.string(),
    kondisi: AssetConditionSchema,
    status: AssetStatusSchema,
    dapat_dipinjam: z.boolean(),
    boleh_dipinjam_siswa: z.boolean(),
    created_at: z.string(),
    sumber_perolehan: SumberPerolehanSchema.optional(),
    nilai_perolehan: z.string().nullable().optional(),
});

export const ListAssetsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(AssetCatalogItemSchema),
    meta: z.object({
        page: z.number(),
        per_page: z.number(),
        total: z.number(),
        total_pages: z.number(),
    }),
});
