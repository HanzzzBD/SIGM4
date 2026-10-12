import { z } from "zod";

export const JENIS_DOKUMEN_ASET = ["FAKTUR", "GARANSI", "SERTIFIKAT", "MANUAL", "BERITA_ACARA", "LAINNYA"] as const;
export const JenisDokumenAsetSchema = z.enum(JENIS_DOKUMEN_ASET);
export const DokumenAsetSchema = z.object({
    id: z.string(), jenis: JenisDokumenAsetSchema, nama_berkas: z.string(), keterangan: z.string().nullable(),
    garansi_mulai: z.string().nullable(), garansi_selesai: z.string().nullable(), mime: z.string(), ukuran: z.number(),
    scan_status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]), diunggah_oleh: z.string().nullable(),
    diunggah_pada: z.string(), jumlah_aset: z.number(),
});
export type DokumenAset = z.infer<typeof DokumenAsetSchema>;
export const DaftarDokumenAsetResponseSchema = z.object({ success: z.literal(true), data: z.array(DokumenAsetSchema), meta: z.null() });
export const DokumenAsetResponseSchema = z.object({ success: z.literal(true), data: DokumenAsetSchema, meta: z.null() });
export const DokumenLintasAsetSchema = DokumenAsetSchema.extend({ aset: z.object({ id: z.string(), kode_barang: z.string(), nama: z.string() }) });
export type DokumenLintasAset = z.infer<typeof DokumenLintasAsetSchema>;
export const DaftarDokumenLintasAsetResponseSchema = z.object({ success: z.literal(true), data: z.array(DokumenLintasAsetSchema), meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }) });
