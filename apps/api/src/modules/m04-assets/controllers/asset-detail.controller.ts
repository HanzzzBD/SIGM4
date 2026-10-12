// Controller detail aset & linimasa (PR-03-24): validasi skema (SDD-API-01), lalu delegasi.

import type { RequestHandler } from "express";
import { AssetTimelineQuerySchema } from "@sigm4/schemas";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { AssetIdParamSchema } from "../schemas/asset.schema.js";
import type { AssetDetailService } from "../services/asset-detail.service.js";
import type { AssetPhotoService } from "../services/asset-photo.service.js";

export function assetPhotosHandler(service: AssetPhotoService): RequestHandler {
    return async (req, res) => {
        const { id } = AssetIdParamSchema.parse(req.params);
        const q = AssetTimelineQuerySchema.parse({ page: req.query["page"], per_page: req.query["per_page"] });
        const { photos, total } = await service.list(requireAuthContext(res), id, q.page, q.per_page);
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: photos, meta: { page: q.page, per_page: q.per_page, total, total_pages: Math.max(1, Math.ceil(total / q.per_page)) } });
    };
}

export function getAssetHandler(service: AssetDetailService): RequestHandler {
    return async (req, res) => {
        const { id } = AssetIdParamSchema.parse(req.params);
        res.status(200).json({ success: true, data: await service.detail(requireAuthContext(res), id), meta: null });
    };
}

export function assetTimelineHandler(service: AssetDetailService): RequestHandler {
    return async (req, res) => {
        const { id } = AssetIdParamSchema.parse(req.params);
        const q = AssetTimelineQuerySchema.parse({ page: req.query["page"], per_page: req.query["per_page"] });
        const { entri, total } = await service.linimasa(requireAuthContext(res), id, q.page, q.per_page);
        res.status(200).json({ success: true, data: entri, meta: { page: q.page, per_page: q.per_page, total, total_pages: total === 0 ? 1 : Math.ceil(total / q.per_page) } });
    };
}
