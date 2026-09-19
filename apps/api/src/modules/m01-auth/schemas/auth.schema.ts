// Skema Zod M-01 (SDD-API-01): masukan/keluaran login dan refresh (FR-01.1).

import { z } from "zod";

const PlatformSchema = z.enum(["WEB", "ANDROID", "IOS"]);

/**
 * `POST /auth/login`. Email tidak divalidasi bentuknya: format yang ditolak dengan
 * pesan berbeda dari "kredensial salah" membocorkan apa yang dicari (FR-01.1 A1).
 * Batas panjang password melindungi Argon2id dari masukan raksasa.
 */
export const LoginBodySchema = z.object({
    email: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(512),
    /** Menentukan jalur token (cookie untuk WEB, body untuk mobile) dan masa berlaku refresh. */
    platform: PlatformSchema,
});

/** `POST /auth/refresh`: token di body (mobile) atau cookie `sigm4_rt` (web). */
export const RefreshBodySchema = z.object({
    refresh_token: z.string().min(1).max(200).optional(),
});

const TokensSchema = z.object({
    access_token: z.string(),
    refresh_token: z.string(),
});

const UserSchema = z.object({
    id: z.string(),
    nama: z.string(),
    email: z.string(),
    role_kode: z.string(),
    must_change_password: z.boolean(),
});

/** `tokens` null pada WEB: token-nya hanya di cookie httpOnly, tidak pernah di body. */
export const LoginResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        tokens: TokensSchema.nullable(),
        expires_in: z.number(),
        user: UserSchema,
        permissions: z.record(z.string(), z.string()),
    }),
    meta: z.null(),
});

export const RefreshResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        tokens: TokensSchema.nullable(),
        expires_in: z.number(),
    }),
    meta: z.null(),
});
