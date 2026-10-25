import { z } from "zod";

const Money = z.string().regex(/^(0|[1-9]\d{0,21})(\.\d{1,2})?$/, "Isi nominal rupiah nonnegatif, maksimal dua desimal.");
const PositiveMoney = Money.refine((v) => /[1-9]/.test(v), "Nominal harus lebih dari nol.");
const Reason = z.string().trim().min(1, "Alasan wajib diisi.").max(1000);
const Id = z.coerce.number().int().positive().safe();
const Page = z.coerce.number().int().positive().default(1);
const PerPage = z.coerce.number().int().min(1).max(100).default(25);
const DateOnly = z.iso.date();
const StatusFine = z.enum(["BELUM_DIBAYAR", "LUNAS", "DIBEBASKAN", "DIBEBASKAN_SEBAGIAN"]);
export const LoanListQuerySchema = z.object({ tab: z.enum(["aktif", "akan_jatuh_tempo", "terlambat", "selesai"]).default("aktif"), q: z.string().trim().max(100).default(""), peminjam: Id.optional(), kategori: Id.optional(), dari: DateOnly.optional(), sampai: DateOnly.optional(), page: Page, per_page: PerPage });
export const FineListQuerySchema = z.object({ jenis: z.enum(["KETERLAMBATAN", "GANTI_RUGI"]).optional(), status: StatusFine.optional(), q: z.string().trim().max(100).default(""), peminjam: Id.optional(), dari: DateOnly.optional(), sampai: DateOnly.optional(), page: Page, per_page: PerPage });
export const LoanExportQuerySchema = LoanListQuerySchema.extend({ format: z.enum(["xlsx", "pdf"]) });
export const FineExportQuerySchema = FineListQuerySchema.extend({ format: z.enum(["xlsx", "pdf"]) });
export const LoanExtendBodySchema = z.object({ tanggal_jatuh_tempo: z.iso.datetime({ offset: true }), alasan: Reason }).strict();
export const FinePayBodySchema = z.object({ tanggal_bayar: z.iso.datetime({ offset: true }), nomor_bukti: z.string().trim().min(1, "Nomor bukti wajib diisi.").max(100) }).strict();
export const FineWaiveBodySchema = z.object({ alasan: Reason }).strict();
export const CompensationWaiveBodySchema = z.object({ alasan: Reason, jumlah: PositiveMoney }).strict();
export const CompensationProposalBodySchema = z.object({ alasan: Reason, jumlah: PositiveMoney }).strict();
export const CompensationDecisionBodySchema = z.object({ keputusan: z.enum(["DISETUJUI", "DITOLAK"]), catatan: Reason }).strict();
export const CompensationProposalParamsSchema = z.object({ id: Id, proposalId: Id });
const Meta = z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() });
const response = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data, meta: z.null() });
export const LoanListRowSchema = z.object({ id: z.string(), nomor: z.string(), peminjam: z.object({ id: z.string(), nama: z.string() }), tanggal_pinjam: z.string(), tanggal_jatuh_tempo: z.string(), status: z.string(), unit_aktif: z.number(), hari_terlambat: z.number(), estimasi_denda: z.string() });
export const LoanListResponseSchema = z.object({ success: z.literal(true), data: z.array(LoanListRowSchema), meta: Meta });
export const FineRowSchema = z.object({ id: z.string(), loan_id: z.string(), loan_item_id: z.string(), nomor_peminjaman: z.string(), kode_barang: z.string(), nama_aset: z.string(), peminjam: z.object({ id: z.string(), nama: z.string() }), jenis: z.enum(["KETERLAMBATAN", "GANTI_RUGI"]), status: StatusFine, jumlah: z.string().nullable(), jumlah_dibebaskan: z.string(), sisa: z.string().nullable(), menunggu_penetapan: z.boolean(), hari_terlambat: z.number(), tarif_per_hari: z.string(), jumlah_sebelum_cap: z.string().nullable(), created_at: z.string(), tanggal_bayar: z.string().nullable(), nomor_bukti: z.string().nullable() });
export const FineListResponseSchema = z.object({ success: z.literal(true), data: z.array(FineRowSchema), meta: Meta });
export const FineDetailSchema = FineRowSchema.extend({
 aksi: z.object({ bayar: z.boolean(), bebaskan: z.boolean(), bebaskan_ganti_rugi: z.boolean(), usulkan_nilai: z.boolean(), putuskan_nilai: z.boolean(), buka_kembali: z.boolean() }),
 riwayat: z.array(z.object({ id: z.string(), aksi: z.string(), jumlah: z.string().nullable(), alasan: z.string().nullable(), oleh: z.string(), pada: z.string() })),
 usulan: z.array(z.object({ id: z.string(), jumlah: z.string(), alasan: z.string(), status: z.string(), pengusul: z.string(), diusulkan_oleh: z.string(), diputuskan_oleh: z.string().nullable(), diusulkan_pada: z.string(), diputuskan_pada: z.string().nullable(), catatan_keputusan: z.string().nullable() })),
 blokir: z.object({ aktif: z.boolean(), alasan: z.array(z.string()), konfigurasi_lengkap: z.boolean() }),
});
export const FineDetailResponseSchema = response(FineDetailSchema);
export const LoanExtensionSchema = z.object({ id: z.string(), status: z.string(), jatuh_tempo_lama: z.string(), jatuh_tempo_baru: z.string(), alasan: z.string(), approval_instance_id: z.string().nullable(), diputuskan_pada: z.string().nullable() });
export const LoanExtensionResponseSchema = response(LoanExtensionSchema);
export const FineMutationResponseSchema = response(z.object({ id: z.string(), status: z.string() }));
export const CompensationProposalResponseSchema = response(z.object({ id: z.string(), status: z.string() }));
export type LoanListQuery = z.infer<typeof LoanListQuerySchema>;
export type FineListQuery = z.infer<typeof FineListQuerySchema>;
export type FineDetail = z.infer<typeof FineDetailSchema>;
export type LoanExtension = z.infer<typeof LoanExtensionSchema>;

export const LoanFilterOptionsResponseSchema = response(z.object({ peminjam: z.array(z.object({ id: z.string(), nama: z.string() })), kategori: z.array(z.object({ id: z.string(), nama: z.string() })) }));

export const LoanExtensionContextResponseSchema = response(z.object({ pengajuan: LoanExtensionSchema, peminjaman: z.object({ id: z.string(), nomor: z.string(), peminjam: z.string(), role: z.string(), jatuh_tempo: z.string(), unit: z.array(z.object({ kode_barang: z.string(), nama: z.string(), kondisi_awal: z.string(), status_kembali: z.string() })) }) }));
