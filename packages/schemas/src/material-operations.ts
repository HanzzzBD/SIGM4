import { z } from "zod";
const Id = z.number().int().positive(), Text = z.string().trim(), Quantity = Id.max(2147483647);
export const MaterialReceiptDocumentSchema = z.object({ file_id: Id, nama_berkas: Text.min(1).max(200) }).strict();
export const MaterialReceiptBodySchema = z.object({ room_id: Id, jumlah: Quantity, tanggal_terima: z.iso.date(), nomor_dokumen: Text.min(1).max(200), catatan: Text.max(2000).default(""), dokumen: z.array(MaterialReceiptDocumentSchema).min(1).max(10).refine(v => new Set(v.map(f => f.file_id)).size === v.length, { message: "Setiap dokumen hanya dipilih sekali." }) }).strict();
export const MaterialAdjustmentBodySchema = z.object({ room_id: Id, arah: z.enum(["TAMBAH", "KURANG"]), jumlah: Quantity, alasan: Text.min(1).max(2000) }).strict();
export const MaterialOperationSchema = z.object({ id: z.string(), material_id: z.string(), room_id: z.string(), jumlah: z.number(), transaction_id: z.string(), created_at: z.string() });
export const MaterialOperationResponseSchema = z.object({ success: z.literal(true), data: MaterialOperationSchema, meta: z.null() });
export type MaterialReceiptBody = z.output<typeof MaterialReceiptBodySchema>;
export type MaterialAdjustmentBody = z.output<typeof MaterialAdjustmentBodySchema>;

export const MaterialReceiptHistoryQuerySchema=z.object({page:z.coerce.number().int().positive().default(1),per_page:z.coerce.number().int().min(1).max(100).default(20)}).strict();
export const MaterialReceiptHistoryResponseSchema=z.object({success:z.literal(true),data:z.array(z.object({id:z.string(),jumlah:z.number(),tanggal_terima:z.string(),nomor_dokumen:z.string(),catatan:z.string().nullable(),lokasi:z.string(),pelaksana:z.string(),created_at:z.string(),dokumen:z.array(z.object({file_id:z.string(),nama_berkas:z.string(),status:z.string(),url:z.url().nullable()}))})),meta:z.object({page:z.number(),per_page:z.number(),total:z.number(),total_pages:z.number()})});
