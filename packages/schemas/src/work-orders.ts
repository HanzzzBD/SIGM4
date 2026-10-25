import { z } from "zod";

export const WorkOrderAssignmentSchema = z.object({
    teknisi_id: z.number().int().positive(),
    target_selesai: z.iso.date(),
    estimasi_biaya: z.number().nonnegative().max(999999999999).default(0),
    nonaktifkan_aset: z.boolean().default(true),
}).strict();
export const WorkOrderCreateSchema = WorkOrderAssignmentSchema.extend({
    asset_id: z.number().int().positive().optional(),
    room_id: z.number().int().positive().optional(),
    damage_report_id: z.number().int().positive().optional(),
    deskripsi: z.string().trim().min(1).max(5000),
    prioritas: z.enum(["RENDAH", "SEDANG", "TINGGI", "KRITIS"]),
}).refine(v => v.damage_report_id !== undefined || ((v.asset_id !== undefined) !== (v.room_id !== undefined)), { path: ["asset_id"], message: "Pilih tepat satu aset atau ruangan, atau tiket kerusakan." });
export type WorkOrderCreate = z.output<typeof WorkOrderCreateSchema>;
export type WorkOrderAssignment = z.output<typeof WorkOrderAssignmentSchema>;
export const WorkOrderQuerySchema = z.object({ page: z.coerce.number().int().positive().default(1), per_page: z.coerce.number().int().min(1).max(100).default(20) }).strict();
export const WorkOrderResponseSchema = z.object({ success: z.literal(true), data: z.object({
    id: z.string(), nomor: z.string(), jenis: z.literal("KOREKTIF"),
    asset_id: z.string().nullable(), room_id: z.string().nullable(), damage_report_id: z.string().nullable(),
    teknisi_id: z.string(), prioritas: z.enum(["RENDAH", "SEDANG", "TINGGI", "KRITIS"]),
    deskripsi: z.string(), target_selesai: z.string(), estimasi_biaya: z.string().nullable(), status: z.string(),
    garansi_aktif: z.boolean().nullable(),
}), meta: z.null() });
