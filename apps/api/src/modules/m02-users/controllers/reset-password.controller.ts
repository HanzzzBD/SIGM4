// Controller `POST /users/{id}/reset-password` (M-02, P-63): reset langsung dari detail pengguna
// (FR-01.3 langkah 3–4 tanpa menunggu permintaan pemohon). Logikanya milik M-01 (`password_reset_requests`
// dan penerbitan); modul ini hanya memanggil pintu sempit yang disuntikkan composition root, tidak
// mengimpor internal m01-auth (SDD-SYS-03).

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { ResetPasswordBodySchema, UserIdParamSchema } from "../schemas/user.schema.js";
import type { PenerbitPasswordSementara } from "../routes.js";

export function resetPasswordHandler(penerbit: PenerbitPasswordSementara): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = UserIdParamSchema.parse(req.params);
        const { metode_verifikasi } = ResetPasswordBodySchema.parse(req.body);
        const hasil = await penerbit.terbitkanLangsung(ctx, String(id), metode_verifikasi, {
            ip: req.ip,
            userAgent: req.get("user-agent"),
        });
        // Kredensial: tidak boleh di-cache. Tampil SATU kali (FR-01.3 AC).
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({
            success: true,
            data: {
                user_id: String(id),
                permintaan_id: hasil.permintaanId,
                password_sementara: hasil.passwordSementara,
                berlaku_sampai: hasil.berlakuSampai.toISOString(),
            },
            meta: null,
        });
    };
}
