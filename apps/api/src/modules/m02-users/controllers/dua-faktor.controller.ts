// Controller pengelolaan 2FA pengguna lain (M-02, P-63; FR-01.5 A3/A7, PR-02-33): reset 2FA dan penerbitan kode
// aktivasi. Logikanya milik M-01; modul ini hanya memanggil pintu sempit yang disuntikkan composition root,
// tidak mengimpor internal m01-auth (SDD-SYS-03).

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { KelolaDuaFaktorBodySchema, UserIdParamSchema } from "../schemas/user.schema.js";
import type { PengelolaDuaFaktor } from "../routes.js";

export function terbitkanKodeAktivasiHandler(pengelola: PengelolaDuaFaktor): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = UserIdParamSchema.parse(req.params);
        const { metode_verifikasi } = KelolaDuaFaktorBodySchema.parse(req.body);
        const hasil = await pengelola.terbitkanKodeAktivasi(ctx, String(id), metode_verifikasi, {
            ip: req.ip,
            userAgent: req.get("user-agent"),
        });
        // Kredensial: tidak boleh di-cache. Tampil SATU kali (BR-070d).
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            data: { user_id: String(id), kode_aktivasi: hasil.kode, berlaku_sampai: hasil.berlakuSampai.toISOString() },
            meta: null,
        });
    };
}

export function resetDuaFaktorHandler(pengelola: PengelolaDuaFaktor): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = UserIdParamSchema.parse(req.params);
        const { metode_verifikasi } = KelolaDuaFaktorBodySchema.parse(req.body);
        const hasil = await pengelola.reset(ctx, String(id), metode_verifikasi, { ip: req.ip, userAgent: req.get("user-agent") });
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            data: {
                user_id: String(id),
                sesi_dicabut: hasil.sesiDicabut,
                // Bagi role wajib 2FA: kode aktivasi baru, tampil SATU kali (BR-070d); selain itu null.
                kode_aktivasi: hasil.kodeAktivasi?.kode ?? null,
                berlaku_sampai: hasil.kodeAktivasi?.berlakuSampai.toISOString() ?? null,
            },
            meta: null,
        });
    };
}
