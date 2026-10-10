// Controller laporan kerusakan (FR-11.1; PR-03-14). Isian tak sah → 422 per isian (Bab 17.2).

import { DamageReportCreateSchema, DamageReportOpenQuerySchema } from "@sigm4/schemas";
import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { DamageReportService } from "../services/damage-report.service.js";

function urai<T>(skema: ZodType<T>, masukan: unknown): T {
    const hasil = skema.safeParse(masukan);
    if (!hasil.success) {
        throw new DomainError("VALIDATION_ERROR", "Isian laporan kerusakan tidak sah.", {
            errors: hasil.error.issues.map((i) => ({ field: i.path.map(String).join(".") || "(body)", message: i.message })),
        });
    }
    return hasil.data;
}

export function createDamageReportHandler(service: DamageReportService): RequestHandler {
    return async (req, res) => {
        const b = urai(DamageReportCreateSchema, req.body);
        const data = await service.buat(requireAuthContext(res), { assetId: b.asset_id, roomId: b.room_id, deskripsi: b.deskripsi, urgensi: b.urgensi, fotoFileIds: b.foto_file_ids });
        res.status(201).json({ success: true, data, meta: null });
    };
}

export function openDamageReportHandler(service: DamageReportService): RequestHandler {
    return async (req, res) => {
        const q = urai(DamageReportOpenQuerySchema, req.query);
        res.status(200).json({ success: true, data: await service.terbuka(requireAuthContext(res), { assetId: q.asset_id, roomId: q.room_id }), meta: null });
    };
}
