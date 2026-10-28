import { z } from "zod";
const Id = z.number().int().positive();
export const StocktakeConditionSchema = z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"]);
export const StocktakeCreateSchema = z.object({
    domain:z.enum(["ASET","BAHAN"]).optional(),
    nama: z.string().trim().min(1).max(200), periode_mulai: z.iso.date(), periode_selesai: z.iso.date(),
    cakupan: z.object({ jenis: z.enum(["SEKOLAH", "GEDUNG", "RUANGAN", "KATEGORI"]), id: Id.optional(), category_id: Id.optional() }).strict().refine(v => v.jenis === "SEKOLAH" || v.id !== undefined, { message: "Pilih cakupan." }),
    pelaksana_ids: z.array(Id).min(1).max(20).refine(v => new Set(v).size === v.length, "Pelaksana tidak boleh berulang."),
}).strict().refine(v => v.periode_mulai <= v.periode_selesai, { path: ["periode_selesai"], message: "Periode selesai harus sesudah mulai." }).refine(v=>v.domain!=="BAHAN"||v.cakupan.jenis!=="KATEGORI"&&v.cakupan.category_id===undefined,{path:["cakupan"],message:"Opname Bahan memakai cakupan lokasi penyimpanan, tanpa kategori Aset."});
export type StocktakeCreate = z.infer<typeof StocktakeCreateSchema>;
export const StocktakeScanSchema = z.object({ client_scan_id: z.uuid(), asset_id: Id, room_id: Id, kondisi: StocktakeConditionSchema, catatan: z.string().trim().max(2000).default(""), foto_file_ids: z.array(Id).max(5).default([]) }).strict();
export type StocktakeScan = z.output<typeof StocktakeScanSchema>;
export const StocktakeFindingSchema = z.object({ client_scan_id: z.uuid(), deskripsi: z.string().trim().min(1).max(2000), category_id: Id, room_id: Id, kondisi: StocktakeConditionSchema, foto_file_ids: z.array(Id).max(5).default([]) }).strict();
export type StocktakeFinding = z.output<typeof StocktakeFindingSchema>;
export const StocktakeReconcileSchema = z.object({
    keterangan: z.string().trim().min(1).max(2000), tindakan: z.enum(["SESUAI", "SESUAIKAN", "HILANG", "TANPA_PENYESUAIAN"]),
    basis: z.object({ room_id: Id, kondisi: StocktakeConditionSchema }).strict(),
}).strict();
export const StocktakeFindingReviewSchema = z.object({
    keterangan: z.string().trim().min(1).max(2000), nama: z.string().trim().min(1).max(200), category_id: Id, room_id: Id,
    kondisi: StocktakeConditionSchema, tahun_perolehan: z.number().int().min(1900).max(2100),
    sumber_perolehan: z.enum(["PEMBELIAN", "HIBAH", "BANTUAN_PEMERINTAH", "SUMBANGAN", "LAINNYA"]), nilai_perolehan: z.number().nonnegative().max(999999999999).nullable(),
}).strict();
export const StocktakeReasonSchema = z.object({ alasan: z.string().trim().min(1).max(2000) }).strict();
export const StocktakeQuerySchema = z.object({ page: z.coerce.number().int().positive().default(1), per_page: z.coerce.number().int().min(1).max(500).default(20), room_id: z.coerce.number().int().positive().optional(), status: z.enum(["BERJALAN", "MENUNGGU_PERSETUJUAN", "SELESAI", "DIBATALKAN"]).optional(), hanya_selisih: z.enum(["true", "false"]).optional() }).strict();
export const StocktakeSessionSchema = z.object({
    id: z.string(), nomor: z.string(), nama: z.string(), domain: z.enum(["ASET","BAHAN"]), periode_mulai: z.string(), periode_selesai: z.string(),
    cakupan: StocktakeCreateSchema.shape.cakupan, status: z.enum(["BERJALAN", "MENUNGGU_PERSETUJUAN", "SELESAI", "DIBATALKAN"]),
    created_by: z.string().nullable(), finalized_at: z.string().nullable(), catatan_keputusan: z.string().nullable(), disetujui_oleh: z.string().nullable(), disetujui_pada: z.string().nullable(),
    target: z.number(), diperiksa: z.number(), selisih: z.number(), temuan_baru: z.number(),
    belum_dilengkapi: z.number(), temuan_belum_dilengkapi: z.number(), foto_tertunda: z.number(),
    pelaksana: z.array(z.object({ id: z.string(), nama: z.string() })),
    lokasi: z.array(z.object({ id: z.string(), nama: z.string(), selesai: z.boolean(), target: z.number(), diperiksa: z.number() })),
    report_status: z.enum(["BELUM", "MENUNGGU", "SIAP", "GAGAL"]),
});
export type StocktakeSession = z.infer<typeof StocktakeSessionSchema>;
export const StocktakeItemSchema = z.object({
    id: z.string(), asset_id: z.string(), nama: z.string(), kode_barang: z.string(), uuid: z.string(),
    room_id_sistem: z.string(), lokasi_sistem: z.string(), kondisi_sistem: StocktakeConditionSchema, status_sistem: z.string(),
    room_id_aktual: z.string().nullable(), kondisi_aktual: StocktakeConditionSchema.nullable(),
    lokasi_aktual: z.string().nullable().default(null), lokasi_sekarang: z.string().default(""),
    hasil: z.enum(["BELUM_DIPERIKSA", "DITEMUKAN", "SALAH_LOKASI", "PERBEDAAN_KONDISI", "TIDAK_DITEMUKAN", "DIPINJAM"]),
    salah_lokasi: z.boolean(), beda_kondisi: z.boolean(), keterangan: z.string().nullable(), tindakan: z.string().nullable(),
    room_id_sekarang: z.string(), kondisi_sekarang: StocktakeConditionSchema, diperiksa_oleh: z.string().nullable(), diperiksa_pada: z.string().nullable(),
    catatan: z.string().nullable(), foto_tertunda: z.number(),
});
export type StocktakeItem = z.infer<typeof StocktakeItemSchema>;
export const StocktakeNewFindingSchema = z.object({ id: z.string(), deskripsi: z.string(), category_id: z.string(), room_id: z.string(), kondisi: StocktakeConditionSchema, keterangan: z.string().nullable(), pendaftaran: StocktakeFindingReviewSchema.nullable(), asset_id_hasil: z.string().nullable(), foto_tertunda: z.number() });
export type StocktakeNewFinding = z.infer<typeof StocktakeNewFindingSchema>;
export const StocktakeMetaSchema = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });
export const StocktakeResponseSchema = z.object({ success: z.literal(true), data: StocktakeSessionSchema, meta: z.null() });
export const StocktakeListSchema = z.object({ success: z.literal(true), data: z.array(StocktakeSessionSchema), meta: StocktakeMetaSchema });
export const StocktakeItemsSchema = z.object({ success: z.literal(true), data: z.array(StocktakeItemSchema), meta: StocktakeMetaSchema });
export const StocktakeFindingsSchema = z.object({ success: z.literal(true), data: z.array(StocktakeNewFindingSchema), meta: StocktakeMetaSchema });
export const StocktakeScanResponseSchema = z.object({ success: z.literal(true), data: z.object({ item_id: z.string(), duplicate: z.boolean(), hasil: z.string() }), meta: z.null() });
