// FR-08.1, AV-03: katalog ketersediaan berbasis rentang, bukan status operasional.
import { z } from "zod";

const positive = z.coerce.number().int().positive().safe();
export const AssetAvailabilityQuerySchema = z.object({
    dari: z.iso.datetime({ offset: true }),
    sampai: z.iso.datetime({ offset: true }),
    q: z.string().trim().max(100).optional(),
    kategori_id: positive.optional(),
    hanya_tersedia: z.enum(["true", "false"]).optional(),
    sort: z.enum(["nama", "-nama", "tersedia", "-tersedia"]).default("nama"),
    page: positive.default(1),
    per_page: positive.max(100).default(25),
}).superRefine((q, ctx) => {
    const duration = Date.parse(q.sampai) - Date.parse(q.dari);
    if (duration <= 0)
        ctx.addIssue({ code: "custom", path: ["sampai"], message: "Waktu akhir harus sesudah waktu awal." });
});
const UnitSchema = z.object({ id: z.string(), kode_barang: z.string(), kondisi: z.enum(["BAIK", "RUSAK_RINGAN"]), tersedia: z.boolean(), tersedia_mulai: z.iso.datetime({ offset: true }).nullable() });
export const AssetAvailabilityGroupSchema = z.object({
    key: z.string(), nama: z.string(), merek: z.string().nullable(), model: z.string().nullable(),
    kategori: z.object({ id: z.string(), nama: z.string() }),
    jumlah_unit: z.number().int().nonnegative(), jumlah_tersedia: z.number().int().nonnegative(),
    tersedia_mulai: z.iso.datetime({ offset: true }).nullable(),
    foto_url: z.string().nullable(), unit: z.array(UnitSchema),
});
export const AssetAvailabilityResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ dari: z.iso.datetime({ offset: true }), sampai: z.iso.datetime({ offset: true }), zona_waktu: z.literal("Asia/Jakarta"), horizon_sampai: z.iso.datetime({ offset: true }), kategori: z.array(z.object({ id: z.string(), nama: z.string() })), kelompok: z.array(AssetAvailabilityGroupSchema) }),
    meta: z.object({ page: z.number().int(), per_page: z.number().int(), total: z.number().int(), total_pages: z.number().int() }),
});
export type AssetAvailabilityQuery = z.infer<typeof AssetAvailabilityQuerySchema>;
export type AssetAvailabilityGroup = z.infer<typeof AssetAvailabilityGroupSchema>;
export type AssetAvailabilityResponse = z.infer<typeof AssetAvailabilityResponseSchema>;
