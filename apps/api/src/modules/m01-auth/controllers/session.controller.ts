// Controller sesi M-01 (FR-01.2): validasi skema (SDD-API-01), lalu delegasi ke SessionService.
// Route-nya `authenticated: true`; `AuthContext` dan id sesi dijamin ada oleh `authenticated()`.

import type { Request, RequestHandler, Response } from "express";
import {
    COOKIE_ACCESS,
    COOKIE_REFRESH,
    PATH_ACCESS,
    PATH_REFRESH,
    getSesiId,
    hapusCookie,
    requireAuthContext,
} from "../../../shared/auth/index.js";
import { AuthError } from "../../../shared/errors/index.js";
import { SesiIdParamSchema } from "../schemas/auth.schema.js";
import type { KlienPermintaan } from "../services/klien.js";
import type { SessionService } from "../services/session.service.js";

function klienDari(req: Request): KlienPermintaan {
    return { ip: req.ip, userAgent: req.get("user-agent") };
}

function sesiSaatIni(res: Response): string {
    const sid = getSesiId(res);
    if (sid === undefined) throw new AuthError("UNAUTHENTICATED");
    return sid;
}

/** FR-01.2 langkah 3: klien web membuang tokennya; cookie httpOnly hanya dapat dibuang server. */
function buangCookieSesi(res: Response): void {
    res.append("Set-Cookie", hapusCookie(COOKIE_ACCESS, PATH_ACCESS));
    res.append("Set-Cookie", hapusCookie(COOKIE_REFRESH, PATH_REFRESH));
}

export function logoutHandler(service: SessionService): RequestHandler {
    return async (req, res) => {
        await service.logout(requireAuthContext(res), sesiSaatIni(res), klienDari(req));
        res.setHeader("Cache-Control", "no-store");
        buangCookieSesi(res);
        res.status(204).end();
    };
}

export function logoutSemuaHandler(service: SessionService): RequestHandler {
    return async (req, res) => {
        await service.logoutSemua(requireAuthContext(res), klienDari(req));
        res.setHeader("Cache-Control", "no-store");
        buangCookieSesi(res);
        res.status(204).end();
    };
}

export function listSesiHandler(service: SessionService): RequestHandler {
    return async (_req, res) => {
        const daftar = await service.daftar(requireAuthContext(res), sesiSaatIni(res));
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            data: daftar.map((s) => ({
                id: s.id,
                platform: s.platform,
                ip: s.ip,
                user_agent: s.user_agent,
                dibuat_pada: s.dibuat_pada.toISOString(),
                terakhir_diperbarui: s.terakhir_diperbarui.toISOString(),
                berlaku_sampai: s.berlaku_sampai.toISOString(),
                saat_ini: s.saat_ini,
            })),
            meta: null,
        });
    };
}

export function cabutSesiHandler(service: SessionService): RequestHandler {
    return async (req, res) => {
        const { id } = SesiIdParamSchema.parse(req.params);
        const sesiIni = await service.cabutPerangkat(requireAuthContext(res), id, sesiSaatIni(res), klienDari(req));
        if (sesiIni) buangCookieSesi(res);
        res.status(204).end();
    };
}
