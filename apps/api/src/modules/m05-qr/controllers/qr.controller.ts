// Controller M-05: validasi skema (SDD-API-01), lalu delegasi ke QrService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { AssetIdParamSchema, AssetUuidParamSchema, PrintQrBodySchema, QrTerpasangBodySchema, RegenerateQrBodySchema } from "../schemas/qr.schema.js";
import type { QrService } from "../services/qr.service.js";

/** `POST /assets/{id}/qr/regenerate` (FR-05.1 A2). */
export function regenerateQrHandler(service: QrService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = AssetIdParamSchema.parse(req.params);
        const { alasan } = RegenerateQrBodySchema.parse(req.body);
        res.status(200).json({ success: true, data: await service.regenerasi(ctx, id, alasan), meta: null });
    };
}

/** `GET /assets/by-uuid/{uuid}` (FR-05.2 langkah 3). */
export function assetByUuidHandler(service: QrService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { uuid } = AssetUuidParamSchema.parse(req.params);
        res.status(200).json({ success: true, data: await service.pindai(ctx, uuid), meta: null });
    };
}

/** `GET /public/assets/{uuid}` (FR-05.2 A3) — tanpa `AuthContext`. */
export function publicAssetHandler(service: QrService): RequestHandler {
    return async (req, res) => {
        const { uuid } = AssetUuidParamSchema.parse(req.params);
        const profil = await service.profilPublik(uuid);
        // 17.5 butir 2: halaman publik tidak boleh terindeks mesin pencari.
        res.status(200).setHeader("X-Robots-Tag", "noindex, nofollow").json({ success: true, data: profil, meta: null });
    };
}

/** `POST /assets/qr/print` (FR-05.1 langkah 2–4). Respons biner PDF, bukan JSON. */
export function printQrHandler(service: QrService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = PrintQrBodySchema.parse(req.body);
        const pdf = await service.cetakLabel(ctx, { assetIds: body.asset_ids, tataLetak: body.tata_letak, elemen: { kodeAset: body.elemen.kode_aset, nama: body.elemen.nama } });
        res.status(200).setHeader("Content-Type", "application/pdf").setHeader("Content-Disposition", 'attachment; filename="label-qr.pdf"').send(pdf);
    };
}

/** `PATCH /assets/qr-terpasang` (FR-05.1 langkah 5). */
export function qrTerpasangHandler(service: QrService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = QrTerpasangBodySchema.parse(req.body);
        const diubah = await service.tandaiTerpasang(ctx, body.asset_ids, body.qr_terpasang);
        res.status(200).json({ success: true, data: { diubah: diubah.map(String), qr_terpasang: body.qr_terpasang }, meta: { jumlah_diubah: diubah.length } });
    };
}
