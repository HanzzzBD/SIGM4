// Skema Zod M-20 (SDD-API-01, SDD-API-11): masukan/keluaran parameter sistem
// (FR-20.1).

import { z } from "zod";

/**
 * Isi `PUT /settings`: peta `kunci -> nilai`. Tipe dan rentang tiap nilai TIDAK
 * dicek di sini — keduanya milik baris `system_settings` (`SDD-DB-17`), sehingga
 * dicek service terhadap baris itu, bukan terhadap daftar tetap di skema.
 */
export const UpdateSettingsBodySchema = z.object({
    settings: z
        .record(z.string().min(1), z.unknown())
        .refine((peta) => Object.keys(peta).length > 0, {
            message: "Sertakan minimal satu parameter yang diubah.",
        }),
});

const KelompokSchema = z.enum([
    "IDENTITAS_SEKOLAH",
    "KODE_ASET",
    "PEMINJAMAN",
    "DENDA",
    "RESERVASI",
    "MAINTENANCE",
    "BAHAN",
    "NOTIFIKASI",
    "KEAMANAN",
    "CHATBOT_AI",
]);

/**
 * Query daftar (Bab 17.1, SDD-PERF-04): `page`/`per_page` datar; `kelompok`
 * dibaca controller dari `filter[kelompok]` (parser `simple` Express 5 tidak
 * menguraikan tanda kurung). Satu kelompok = satu tab P-70.
 */
export const ListSettingsQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
    kelompok: KelompokSchema.optional(),
});

const SettingSchema = z.object({
    key: z.string(),
    kelompok: KelompokSchema,
    tipe: z.enum(["BILANGAN_BULAT", "DESIMAL", "BOOLEAN", "TEKS"]),
    value: z.unknown(),
    // AC FR-20.1: setiap parameter menampilkan penjelasan singkat dan nilai bawaan.
    nilai_bawaan: z.unknown(),
    nilai_min: z.number().nullable(),
    nilai_maks: z.number().nullable(),
    deskripsi: z.string(),
    updated_at: z.string(),
    updated_by: z.string().nullable(),
});

const PaginationMetaSchema = z.object({
    page: z.number(),
    per_page: z.number(),
    total: z.number(),
    total_pages: z.number(),
});

export const ListSettingsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(SettingSchema),
    meta: PaginationMetaSchema,
});

/** `PUT`: hanya parameter yang diminta — dibatasi isi permintaan, bukan seluruh katalog. */
export const UpdateSettingsResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(SettingSchema),
});
