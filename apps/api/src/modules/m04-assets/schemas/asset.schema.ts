// Skema Zod M-04 (SDD-API-01, SDD-API-11). Modul lahir PERTAMA kali di sini
// dengan satu endpoint kerangka (FR-03.2, `m04-assets.md` §7) — tabel `assets`
// sendiri baru lahir `PR-02-10` (Phase 02).

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

/**
 * `GET /rooms/{id}/assets` (FR-03.2 langkah 4). Filter DITERIMA dan divalidasi
 * agar kontrak API tidak berubah saat Phase 02 (`PR-02-10`) mengisinya dengan
 * data sungguhan — lihat `AssetService.listByRoom` untuk kerangkanya.
 */
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

/** FR-03.2 langkah 2-3 — kerangka: `data.assets` selalu kosong sampai `PR-02-10`. */
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
