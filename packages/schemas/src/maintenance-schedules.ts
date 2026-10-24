import { z } from "zod";

export const MaintenanceScheduleInputSchema = z.object({
    nama: z.string().trim().min(1).max(200),
    asset_id: z.number().int().positive().optional(),
    category_id: z.number().int().positive().optional(),
    interval_hari: z.number().int().min(1).max(3650),
    tanggal_mulai: z.iso.date(),
    checklist: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
    teknisi_default_id: z.number().int().positive(),
}).strict().refine(v => (v.asset_id !== undefined) !== (v.category_id !== undefined), { path: ["asset_id"], message: "Pilih satu aset atau kategori." });
export type MaintenanceScheduleInput = z.infer<typeof MaintenanceScheduleInputSchema>;
export const MaintenanceScheduleQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1), per_page: z.coerce.number().int().min(1).max(100).default(20),
    "filter[status]": z.enum(["AKTIF", "NONAKTIF"]).optional(),
    "filter[jatuh_tempo_hari]": z.coerce.number().int().min(0).max(3650).optional(),
}).strict();
export const MaintenanceReasonSchema = z.object({ alasan: z.string().trim().min(1).max(2000) }).strict();
export const MaintenanceScheduleSchema = z.object({
    id: z.string(), nama: z.string(), asset_id: z.string().nullable(), category_id: z.string().nullable(),
    interval_hari: z.number(), tanggal_mulai: z.string(), checklist: z.array(z.string()), teknisi_default_id: z.string(),
    status: z.enum(["AKTIF", "NONAKTIF"]), jatuh_tempo_berikutnya: z.string().nullable(),
    nama_aset: z.string().nullable().optional(), nama_kategori: z.string().nullable().optional(), nama_teknisi: z.string().optional(),
});
export const MaintenanceScheduleResponseSchema = z.object({ success: z.literal(true), data: MaintenanceScheduleSchema, meta: z.null() });
export const MaintenanceScheduleListSchema = z.object({ success: z.literal(true), data: z.array(MaintenanceScheduleSchema), meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }) });
