// Kontrak detail aset & linimasa riwayat (FR-04.2 langkah 5 & A1, BR-073; PR-03-24, keputusan 4 log
// phase-03 & keputusan 24). Satu definisi bagi API dan P-18 web (SDD-FE-05).
import { z } from "zod";

const KONDISI = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const;
const STATUS = ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"] as const;
const Waktu = z.iso.datetime({ offset: true });
const Orang = z.object({ id: z.string(), nama: z.string() });

/**
 * `GET /assets/{id}`. `sumber_perolehan`/`nilai_perolehan` TIDAK ADA (bukan `null`) bagi pemanggil
 * tanpa `asset.view_financial` — server tidak memilihnya (BR-073, SDD-AUTH-06), pola katalog.
 */
export const AssetDetailSchema = z.object({
    id: z.string(),
    uuid: z.string(),
    kode_barang: z.string(),
    nama: z.string(),
    kategori: z.object({ id: z.string(), nama: z.string() }),
    merek: z.string().nullable(),
    model: z.string().nullable(),
    nomor_seri: z.string().nullable(),
    tahun_perolehan: z.number().int(),
    lokasi: z.object({ room_id: z.string(), ruang: z.string(), area: z.string(), gedung: z.string() }),
    kondisi: z.enum(KONDISI),
    status: z.enum(STATUS),
    dapat_dipinjam: z.boolean(),
    boleh_dipinjam_siswa: z.boolean(),
    penanggung_jawab: Orang.nullable(),
    /** FR-05.1: payload QR permanen `https://{domain}/a/{uuid}`. */
    qr_url: z.string(),
    qr_terpasang: z.boolean(),
    /** BR-065d: aset terhapuskan tetap dapat dibuka, bertanda. */
    dihapuskan: z.boolean(),
    tanggal_penghapusan: Waktu.nullable(),
    created_at: Waktu,
    sumber_perolehan: z.enum(["PEMBELIAN", "HIBAH", "BANTUAN_PEMERINTAH", "SUMBANGAN", "LAINNYA"]).optional(),
    nilai_perolehan: z.string().nullable().optional(),
});
export type AssetDetail = z.infer<typeof AssetDetailSchema>;
export const AssetDetailResponseSchema = z.object({ success: z.literal(true), data: AssetDetailSchema, meta: z.null() });

/** Jenis entri linimasa (keputusan 4b & 24b). Modul pemilik riwayat lain menambah jenisnya sendiri. */
export const JENIS_LINIMASA_ASET = ["KONDISI", "MUTASI", "DOKUMEN", "KERUSAKAN"] as const;

const Dasar = { id: z.string(), waktu: Waktu };
/** `pelaku` `null` = Sistem (AL-06). */
const Pelaku = Orang.nullable();

export const EntriLinimasaAsetSchema = z.discriminatedUnion("jenis", [
    z.object({
        ...Dasar,
        jenis: z.literal("KONDISI"),
        kondisi_lama: z.enum(KONDISI),
        kondisi_baru: z.enum(KONDISI),
        alasan: z.string(),
        pelaku: Pelaku,
        referensi_jenis: z.string().nullable(),
        referensi_id: z.string().nullable(),
    }),
    z.object({
        ...Dasar,
        jenis: z.literal("MUTASI"),
        /** Tanggal mutasi pilihan pengguna (FR-04.4 langkah 2), `YYYY-MM-DD`. */
        tanggal: z.iso.date(),
        ruang_asal: z.object({ id: z.string(), nama: z.string() }),
        ruang_tujuan: z.object({ id: z.string(), nama: z.string() }),
        alasan: z.string(),
        pelaku: Pelaku,
        document_id: z.string().nullable(),
    }),
    z.object({
        ...Dasar,
        jenis: z.literal("DOKUMEN"),
        aksi: z.enum(["DITAUTKAN", "DILEPAS"]),
        dokumen_id: z.string(),
        jenis_dokumen: z.enum(["FAKTUR", "GARANSI", "SERTIFIKAT", "MANUAL", "BERITA_ACARA", "LAINNYA"]),
        nama_berkas: z.string(),
        pelaku: Pelaku,
    }),
    z.object({
        ...Dasar,
        jenis: z.literal("KERUSAKAN"),
        /** Ringkasan tanpa identitas pelapor maupun isi laporan (pola `GET /damage-reports/open`). */
        laporan_id: z.string(),
        nomor: z.string(),
        status: z.enum(["DILAPORKAN", "DIVERIFIKASI", "DALAM_PERBAIKAN", "SELESAI", "DITOLAK"]),
        urgensi: z.enum(["RENDAH", "SEDANG", "TINGGI", "KRITIS"]),
    }),
]);
export type EntriLinimasaAset = z.infer<typeof EntriLinimasaAsetSchema>;

/** SDD-API-05: offset `page`/`per_page`, terbaru lebih dulu. */
export const AssetTimelineQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
});

export const AssetTimelineResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(EntriLinimasaAsetSchema),
    meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }),
});
