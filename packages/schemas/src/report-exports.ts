import { z } from "zod";
import { ReservationListQuerySchema } from "./reservation.js";
import { DamageReportListQuerySchema } from "./damage-reports.js";
export const ExportFormatSchema = z.enum(["XLSX", "PDF"]);
export const ReservationExportBodySchema = z.object({ format: ExportFormatSchema, filter: ReservationListQuerySchema.omit({ page: true, per_page: true }).strict() }).strict();
export const DamageExportBodySchema = z.object({ format: ExportFormatSchema, filter: DamageReportListQuerySchema.omit({ page: true, per_page: true, melampaui_sla: true }).extend({ melampaui_sla: z.enum(["true", "false"]).optional() }) }).strict();
export const ReportExportSchema = z.object({
    id: z.string().regex(/^\d+$/), jenis: z.string(), judul: z.string(), format: ExportFormatSchema,
    status: z.enum(["MENUNGGU", "BERJALAN", "SIAP", "GAGAL", "KEDALUWARSA", "DIBATALKAN"]),
    jumlah_baris: z.number().int().nonnegative().nullable(), pesan_galat: z.string().nullable(),
    dibuat_pada: z.iso.datetime(), selesai_pada: z.iso.datetime().nullable(), berlaku_sampai: z.iso.datetime().nullable(),
});
export const ReportExportResponseSchema = z.object({ success: z.literal(true), data: ReportExportSchema, meta: z.null() });
export const ReportExportListResponseSchema = z.object({ success: z.literal(true), data: z.array(ReportExportSchema), meta: z.null() });
export const ReportExportDownloadResponseSchema = z.object({ success: z.literal(true), data: z.object({ url: z.url(), expires_at: z.iso.datetime(), nama_berkas: z.string() }), meta: z.null() });
export type ReportExport = z.infer<typeof ReportExportSchema>;

export const AnalyticsFilterOptionsResponseSchema = z.object({ success: z.literal(true), data: z.object({ rooms: z.array(z.object({id:z.string(),nama:z.string()})), categories: z.array(z.object({id:z.string(),nama:z.string()})), units: z.array(z.object({id:z.string(),nama:z.string()})), roles: z.array(z.object({id:z.string(),nama:z.string()})) }), meta: z.null() });
