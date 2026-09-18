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

export const RoomIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
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
