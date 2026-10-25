import { z } from "zod";
import { LoanExtensionSchema } from "./loan-management.js";

const Id = z.number().int().positive().safe();
const Text = z.string().trim().min(1, "Isian wajib diisi.");
const Photos = z.array(Id).min(1, "Minimal satu foto wajib ada.").max(5).refine((ids) => new Set(ids).size === ids.length, "Foto tidak boleh berulang.");
export const LoanStatusSchema = z.enum(["DIPINJAM", "SEBAGIAN_DIKEMBALIKAN", "DIKEMBALIKAN", "TERLAMBAT", "HILANG"]);
const CheckoutUnit = z.object({
    asset_id: Id, allocated_asset_id: Id.optional(), verification_code: Text.max(100),
    kondisi_awal: z.enum(["BAIK", "RUSAK_RINGAN"]), foto_file_ids: Photos,
    alasan_substitusi: Text.max(500).optional(),
    alasan_kondisi_awal: Text.max(500).optional(),
}).strict();
export const LoanCheckoutBodySchema = z.object({
    reservation_id: Id.optional(),
    langsung: z.object({ peminjam_id: Id, tanggal_jatuh_tempo: z.iso.datetime({ offset: true }), keperluan: Text.max(1000), lokasi_penggunaan: Text.max(200), alasan: Text.max(500) }).strict().optional(),
    nama_penerima: Text.max(200), diwakilkan: z.boolean().default(false), signature_file_id: Id,
    unit: z.array(CheckoutUnit).min(1).max(100),
}).strict().superRefine((b, ctx) => {
    if ((b.reservation_id === undefined) === (b.langsung === undefined)) ctx.addIssue({ code: "custom", path: ["reservation_id"], message: "Pilih reservasi disetujui atau peminjaman langsung." });
    if (new Set(b.unit.map((u) => u.asset_id)).size !== b.unit.length) ctx.addIssue({ code: "custom", path: ["unit"], message: "Unit fisik tidak boleh berulang." });
});
export const LoanCheckinBodySchema = z.object({ unit: z.array(z.object({
    loan_item_id: Id, verification_code: Text.max(100),
    kondisi_akhir: z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "TIDAK_LENGKAP", "HILANG"]),
    foto_file_ids: Photos, catatan: z.string().trim().max(1000).optional(), kelalaian: z.boolean().default(false),
}).strict()).min(1).max(100) }).strict().superRefine((b, ctx) => {
    if (new Set(b.unit.map((u) => u.loan_item_id)).size !== b.unit.length) ctx.addIssue({ code: "custom", path: ["unit"], message: "Unit pengembalian tidak boleh berulang." });
    for (const [i, unit] of b.unit.entries()) if ((unit.kondisi_akhir !== "BAIK" || unit.kelalaian) && !unit.catatan?.trim()) ctx.addIssue({ code: "custom", path: ["unit", i, "catatan"], message: "Catatan wajib untuk kerusakan, kehilangan, atau kelalaian." });
});
export const LoanIdSchema = z.object({ id: z.coerce.number().int().positive().safe() });
export const LoanUuidSchema = z.object({ uuid: z.uuid() });
export const LoanPageQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1), per_page: z.coerce.number().int().min(1).max(100).default(25), reservation_id: z.coerce.number().int().positive().safe().optional() });
export const LoanResolveQuerySchema = z.object({ code: Text.max(100) });
export const LoanBorrowerQuerySchema = z.object({ q: z.string().trim().max(100).default(""), page: z.coerce.number().int().min(1).default(1) });
const Photo = z.object({ file_id: z.string(), status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]), url: z.string().nullable() });
const Fine = z.object({ id: z.string(), jenis: z.enum(["KETERLAMBATAN", "GANTI_RUGI"]), jumlah: z.string().nullable(), hari_terlambat: z.number(), tarif_per_hari: z.string(), jumlah_sebelum_cap: z.string().nullable(), status: z.string(), menunggu_penetapan: z.boolean() });
export const LoanDetailSchema = z.object({
    id: z.string(), nomor: z.string(), reservation_id: z.string(), nomor_reservasi: z.string(),
    peminjam: z.object({ id: z.string(), nama: z.string() }), petugas: z.object({ id: z.string(), nama: z.string() }),
    nama_penerima: z.string(), diwakilkan: z.boolean(), bypass_approval: z.boolean(), alasan_bypass: z.string().nullable(),
    tanggal_pinjam: z.string(), tanggal_jatuh_tempo: z.string(), tanggal_kembali: z.string().nullable(), status: LoanStatusSchema,
    signature: Photo.nullable(), aksi: z.object({ checkin: z.boolean(), perpanjang: z.boolean().optional() }),
    tanggal_jatuh_tempo_asli: z.string().optional(), jumlah_perpanjangan: z.number().optional(), perpanjangan: z.array(LoanExtensionSchema).optional(), estimasi_denda: z.string().optional(),
    unit: z.array(z.object({ id: z.string(), asset_id: z.string(), uuid: z.string(), kode_barang: z.string(), nama: z.string(), category_id: z.string(), allocated_asset_id: z.string(), alasan_substitusi: z.string().nullable(), kondisi_awal: z.string(), kondisi_akhir: z.string().nullable(), tidak_lengkap: z.boolean(), status_kembali: z.string(), tanggal_kembali: z.string().nullable(), catatan: z.string().nullable(), foto_awal: z.array(Photo), foto_akhir: z.array(Photo), denda: z.array(Fine), damage_report_id: z.string().nullable() })),
});
export const ReadyCheckoutSchema = z.object({ id: z.string(), nomor: z.string(), peminjam: z.object({ id: z.string(), nama: z.string() }), waktu_mulai: z.string(), waktu_selesai: z.string(), lokasi_penggunaan: z.string().nullable(), unit: z.array(z.object({ asset_id: z.string(), uuid: z.string(), kode_barang: z.string(), nama: z.string(), kondisi: z.string() })) });
export const LoanResultSchema = z.object({ id: z.string(), nomor: z.string(), status: LoanStatusSchema });
const response = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data, meta: z.null() });
export const LoanDetailResponseSchema = response(LoanDetailSchema);
export const LoanResolvedUnitResponseSchema = response(z.object({ asset_id: z.string(), uuid: z.string(), kode_barang: z.string(), nama: z.string(), category_id: z.string(), kondisi: z.string(), layak: z.boolean() }));
export const LoanBorrowersResponseSchema = z.object({ success: z.literal(true), data: z.array(z.object({ id: z.string(), nama: z.string(), role: z.string() })), meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }) });
export const LoanResultResponseSchema = response(LoanResultSchema);
export const LoanCheckinPreviewResponseSchema = response(z.object({ unit: z.array(z.object({ loan_item_id: z.string(), hari_terlambat: z.number(), tarif_per_hari: z.string(), denda: z.string(), sebelum_cap: z.string(), ganti_rugi: z.string().nullable(), menunggu_penetapan: z.boolean() })) }));
export const ReadyCheckoutResponseSchema = z.object({ success: z.literal(true), data: z.array(ReadyCheckoutSchema), meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }) });
export type LoanCheckoutBody = z.infer<typeof LoanCheckoutBodySchema>;
export type LoanCheckinBody = z.infer<typeof LoanCheckinBodySchema>;
export type LoanDetail = z.infer<typeof LoanDetailSchema>;
export type ReadyCheckout = z.infer<typeof ReadyCheckoutSchema>;
