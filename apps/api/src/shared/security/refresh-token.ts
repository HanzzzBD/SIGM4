// Refresh token buram (SDD-SESS-03): 32 byte acak, BUKAN JWT. Yang disimpan server
// hanya SHA-256-nya, sehingga basis data yang bocor tidak membocorkan token yang
// dapat dipakai. Tanpa klaim, tanpa struktur — bila tercuri tidak membuka apa pun
// selain dirinya sendiri, dan pemakaian ulangnya terdeteksi (SDD-SESS-04).

import { createHash, randomBytes } from "node:crypto";

/** Masa berlaku refresh token (`FR-01.1` langkah 6, `SDD-04 §4.1`). */
export const REFRESH_TTL_DETIK = {
    WEB: 12 * 60 * 60,
    ANDROID: 30 * 24 * 60 * 60,
    IOS: 30 * 24 * 60 * 60,
} as const;

export type PlatformPerangkat = keyof typeof REFRESH_TTL_DETIK;

export interface RefreshTokenBaru {
    /** Nilai yang dikirim ke klien — sekali ini saja. */
    readonly token: string;
    /** Yang disimpan server. */
    readonly hash: Buffer;
}

export function hashRefreshToken(token: string): Buffer {
    return createHash("sha256").update(token).digest();
}

export function bangkitkanRefreshToken(): RefreshTokenBaru {
    const token = randomBytes(32).toString("base64url");
    return { token, hash: hashRefreshToken(token) };
}

/** 32 byte dalam base64url = 43 karakter. Yang lain tidak perlu menyentuh basis data. */
export function bentukRefreshTokenSah(token: string): boolean {
    return /^[A-Za-z0-9_-]{43}$/.test(token);
}
