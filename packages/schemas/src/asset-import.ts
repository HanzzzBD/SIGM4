// E.5.1, IMPT-01…05: satu kontrak lintas API dan web (SDD-REPO-05).
import { z } from "zod";

export const ASSET_IMPORT_COLUMNS = ["nama_barang", "kode_kategori", "merek", "model", "nomor_seri", "tahun_perolehan", "sumber_perolehan", "nilai_perolehan", "kode_ruangan", "kondisi", "dapat_dipinjam", "boleh_dipinjam_siswa", "jumlah_unit"] as const;
export const ASSET_IMPORT_REQUIRED_COLUMNS = ["nama_barang", "kode_kategori", "tahun_perolehan", "sumber_perolehan", "kode_ruangan", "kondisi", "dapat_dipinjam", "boleh_dipinjam_siswa", "jumlah_unit"] as const;
export const ASSET_IMPORT_SYNC_LIMIT = 200;
export const ImportAssetsBodySchema = z.object({
    filename: z.string().trim().min(1).max(255).regex(/\.(csv|xlsx)$/i, "Pilih berkas CSV atau XLSX."),
    content_base64: z.string().min(1).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, "Isi berkas base64 tidak valid."),
});
const text = (name: string, max: number) => z.string({ error: `${name} wajib diisi.` }).trim().min(1, `${name} wajib diisi.`).max(max, `${name} terlalu panjang.`);
const optionalText = (name: string) => text(name, 100).optional();
const integer = (name: string, min: number, max: number) => z.preprocess(
    (v) => typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v,
    z.number({ error: `${name} harus berupa bilangan bulat.` }).int(`${name} harus berupa bilangan bulat.`).min(min, `${name} minimal ${min}.`).max(max, `${name} maksimal ${max}.`),
);
const enumCode = (v: unknown) => typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "_") : v;
const boolean = z.enum(["true", "false"], { error: "Nilai boolean wajib true atau false." }).transform((v) => v === "true");

export function importAssetRowSchema(currentYear: number) {
    return z.object({
        nama_barang: text("Nama barang", 150),
        kode_kategori: text("Kode kategori", 100),
        merek: optionalText("Merek"), model: optionalText("Model"), nomor_seri: optionalText("Nomor seri"),
        tahun_perolehan: integer("Tahun perolehan", 1950, currentYear),
        sumber_perolehan: z.preprocess((v) => enumCode(v) === "BANTUAN" ? "BANTUAN_PEMERINTAH" : enumCode(v), z.enum(["PEMBELIAN", "HIBAH", "BANTUAN_PEMERINTAH", "SUMBANGAN", "LAINNYA"], { error: "Sumber perolehan tidak dikenal." })),
        nilai_perolehan: z.preprocess((v) => typeof v === "string" && /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : v, z.number({ error: "Nilai perolehan harus berupa desimal nonnegatif (maksimal dua angka desimal)." }).nonnegative("Nilai perolehan tidak boleh negatif.").max(999_999_999_999.99, "Nilai perolehan melebihi kapasitas penyimpanan.").optional()),
        kode_ruangan: text("Kode ruangan", 100),
        kondisi: z.preprocess(enumCode, z.enum(["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT"], { error: "Kondisi harus Baik, Rusak Ringan, atau Rusak Berat." })),
        dapat_dipinjam: boolean, boleh_dipinjam_siswa: boolean,
        jumlah_unit: integer("Jumlah unit", 1, 500),
    }).superRefine((v, ctx) => {
        if (v.nomor_seri !== undefined && v.jumlah_unit > 1) ctx.addIssue({ code: "custom", path: ["nomor_seri"], message: "Nomor seri hanya dapat diisi bila jumlah_unit = 1 (BR-003)." });
        if (v.boleh_dipinjam_siswa && !v.dapat_dipinjam) ctx.addIssue({ code: "custom", path: ["boleh_dipinjam_siswa"], message: "Boleh dipinjam siswa harus false bila tidak dapat dipinjam." });
    });
}
export const AssetImportFailureSchema = z.object({ baris: z.number().int(), nama_barang: z.string().nullable(), pesan: z.string(), data: z.record(z.string(), z.string()) });
export const AssetImportJobSchema = z.object({
    id: z.string(), nama_berkas: z.string(), status: z.enum(["MENUNGGU", "BERJALAN", "SELESAI", "GAGAL"]),
    total: z.number(), terproses: z.number(), sukses: z.number(), gagal: z.number(), unit_dibuat: z.number(),
    laporan_gagal: z.array(AssetImportFailureSchema), pesan_galat: z.string().nullable(), selesai_pada: z.string().nullable(), dibuat_pada: z.string(),
});
export const AssetImportResponseSchema = z.object({ success: z.literal(true), data: AssetImportJobSchema, meta: z.object({ idempotent_replay: z.boolean() }).nullable() });
export type AssetImportJob = z.infer<typeof AssetImportJobSchema>;
export type AssetImportFailure = z.infer<typeof AssetImportFailureSchema>;
