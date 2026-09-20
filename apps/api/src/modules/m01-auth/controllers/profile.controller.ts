// Controller profil & ganti password sendiri (FR-01.4): validasi skema (SDD-API-01), lalu
// delegasi ke ProfileService. Route-nya `authenticated: true`; datanya milik pemanggil sendiri.

import type { Request, RequestHandler, Response } from "express";
import {
    COOKIE_ACCESS,
    PATH_ACCESS,
    bacaCookie,
    getSesiId,
    requireAuthContext,
    susunCookie,
} from "../../../shared/auth/index.js";
import { AuthError } from "../../../shared/errors/index.js";
import { ACCESS_TOKEN_TTL_DETIK } from "../../../shared/security/index.js";
import { PasswordChangeBodySchema, UpdateProfilBodySchema } from "../schemas/profile.schema.js";
import type { KlienPermintaan } from "../services/klien.js";
import type { ProfileService } from "../services/profile.service.js";

function klienDari(req: Request): KlienPermintaan {
    return { ip: req.ip, userAgent: req.get("user-agent") };
}

function sesiSaatIni(res: Response): string {
    const sid = getSesiId(res);
    if (sid === undefined) throw new AuthError("UNAUTHENTICATED");
    return sid;
}

/** WEB terautentikasi lewat cookie akses; mobile lewat header `Authorization` (SDD-04 §4.7). */
function viaCookie(req: Request): boolean {
    return req.get("authorization") === undefined && bacaCookie(req.get("cookie"), COOKIE_ACCESS) !== undefined;
}

export function lihatProfilHandler(service: ProfileService): RequestHandler {
    return async (_req, res) => {
        const hasil = await service.lihat(requireAuthContext(res));
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            data: {
                user: {
                    id: hasil.user.id,
                    nama: hasil.user.nama,
                    email: hasil.user.email,
                    telepon: hasil.user.telepon,
                    role_kode: hasil.user.role_kode,
                    must_change_password: hasil.user.must_change_password,
                },
                permissions: hasil.permissions,
            },
            meta: null,
        });
    };
}

export function perbaruiProfilHandler(service: ProfileService): RequestHandler {
    return async (req, res) => {
        const body = UpdateProfilBodySchema.parse(req.body);
        const user = await service.perbarui(requireAuthContext(res), body);
        res.status(200).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    nama: user.nama,
                    email: user.email,
                    telepon: user.telepon,
                    role_kode: user.role_kode,
                    must_change_password: user.must_change_password,
                },
            },
            meta: null,
        });
    };
}

/**
 * FR-01.4 langkah 4: token baru bagi sesi ini sendiri (klaim `pwd=false`) supaya gerbang ganti
 * password (`SDD-AUTH-09`) langsung terbuka tanpa menunggu `/auth/refresh` (UX-FLOWS P-05).
 */
export function gantiPasswordHandler(service: ProfileService): RequestHandler {
    return async (req, res) => {
        const body = PasswordChangeBodySchema.parse(req.body);
        const lewatCookie = viaCookie(req);
        const hasil = await service.gantiPassword(
            requireAuthContext(res),
            sesiSaatIni(res),
            { passwordLama: body.password_lama, passwordBaru: body.password_baru },
            klienDari(req),
        );
        res.setHeader("Cache-Control", "no-store");
        let accessToken: string | null = hasil.accessToken;
        if (lewatCookie) {
            res.append("Set-Cookie", susunCookie(COOKIE_ACCESS, hasil.accessToken, PATH_ACCESS, ACCESS_TOKEN_TTL_DETIK));
            accessToken = null;
        }
        res.status(200).json({ success: true, data: { access_token: accessToken }, meta: null });
    };
}
