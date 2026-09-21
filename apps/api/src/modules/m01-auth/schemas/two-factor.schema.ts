// Skema Zod pendaftaran & pengelolaan 2FA sendiri (SDD-API-01, FR-01.5, PR-02-07).
// Verifikasi saat login (`/auth/2fa/verify`) ada di `auth.schema.ts`, sebab ia langkah kedua login.

import { z } from "zod";

/**
 * `POST /auth/2fa/enroll`. `kode_aktivasi` wajib bagi role wajib 2FA (`BR-070d`) dan diabaikan bagi role lain. Sengaja
 * TIDAK divalidasi bentuknya di sini: kode yang bentuknya salah dijawab sama dengan kode yang salah (`FR-01.5 A5`).
 */
export const EnrollBodySchema = z.object({
    kode_aktivasi: z.string().max(64).optional(),
});

/** Yang ditampilkan SATU kali (BR-070c): secret untuk pendaftaran manual, URI untuk QR, 10 kode cadangan. */
export const EnrollResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        secret: z.string(),
        otpauth_uri: z.string(),
        kode_cadangan: z.array(z.string()),
    }),
    meta: z.null(),
});

/** FR-01.5 langkah 3: tepat 6 digit dari aplikasi authenticator. */
export const EnrollConfirmBodySchema = z.object({
    kode: z.string().trim().regex(/^\d{6}$/),
});

/** `access_token` null pada WEB: token barunya hanya di cookie httpOnly, sama seperti login. */
export const EnrollConfirmResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ access_token: z.string().nullable() }),
    meta: z.null(),
});

export const KodeCadanganResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({ kode_cadangan: z.array(z.string()) }),
    meta: z.null(),
});
