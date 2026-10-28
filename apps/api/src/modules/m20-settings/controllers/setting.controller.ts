// Controller M-20: validasi skema (SDD-API-01), lalu delegasi ke SettingService.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { SettingRow } from "../repositories/setting.repository.js";
import { ListSettingsQuerySchema, UpdateSettingsBodySchema } from "../schemas/setting.schema.js";
import type { SettingService } from "../services/setting.service.js";

function keSetting(s: SettingRow) {
    return {
        key: s.key,
        kelompok: s.kelompok,
        tipe: s.tipe,
        value: s.value,
        nilai_bawaan: s.nilai_bawaan,
        nilai_min: s.nilai_min === null ? null : Number(s.nilai_min),
        nilai_maks: s.nilai_maks === null ? null : Number(s.nilai_maks),
        deskripsi: s.deskripsi,
        updated_at: s.updated_at,
        updated_by: s.updated_by,
    };
}

export function getSettingsHandler(service: SettingService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const query = ListSettingsQuerySchema.parse({
            page: req.query["page"],
            per_page: req.query["per_page"],
            kelompok: req.query["filter[kelompok]"],
        });
        const hasil = await service.list(ctx, {
            page: query.page,
            perPage: query.per_page,
            ...(query.kelompok === undefined ? {} : { kelompok: query.kelompok }),
        });
        res.status(200).json({
            success: true,
            data: hasil.rows.map(keSetting),
            meta: {
                page: hasil.page,
                per_page: hasil.perPage,
                total: hasil.total,
                total_pages: hasil.totalPages,
            },
        });
    };
}

export function updateSettingsHandler(service: SettingService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const body = UpdateSettingsBodySchema.parse(req.body);
        const hasil = await service.update(ctx, body.settings);
        res.status(200).json({ success: true, data: hasil.map(keSetting) });
    };
}
