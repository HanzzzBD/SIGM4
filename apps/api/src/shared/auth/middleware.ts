// Middleware otorisasi — langkah "permission" pada rantai SDD-AUTH-09 (PM-02).
//
// `authenticate` (langkah 1: verifikasi token) BUKAN bagian PR ini — ia menyusul
// Phase 02 bersama login (`PR-02-02`), yang menaruh `AuthContext` lewat
// `setAuthContext` setelah token terverifikasi dan permission efektifnya
// terbaca (langsung atau lewat cache `PR-01-04`). Middleware di sini hanya
// menegakkan permission ATAS AuthContext yang sudah ada: ketiadaannya dijawab
// sama seperti belum terautentikasi (401), bukan diam-diam meloloskan.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { AuthError, ForbiddenError } from "../errors/index.js";
import type { AuthContext } from "./context.js";

const KUNCI = "authContext";

/** Menaruh `AuthContext` request saat ini. Dipanggil langkah `authenticate` (Phase 02). */
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
 */
export function authorize(permission: string): RequestHandler {
    return (_req: Request, res: Response, next: NextFunction) => {
        const ctx = getAuthContext(res);
        if (ctx === undefined) {
            next(new AuthError());
            return;
        }
        if (!ctx.can(permission)) {
            next(new ForbiddenError("INSUFFICIENT_PERMISSION"));
            return;
        }
        next();
    };
}
