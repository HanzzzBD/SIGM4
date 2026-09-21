// Middleware otorisasi — langkah "permission" pada rantai SDD-AUTH-09 (PM-02).
//
// `authenticate` (langkah 1: verifikasi token, `authenticate.ts`, PR-02-02) menaruh
// `AuthContext` lewat `setAuthContext`. Middleware di sini hanya menegakkan permission
// ATAS AuthContext yang sudah ada: ketiadaannya dijawab 401, bukan diam-diam meloloskan.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AuthError, ForbiddenError } from "../errors/index.js";
import type { AuthContext } from "./context.js";
import { periksaDuaFaktor } from "./two-factor.js";

const KUNCI = "authContext";
const KUNCI_KEGAGALAN = "kegagalanAutentikasi";

/** Alasan token yang ADA ditolak `authenticate`; menentukan kode 401 yang dijawab `authorize`. */
export type KegagalanAutentikasi = "UNAUTHENTICATED" | "TOKEN_EXPIRED";

export function setKegagalanAutentikasi(res: Response, alasan: KegagalanAutentikasi): void {
    res.locals[KUNCI_KEGAGALAN] = alasan;
}

/** Menandai pengguna wajib mengganti password (klaim `pwd`); dibaca `gerbangGantiPassword`. */
export function setWajibGantiPassword(res: Response, wajib: boolean): void {
    res.locals["wajibGantiPassword"] = wajib;
}

/** Klaim `amr` token yang lolos `authenticate` (`SDD-SESS-09`); dibaca gerbang 2FA dan penerbitan ulang token. */
export function setAmr(res: Response, amr: readonly string[]): void {
    res.locals["amr"] = amr;
}

export function getAmr(res: Response): readonly string[] | undefined {
    return res.locals["amr"] as readonly string[] | undefined;
}

/** Id sesi (`sid` = `family_id`) dari token yang lolos `authenticate`; dasar logout dan daftar perangkat. */
export function setSesiId(res: Response, sid: string): void {
    res.locals["sesiId"] = sid;
}

export function getSesiId(res: Response): string | undefined {
    return res.locals["sesiId"] as string | undefined;
}

/** Menaruh `AuthContext` request saat ini. Dipanggil `authenticate`. */
export function setAuthContext(res: Response, ctx: AuthContext): void {
    res.locals[KUNCI] = ctx;
}

/** `AuthContext` request saat ini, atau `undefined` bila belum ada yang menaruhnya. */
export function getAuthContext(res: Response): AuthContext | undefined {
    return res.locals[KUNCI] as AuthContext | undefined;
}

/**
 * `AuthContext` request ini, atau melempar `AuthError` bila belum ada. Dipakai
 * controller yang berjalan DI BELAKANG `authorize()` — yang sudah menjaminnya
 * ada — sebagai jaring kedua, bukan jalur normal (SDD-AUTH-02).
 */
export function requireAuthContext(res: Response): AuthContext {
    const ctx = getAuthContext(res);
    if (ctx === undefined) throw new AuthError();
    return ctx;
}

/**
 * Menegakkan permission sebuah route (`PM-02`, `SDD-AUTH-01 §4.1`). Tanpa
 * `AuthContext` → `401 UNAUTHENTICATED`; ada tetapi tidak memegang permission →
 * `403 INSUFFICIENT_PERMISSION` — keduanya dilempar lewat `next(galat)` dan
 * ditangkap `errorMapper` (`SDD-06 §4.4`), sebelum controller pernah terpanggil.
 * Role wajib 2FA yang sesinya belum terverifikasi ditolak `403 TWO_FACTOR_REQUIRED` SEBELUM
 * permission diperiksa (`SDD-AUTH-09` gerbang 3 mendahului gerbang 4, `BR-070`).
 */
export function authorize(permission: string): RequestHandler {
    return (_req: Request, res: Response, next: NextFunction) => {
        const ctx = getAuthContext(res);
        if (ctx === undefined) {
            // Token kedaluwarsa dibedakan dari tidak ada/tidak sah agar klien tahu harus refresh.
            next(new AuthError((res.locals[KUNCI_KEGAGALAN] as KegagalanAutentikasi | undefined) ?? "UNAUTHENTICATED"));
            return;
        }
        const belumDuaFaktor = periksaDuaFaktor(ctx, getAmr(res));
        if (belumDuaFaktor !== undefined) {
            next(belumDuaFaktor);
            return;
        }
        if (!ctx.can(permission)) {
            next(new ForbiddenError("INSUFFICIENT_PERMISSION"));
            return;
        }
        next();
    };
}

/**
 * Menegakkan **autentikasi saja** bagi route `authenticated: true` (endpoint "Bearer", `SDD-AUTH-12`).
 * Tanpa `AuthContext` → `401` (`TOKEN_EXPIRED` bila tokennya kedaluwarsa); tidak ada permission
 * yang diperiksa karena datanya milik pemanggil sendiri — scope `own` ditegakkan repository.
 *
 * Gerbang 2FA (`BR-070`) berlaku juga di sini. Hanya route yang MENYATAKAN `tanpaDuaFaktor`
 * — pendaftaran 2FA dan logout, jalan keluar sesi yang belum terverifikasi — yang melewatinya.
 */
export interface OpsiAutentikasi {
    readonly tanpaDuaFaktor?: boolean;
}

export function authenticated(opsi: OpsiAutentikasi = {}): RequestHandler {
    return (_req: Request, res: Response, next: NextFunction) => {
        const ctx = getAuthContext(res);
        if (ctx === undefined) {
            next(new AuthError((res.locals[KUNCI_KEGAGALAN] as KegagalanAutentikasi | undefined) ?? "UNAUTHENTICATED"));
            return;
        }
        const belumDuaFaktor = opsi.tanpaDuaFaktor === true ? undefined : periksaDuaFaktor(ctx, getAmr(res));
        if (belumDuaFaktor !== undefined) {
            next(belumDuaFaktor);
            return;
        }
        next();
    };
}
