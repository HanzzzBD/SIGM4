import { z } from "zod";
import { WorkOrderResponseSchema } from "./work-orders.js";

export const WORK_ORDER_STATUSES = ["DITUGASKAN","DIKERJAKAN","TERTUNDA","MENUNGGU_VERIFIKASI","SELESAI","DIBATALKAN","TIDAK_DAPAT_DIPERBAIKI"] as const;
export const WorkOrderChecklistSchema = z.array(z.object({ id: z.string().min(1).max(100), label: z.string().min(1).max(500), selesai: z.boolean() }).strict()).max(100).refine(items => new Set(items.map(i=>i.id)).size===items.length, {message:"ID checklist tidak boleh berulang."});
export const WorkOrderCostInputSchema = z.object({ deskripsi: z.string().trim().min(1).max(500), jumlah: z.number().positive().max(999999).multipleOf(0.001), harga_satuan: z.number().nonnegative().max(999999999).multipleOf(0.01) }).strict();
export const WorkOrderProgressSchema = z.object({
 catatan_teknisi: z.string().trim().min(1).max(5000).optional(),
 checklist: z.array(z.object({ id:z.string().min(1).max(100), selesai:z.boolean() }).strict()).max(100).optional(),
 biaya: z.array(WorkOrderCostInputSchema).max(100).optional(),
}).strict().refine(v=>Object.keys(v).length>0,{message:"Isi perubahan progres."});
export const WorkOrderPhotoInputSchema = z.object({foto_file_ids:z.array(z.number().int().positive()).min(1).max(10).refine(ids=>new Set(ids).size===ids.length,{message:"Foto tidak boleh berulang."})}).strict();
export const WorkOrderPauseSchema = z.object({ alasan:z.string().trim().min(1).max(1000), tanggal_lanjut:z.iso.date() }).strict();
export const WorkOrderIrreparableSchema = z.object({rekomendasi:z.string().trim().min(1).max(2000)}).strict();
export const WorkOrderCompleteSchema = z.object({hasil:z.string().trim().min(1).max(5000)}).strict();
export const WorkOrderVerifySchema = z.object({
 keputusan:z.enum(["TUTUP","KEMBALIKAN"]), catatan:z.string().trim().min(1).max(2000).optional(),
 kondisi_pasca:z.enum(["BAIK","RUSAK_RINGAN","RUSAK_BERAT"]).optional(),
}).strict().refine(v=>v.keputusan!=="KEMBALIKAN"||v.catatan!==undefined,{path:["catatan"],message:"Catatan pengembalian wajib diisi."});
export const WorkOrderEstimateSchema = z.object({estimasi:z.number().nonnegative().max(999999999999).multipleOf(0.01), alasan:z.string().trim().min(1).max(2000)}).strict();
export const WorkOrderEstimateDecisionSchema = z.object({keputusan:z.enum(["DISETUJUI","DITOLAK"]),catatan:z.string().trim().min(1).max(2000)}).strict();
export const WorkOrderListQuerySchema = z.object({
 page:z.coerce.number().int().positive().default(1),per_page:z.coerce.number().int().min(1).max(100).default(20),
 q:z.string().trim().max(100).optional(),status:z.enum(WORK_ORDER_STATUSES).optional(),jenis:z.enum(["KOREKTIF","PREVENTIF"]).optional(),
 prioritas:z.enum(["RENDAH","SEDANG","TINGGI","KRITIS"]).optional(),teknisi_id:z.coerce.number().int().positive().optional(),
 asset_id:z.coerce.number().int().positive().optional(),
 dari:z.iso.date().optional(),sampai:z.iso.date().optional(),urut:z.enum(["prioritas","target_selesai"]).default("prioritas"),
}).strict().refine(v=>!v.dari||!v.sampai||v.dari<=v.sampai,{path:["sampai"],message:"Rentang tanggal tidak sah."});
const Time=z.iso.datetime({offset:true}).nullable();
export const WorkOrderDetailSchema = WorkOrderResponseSchema.shape.data.extend({
 menunggu_ketersediaan_aset:z.boolean().optional(),maintenance_schedule_id:z.string().nullable().optional(),
 jenis:z.enum(["KOREKTIF","PREVENTIF"]),status:z.enum(WORK_ORDER_STATUSES),
 objek:z.object({jenis:z.enum(["ASET","RUANGAN"]),id:z.string(),label:z.string(),kode:z.string().nullable()}),
 teknisi:z.object({id:z.string(),nama:z.string()}),checklist:WorkOrderChecklistSchema,
 waktu_mulai:Time,waktu_selesai:Time,created_at:z.iso.datetime({offset:true}),
 catatan_teknisi:z.string().nullable(),hasil:z.string().nullable(),biaya:z.string().nullable(),
 rincian_biaya:z.array(z.object({id:z.string(),deskripsi:z.string(),jumlah:z.string(),harga_satuan:z.string(),total:z.string()})),
 foto:z.array(z.object({file_id:z.string(),urutan:z.number(),status:z.string(),url:z.string().nullable()})),foto_tertunda:z.number(),
 alasan_tertunda:z.string().nullable(),tanggal_lanjut:z.string().nullable(),rekomendasi:z.string().nullable(),
 kondisi_pasca:z.string().nullable(),diverifikasi_pada:Time,catatan_verifikasi:z.string().nullable(),
 estimasi_diusulkan:z.string().nullable(),status_estimasi:z.enum(["TIDAK_ADA","MENUNGGU","DISETUJUI","DITOLAK"]),alasan_estimasi:z.string().nullable(),
 foto_pelapor:z.array(z.object({file_id:z.string(),url:z.string().nullable(),status:z.string()})),
});
export const WorkOrderDetailResponseSchema=z.object({success:z.literal(true),data:WorkOrderDetailSchema,meta:z.null()});
export const WorkOrderListItemSchema=WorkOrderResponseSchema.shape.data.omit({garansi_aktif:true}).extend({jenis:z.enum(["KOREKTIF","PREVENTIF"]),status:z.enum(WORK_ORDER_STATUSES),objek_label:z.string(),teknisi_nama:z.string(),foto_tertunda:z.number(),created_at:z.iso.datetime({offset:true})});
export const WorkOrderListResponseSchema=z.object({success:z.literal(true),data:z.array(WorkOrderListItemSchema),meta:z.object({page:z.number(),per_page:z.number(),total:z.number(),total_pages:z.number(),teknisi:z.array(z.object({id:z.string(),nama:z.string()})).optional()})});
export const ServiceHistoryResponseSchema=z.object({success:z.literal(true),data:z.object({
 work_orders:z.array(z.object({id:z.string(),nomor:z.string(),jenis:z.string(),status:z.string(),deskripsi:z.string(),teknisi_nama:z.string(),created_at:z.iso.datetime({offset:true}),waktu_mulai:Time,waktu_selesai:Time,diverifikasi_pada:Time,biaya:z.string().nullable(),hasil:z.string().nullable()})),
 total_biaya:z.string().nullable(),jumlah_perbaikan:z.number(),rata_interval_hari:z.number().nullable(),cakupan:z.enum(["SEMUA","PENUGASAN_SAYA"]).optional(),
 rekomendasi_penggantian:z.boolean().nullable(),ambang_terkonfigurasi:z.boolean(),
}),meta:z.object({page:z.number(),per_page:z.number(),total:z.number(),total_pages:z.number()})});
export type WorkOrderDetail=z.infer<typeof WorkOrderDetailSchema>;
export type WorkOrderListItem=z.infer<typeof WorkOrderListItemSchema>;
export type WorkOrderListQuery=z.output<typeof WorkOrderListQuerySchema>;
export type WorkOrderProgress=z.infer<typeof WorkOrderProgressSchema>;
