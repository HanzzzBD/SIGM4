// Controller M-01: validasi skema (SDD-API-01), jalur token per platform, lalu delegasi
// ke AuthService. WEB: token hanya di cookie httpOnly (SDD-SESS-05); mobile: di body.

import type { Request, RequestHandler, Response } from "express";
import {
    COOKIE_ACCESS,
    COOKIE_REFRESH,
    PATH_ACCESS,
    PATH_REFRESH,
    bacaCookie,
    hapusCookie,
    susunCookie,
} from "../../../shared/auth/index.js";
import { AuthError } from "../../../shared/errors/index.js";
import { REFRESH_TTL_DETIK } from "../../../shared/security/index.js";
import type { PlatformPerangkat } from "../../../shared/security/index.js";
import { LoginBodySchema, RefreshBodySchema } from "../schemas/auth.schema.js";
import type { AuthService, KlienPermintaan } from "../services/auth.service.js";

function klienDari(req: Request): KlienPermintaan {
    return { ip: req.ip, userAgent: req.get("user-agent") };
}

interface PasanganToken {
    readonly accessToken: string;
    readonly refreshToken: string;
    readonly platform: PlatformPerangkat;
    readonly expiresInDetik: number;
}

/**
 * Menyalurkan token menurut platform. WEB → dua cookie dan `tokens: null`;
 * mobile → `tokens` di body. Respons berisi kredensial, jadi tidak boleh di-cache.
 */
function salurkanToken(
    res: Response,
    sesi: PasanganToken,
): { access_token: string; refresh_token: string } | null {
    res.setHeader("Cache-Control", "no-store");
    if (sesi.platform !== "WEB") {
        return { access_token: sesi.accessToken, refresh_token: sesi.refreshToken };
    }
    res.append("Set-Cookie", susunCookie(COOKIE_ACCESS, sesi.accessToken, PATH_ACCESS, sesi.expiresInDetik));
    res.append(
        "Set-Cookie",
        susunCookie(COOKIE_REFRESH, sesi.refreshToken, PATH_REFRESH, REFRESH_TTL_DETIK.WEB),
    );
    return null;
}

export function loginHandler(service: AuthService): RequestHandler {
    return async (req, res) => {
        const body = LoginBodySchema.parse(req.body);
        const sesi = await service.login(body, klienDari(req));
        const tokens = salurkanToken(res, sesi);
        res.status(200).json({
            success: true,
            data: { tokens, expires_in: sesi.expiresInDetik, user: sesi.user, permissions: sesi.permissions },
            meta: null,
        });
    };
}

export function refreshHandler(service: AuthService): RequestHandler {
    return async (req, res) => {
        const body = RefreshBodySchema.parse(req.body ?? {});
        const dariCookie = bacaCookie(req.get("cookie"), COOKIE_REFRESH);
        const token = body.refresh_token ?? dariCookie;
        if (token === undefined) throw new AuthError("UNAUTHENTICATED");
        try {
            const sesi = await service.refresh(token, klienDari(req));
            const tokens = salurkanToken(res, sesi);
            res.status(200).json({ success: true, data: { tokens, expires_in: sesi.expiresInDetik }, meta: null });
        } catch (galat) {
            // Sesi web yang gagal diperbarui tidak dapat dipulihkan: cookie basi dibuang.
            if (galat instanceof AuthError && dariCookie !== undefined) {
                res.append("Set-Cookie", hapusCookie(COOKIE_ACCESS, PATH_ACCESS));
                res.append("Set-Cookie", hapusCookie(COOKIE_REFRESH, PATH_REFRESH));
            }
            throw galat;
        }
    };
}
