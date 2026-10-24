import { z } from "zod";

const flag = z.preprocess(v => typeof v === "string" ? v.trim().toLowerCase() : v,
    z.enum(["true", "false"]).or(z.boolean())).transform(v => v === true || v === "true").optional();
/** FR-04.2 A3: seluruh hasil filter, tanpa parameter halaman. */
export const AssetExportFilterSchema = z.object({
    q: z.string().trim().min(1).max(150).optional(),
    sort: z.enum(["created_at", "-created_at", "nama", "-nama", "kode_barang", "-kode_barang", "tahun_perolehan", "-tahun_perolehan"]).default("-created_at"),
    kategori_id: z.coerce.number().int().positive().optional(),
    lokasi_id: z.coerce.number().int().positive().optional(),
    kondisi: z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"]).optional(),
    status: z.enum(["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"]).optional(),
    tahun_perolehan: z.coerce.number().int().min(1900).max(2100).optional(),
    dapat_dipinjam: flag, qr_terpasang: flag,
    import_job_id: z.coerce.number().int().positive().optional(),
}).strict();
export const AssetExportBodySchema = z.object({ format: z.enum(["XLSX", "PDF"]), filter: AssetExportFilterSchema }).strict();
/** Nama query HTTP sama dengan katalog; bracket adalah bagian literal kunci. */
export const AssetExportQuerySchema = z.object({
    format: z.enum(["XLSX", "PDF"]), q: AssetExportFilterSchema.shape.q, sort: AssetExportFilterSchema.shape.sort,
    "filter[kategori_id]": AssetExportFilterSchema.shape.kategori_id,
    "filter[lokasi_id]": AssetExportFilterSchema.shape.lokasi_id,
    "filter[kondisi]": AssetExportFilterSchema.shape.kondisi,
    "filter[status]": AssetExportFilterSchema.shape.status,
    "filter[tahun_perolehan]": AssetExportFilterSchema.shape.tahun_perolehan,
    "filter[dapat_dipinjam]": flag, "filter[qr_terpasang]": flag,
    "filter[import_job_id]": AssetExportFilterSchema.shape.import_job_id,
}).strict();
export type AssetExportFilter = z.infer<typeof AssetExportFilterSchema>;
