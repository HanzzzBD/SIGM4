// Skema Zod reset password administratif (SDD-API-01, FR-01.3, PR-02-05).

import { z } from "zod";

/** FR-01.3 A1: satu-satunya jawaban `forgot`, apa pun keadaan emailnya. */
export const PESAN_PERMINTAAN_DITERIMA = "Permintaan diterima";

/** Email tidak divalidasi bentuknya: penolakan berbeda membocorkan apa yang dicari (FR-01.3 A1). */
export const ForgotBodySchema = z.object({ email: z.string().trim().min(1).max(254) });

export const ForgotResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ message: z.string() }),
    meta: z.null(),
});

/** Kanal terverifikasi yang ditetapkan sekolah (FR-01.3 langkah 3); kodenya PRD Bab 11.3. */
export const MetodeVerifikasiSchema = z.enum(["KARTU_IDENTITAS_TATAP_MUKA", "KONFIRMASI_ATASAN_ATAU_WALI_KELAS"]);
export const StatusPermintaanSchema = z.enum(["MENUNGGU", "DITERBITKAN", "DITOLAK", "SELESAI", "KEDALUWARSA"]);

/** Wajib dipilih SEBELUM penerbitan dan tersimpan pada permintaan (FR-01.3 AC). */
export const TerbitkanBodySchema = z.object({ metode_verifikasi: MetodeVerifikasiSchema });

/** FR-01.3 A2: penolakan beserta alasannya. */
export const TolakBodySchema = z.object({ alasan: z.string().trim().min(1).max(500) });

export const PermintaanIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const ListPermintaanQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
    status: StatusPermintaanSchema.optional(),
});

const PermintaanSchema = z.object({
    id: z.string(),
    pemohon: z.object({
        id: z.string(),
        nama: z.string(),
        email: z.string(),
        nip_nis: z.string(),
        role_kode: z.string(),
    }),
    /** Status efektif: `DITERBITKAN` yang lewat 72 jam tampil `KEDALUWARSA`. */
    status: StatusPermintaanSchema,
    metode_verifikasi: MetodeVerifikasiSchema.nullable(),
    diminta_pada: z.string(),
    diproses_oleh: z.object({ id: z.string(), nama: z.string() }).nullable(),
    diproses_pada: z.string().nullable(),
    kedaluwarsa_pada: z.string().nullable(),
    alasan_penolakan: z.string().nullable(),
});

export const ListPermintaanResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(PermintaanSchema),
    meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }),
});

export const SinglePermintaanResponseSchema = z.object({
    success: z.literal(true),
    data: PermintaanSchema,
    meta: z.null(),
});

/**
 * Penerbitan: `password_sementara` ditampilkan SATU kali dan tidak dapat dibaca lagi oleh siapa pun,
 * termasuk Administrator penerbitnya (FR-01.3 AC). Tidak pernah dikirim lewat kanal notifikasi.
 */
export const TerbitkanResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ permintaan: PermintaanSchema, password_sementara: z.string() }),
    meta: z.null(),
});
