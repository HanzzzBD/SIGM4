// Controller unggah berkas (SDD-09 §4.2): validasi skema (SDD-API-01), lalu delegasi ke
// FileService. Route-nya `authenticated: true` (m06 §7 — Bearer, tanpa permission khusus).

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { ConfirmBodySchema, PresignBodySchema } from "../schemas/file.schema.js";
import { BERLAKU_UNGGAH_DETIK } from "../services/file.service.js";
import type { FileService } from "../services/file.service.js";

export function presignHandler(service: FileService): RequestHandler {
    return async (req, res) => {
        const body = PresignBodySchema.parse(req.body);
        const hasil = await service.presign(requireAuthContext(res), body);
        res.setHeader("Cache-Control", "no-store");
        res.status(201).json({
            success: true,
            data: { upload_url: hasil.uploadUrl, object_key: hasil.objectKey, file_id: hasil.fileId, expires_in: BERLAKU_UNGGAH_DETIK },
            meta: null,
        });
    };
}

export function confirmHandler(service: FileService): RequestHandler {
    return async (req, res) => {
        const body = ConfirmBodySchema.parse(req.body);
        const hasil = await service.konfirmasi(requireAuthContext(res), body.file_id, body.checksum);
        res.status(200).json({ success: true, data: { file_id: hasil.fileId, scan_status: hasil.scanStatus }, meta: null });
    };
}
