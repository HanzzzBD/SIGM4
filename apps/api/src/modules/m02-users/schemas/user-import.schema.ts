// Skema Zod impor massal pengguna (FR-02.1 A4, IMPT-01 … IMPT-04).
//
// Ambang 200 baris memisahkan jalur sinkron (hasil pada respons) dari asinkron
// (dijadwalkan ke worker, hasil diambil lewat `GET /users/import/{id}`). Kedua
// jalur mengembalikan representasi pekerjaan yang SAMA (keputusan 33, log phase-01).

import { z } from "zod";

/** `IMPT-04`: di atas ini diproses asinkron oleh worker. */
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
 * Satu baris templat `template_pengguna` (Lampiran E.5.2). Kolom `kelas` belum
 * dibaca impor (belum ada PR yang menugaskannya); bila ada di berkas, diabaikan.
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

export const ImportJobIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

const ImportFailureSchema = z.object({
    baris: z.number(),
    email: z.string().nullable(),
    pesan: z.string(),
});

/** Representasi pekerjaan impor (IMPT-02): hitungan + alasan galat per nomor baris. */
export const UserImportJobSchema = z.object({
    id: z.string(),
    status: z.enum(["MENUNGGU", "BERJALAN", "SELESAI", "GAGAL"]),
    nama_berkas: z.string(),
    total: z.number(),
    terproses: z.number(),
    sukses: z.number(),
    gagal: z.number(),
    laporan_gagal: z.array(ImportFailureSchema),
    pesan_galat: z.string().nullable(),
    selesai_pada: z.string().nullable(),
    dibuat_pada: z.string(),
});

/** `meta.idempotent_replay` true bila berkas identik sudah diimpor dalam 24 jam (IMPT-03). */
export const ImportUserJobResponseSchema = z.object({
    success: z.literal(true),
    data: UserImportJobSchema,
    meta: z.object({ idempotent_replay: z.boolean() }).nullable(),
});
