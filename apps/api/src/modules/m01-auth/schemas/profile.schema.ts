// Skema Zod profil & ganti password sendiri (SDD-API-01, FR-01.4, PR-02-06).

import { z } from "zod";

/** Batas panjang sama dengan login: melindungi Argon2id dari masukan raksasa (FR-01.4 langkah 2-3). */
export const PasswordChangeBodySchema = z.object({
    password_lama: z.string().min(1).max(512),
    password_baru: z.string().min(1).max(512),
});

/** `access_token` null pada WEB: token barunya hanya di cookie httpOnly, sama seperti login. */
export const PasswordChangeResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ access_token: z.string().nullable() }),
    meta: z.null(),
});

const ProfilSchema = z.object({
    id: z.string(),
    nama: z.string(),
    email: z.string(),
    telepon: z.string().nullable(),
    role_kode: z.string(),
    must_change_password: z.boolean(),
    // Keputusan 7c log phase-03: `foto_url` hanya bila `CLEAN` (SDD-FS-03); status agar UI dapat
    // menampilkan "sedang diperiksa" (SDD-09 §5). Keduanya null bila tanpa foto.
    foto_status: z.enum(["PENDING", "CLEAN", "INFECTED", "FAILED"]).nullable(),
    foto_url: z.string().nullable(),
});

export const MeResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ user: ProfilSchema, permissions: z.record(z.string(), z.string()) }),
    meta: z.null(),
});

/** FR-01.4 langkah 5: email dan role tidak diterima di sini (BR-069) — nama/telepon/foto. */
export const UpdateProfilBodySchema = z
    .object({
        nama: z.string().trim().min(1).max(200).optional(),
        telepon: z.string().trim().min(1).max(30).nullable().optional(),
        // Berkas `USER_PHOTO` yang sudah dikonfirmasi (`POST /files/confirm`); null = hapus foto.
        foto_file_id: z.coerce.number().int().positive().nullable().optional(),
    })
    .refine((data) => data.nama !== undefined || data.telepon !== undefined || data.foto_file_id !== undefined, {
        message: "Tidak ada perubahan yang dikirim.",
    });

export const UpdateProfilResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ user: ProfilSchema }),
    meta: z.null(),
});
