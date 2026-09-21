// Controller pendaftaran & pengelolaan 2FA sendiri (FR-01.5): validasi skema (SDD-API-01), lalu
// delegasi ke TwoFactorService. Route-nya `authenticated: true`; datanya milik pemanggil sendiri.

import type { Request, RequestHandler, Response } from "express";
import {
    COOKIE_ACCESS,
    PATH_ACCESS,
    bacaCookie,
    getAmr,
    getSesiId,
    requireAuthContext,
    susunCookie,
} from "../../../shared/auth/index.js";
import { AuthError } from "../../../shared/errors/index.js";
import { ACCESS_TOKEN_TTL_DETIK } from "../../../shared/security/index.js";
import { EnrollBodySchema, EnrollConfirmBodySchema } from "../schemas/two-factor.schema.js";
import type { KlienPermintaan } from "../services/klien.js";
import type { TwoFactorService } from "../services/two-factor.service.js";

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

/** Respons memuat rahasia yang hanya tampil sekali (BR-070c): tidak boleh di-cache. */
export function enrollHandler(service: TwoFactorService): RequestHandler {
    return async (req, res) => {
        const body = EnrollBodySchema.parse(req.body ?? {});
        const hasil = await service.mulaiPendaftaran(requireAuthContext(res), body.kode_aktivasi, klienDari(req));
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            data: { secret: hasil.secret, otpauth_uri: hasil.otpauthUri, kode_cadangan: hasil.kodeCadangan },
            meta: null,
        });
    };
}

/**
 * FR-01.5 langkah 4: token baru bagi sesi ini sendiri (`amr` memuat `otp`) supaya gerbang 2FA
 * (`SDD-AUTH-09` gerbang 3) langsung terbuka tanpa menunggu `/auth/refresh`.
 */
export function konfirmasiEnrollHandler(service: TwoFactorService): RequestHandler {
    return async (req, res) => {
        const body = EnrollConfirmBodySchema.parse(req.body);
        const lewatCookie = viaCookie(req);
        const ctx = requireAuthContext(res);
        const sesi = sesiSaatIni(res);
        const { wajibGanti } = await service.konfirmasiPendaftaran(ctx, sesi, body.kode, klienDari(req));
        // Diterbitkan TERPISAH dari konfirmasi: token turunan `ctx`, `sesi`, dan keadaan akun — tidak
        // pernah turunan `kode` (pola `PR-02-06`).
        const tokenBaru = service.terbitkanAksesBaru(ctx, sesi, wajibGanti);
        res.setHeader("Cache-Control", "no-store");
        let accessToken: string | null = tokenBaru;
        if (lewatCookie) {
            res.append("Set-Cookie", susunCookie(COOKIE_ACCESS, tokenBaru, PATH_ACCESS, ACCESS_TOKEN_TTL_DETIK));
            accessToken = null;
        }
        res.status(200).json({ success: true, data: { access_token: accessToken }, meta: null });
    };
}

export function buatUlangKodeCadanganHandler(service: TwoFactorService): RequestHandler {
    return async (req, res) => {
        const kode = await service.buatUlangKodeCadangan(requireAuthContext(res), getAmr(res), klienDari(req));
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { kode_cadangan: kode }, meta: null });
    };
}
