// Controller laporan kerusakan (FR-11.1; PR-03-14). Isian tak sah → 422 per isian (Bab 17.2).

import { DamageReportCreateSchema, DamageReportIdParamSchema, DamageReportListQuerySchema, DamageReportOpenQuerySchema, DamageReportVerifySchema } from "@sigm4/schemas";
import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { DamageReportQueryService } from "../services/damage-report-query.service.js";
import type { DamageReportService } from "../services/damage-report.service.js";
import type { VerificationService } from "../services/verification.service.js";

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

/** FR-11.3 (P-39): saringan tak sah → 422 per isian. */
export function listDamageReportsHandler(service: DamageReportQueryService): RequestHandler {
    return async (req, res) => {
        const { data, meta } = await service.daftar(requireAuthContext(res), urai(DamageReportListQuerySchema, req.query));
        res.status(200).json({ success: true, data, meta });
    };
}

export function getDamageReportHandler(service: DamageReportQueryService): RequestHandler {
    return async (req, res) => {
        const { id } = DamageReportIdParamSchema.parse(req.params);
        res.status(200).json({ success: true, data: await service.detail(requireAuthContext(res), id), meta: null });
    };
}

export function verifyDamageReportHandler(service: VerificationService): RequestHandler {
    return async (req, res) => {
        const { id } = DamageReportIdParamSchema.parse(req.params);
        const b = urai(DamageReportVerifySchema, req.body);
        const data = await service.verifikasi(requireAuthContext(res), id, {
            keputusan: b.keputusan,
            catatan: b.catatan ?? null,
            kondisiAset: b.kondisi_aset === undefined ? null : { kondisi: b.kondisi_aset.kondisi, alasan: b.kondisi_aset.alasan ?? null },
        });
        res.status(200).json({ success: true, data, meta: null });
    };
}
