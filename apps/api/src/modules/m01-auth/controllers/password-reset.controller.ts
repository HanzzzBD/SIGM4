// Controller reset password administratif (FR-01.3): validasi skema (SDD-API-01), lalu delegasi ke
// PasswordResetService. `forgot` publik; sisanya di belakang `authorize('user.reset_password')`.

import type { Request, RequestHandler, Response } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { PermintaanTampil } from "../repositories/password-reset.repository.js";
import {
    ForgotBodySchema,
    ListPermintaanQuerySchema,
    PESAN_PERMINTAAN_DITERIMA,
    PermintaanIdParamSchema,
    TerbitkanBodySchema,
    TolakBodySchema,
} from "../schemas/password-reset.schema.js";
import type { KlienPermintaan } from "../services/klien.js";
import type { PasswordResetService } from "../services/password-reset.service.js";

function klienDari(req: Request): KlienPermintaan {
    return { ip: req.ip, userAgent: req.get("user-agent") };
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

export function keTampilan(p: PermintaanTampil) {
    return {
        id: p.id,
        pemohon: { id: p.user_id, nama: p.pemohon_nama, email: p.pemohon_email, nip_nis: p.pemohon_nip_nis, role_kode: p.pemohon_role_kode },
        status: p.status,
        metode_verifikasi: p.metode_verifikasi,
        diminta_pada: p.diminta_pada.toISOString(),
        diproses_oleh: p.diproses_oleh === null ? null : { id: p.diproses_oleh, nama: p.diproses_oleh_nama ?? "" },
        diproses_pada: iso(p.diproses_pada),
        kedaluwarsa_pada: iso(p.kedaluwarsa_pada),
        alasan_penolakan: p.alasan_penolakan,
    };
}

/** Respons yang memuat kredensial tidak boleh di-cache oleh peramban, proxy, maupun klien. */
function tanpaCache(res: Response): void {
    res.setHeader("Cache-Control", "no-store");
}

export function forgotHandler(service: PasswordResetService): RequestHandler {
    return async (req, res) => {
        const { email } = ForgotBodySchema.parse(req.body);
        await service.ajukan(email, klienDari(req));
        // FR-01.3 A1: jawaban yang sama untuk email terdaftar, tak terdaftar, nonaktif, dan melebihi batas.
        res.status(202).json({ success: true, data: { message: PESAN_PERMINTAAN_DITERIMA }, meta: null });
    };
}

export function listPermintaanHandler(service: PasswordResetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListPermintaanQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            status: req.query["filter[status]"],
        });
        const hasil = await service.daftar(ctx, {
            page: query.page,
            perPage: query.per_page,
            ...(query.status === undefined ? {} : { status: query.status }),
        });
        tanpaCache(res); // memuat identitas pemohon (PII)
        res.status(200).json({
            success: true,
            data: hasil.rows.map(keTampilan),
            meta: {
                page: query.page,
                per_page: query.per_page,
                total: hasil.total,
                total_pages: Math.max(1, Math.ceil(hasil.total / query.per_page)),
            },
        });
    };
}

export function terbitkanHandler(service: PasswordResetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = PermintaanIdParamSchema.parse(req.params);
        const { metode_verifikasi } = TerbitkanBodySchema.parse(req.body);
        const hasil = await service.terbitkan(ctx, String(id), metode_verifikasi, klienDari(req));
        tanpaCache(res);
        res.status(200).json({
            success: true,
            data: { permintaan: keTampilan(hasil.permintaan), password_sementara: hasil.passwordSementara },
            meta: null,
        });
    };
}

export function tolakHandler(service: PasswordResetService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = PermintaanIdParamSchema.parse(req.params);
        const { alasan } = TolakBodySchema.parse(req.body);
        const permintaan = await service.tolak(ctx, String(id), alasan, klienDari(req));
        res.status(200).json({ success: true, data: keTampilan(permintaan), meta: null });
    };
}
