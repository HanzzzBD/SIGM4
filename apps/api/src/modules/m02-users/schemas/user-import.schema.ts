// Skema Zod impor massal pengguna (FR-02.1 A4, IMPT-01, IMPT-02).
//
// PR-01-03 SINKRON saja — batas ≤ 200 baris, sesuai ambang IMPT-04 sendiri
// ("> 200 baris diproses asinkron"). Jalur asinkron + idempotensi hash-berkas
// (IMPT-03/04) menyusul di `PR-01-17` (keputusan 19, log phase-01).

import { z } from "zod";

/** `IMPT-04`: di atas ini menuntut pemrosesan asinkron, belum tersedia PR ini. */
export const BATAS_BARIS_IMPOR = 200;

const NAMA_BERKAS_SAH = /\.(csv|xlsx)$/i;

export const ImportUsersBodySchema = z.object({
    filename: z
        .string()
        .trim()
        .min(1)
        .max(255)
        .regex(NAMA_BERKAS_SAH, "Nama berkas harus berakhiran .csv atau .xlsx"),
    /** Isi berkas, dikodekan base64 — bukan multipart (keputusan 19). */
    content_base64: z.string().trim().min(1),
});

/**
 * Satu baris templat `template_pengguna` (Lampiran E.5.2). `kelas` dan
 * `consent_wali` SENGAJA tidak ada di sini: keduanya menuntut kolom yang belum
 * dibuat (`PR-01-13`, `PR-01-14`) — baris kolom itu, bila ada di berkas,
 * diabaikan begitu saja (maju-kompatibel dengan templat penuh nanti).
 */
export const ImportUserRowSchema = z.object({
    nama_lengkap: z.string().trim().min(1).max(150),
    email: z.email().trim().toLowerCase().max(150),
    nip_nis: z.string().trim().min(1).max(30),
    kode_role: z.string().trim().min(1),
    // `kode_unit_kerja` ditandai wajib di Lampiran E.5.2 ("harus ada pada master
    // unit kerja"). Bila diisi, service meresolusinya ke `work_units` dan kode
    // tak dikenal menggagalkan baris. Tetap OPSIONAL bila kosong: master belum
    // dapat diisi lewat aplikasi (keputusan 28 log phase-01), sehingga
    // mewajibkannya kini menggagalkan setiap baris impor.
    kode_unit_kerja: z.string().trim().min(1).max(100).optional(),
    // E.5.2 `consent_wali`: wajib `true` untuk Siswa/OSIS (DP-02, SL-06) — ditegakkan service,
    // karena bergantung pada role. CSV membawa teks, XLSX dapat membawa boolean.
    consent_wali: z
        .preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(["true", "false"]).or(z.boolean()))
        .transform((v) => v === true || v === "true")
        .optional(),
    telepon: z.string().trim().min(1).max(20).optional(),
});

const ImportRowResultSchema = z.object({
    baris: z.number(),
    status: z.enum(["SUKSES", "GAGAL"]),
    email: z.string().nullable(),
    pesan: z.string().nullable(),
});

export const ImportUsersResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        total: z.number(),
        sukses: z.number(),
        gagal: z.number(),
        baris: z.array(ImportRowResultSchema),
    }),
    meta: z.null(),
});
