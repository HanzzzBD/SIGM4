// Controller progres tur produk milik sendiri: validasi skema (SDD-API-01), lalu delegasi ke
// TourService. Route-nya `authenticated: true`; datanya milik pemanggil sendiri.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { TurRow } from "../repositories/tour.repository.js";
import { TourParamsSchema, UpdateTourBodySchema } from "../schemas/tour.schema.js";
import type { TourService } from "../services/tour.service.js";

function tampilkan(tur: TurRow) {
    return { kunci: tur.kunci_tur, status: tur.status, versi: tur.versi, diperbarui_pada: tur.updated_at.toISOString() };
}

export function listToursHandler(service: TourService): RequestHandler {
    return async (_req, res) => {
        const daftar = await service.daftar(requireAuthContext(res));
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { tur: daftar.map(tampilkan) }, meta: null });
    };
}

export function updateTourHandler(service: TourService): RequestHandler {
    return async (req, res) => {
        const { kunci } = TourParamsSchema.parse(req.params);
        const body = UpdateTourBodySchema.parse(req.body);
        const tur = await service.simpan(requireAuthContext(res), kunci, body.status, body.versi);
        res.setHeader("Cache-Control", "no-store");
        res.status(200).json({ success: true, data: { tur: tampilkan(tur) }, meta: null });
    };
}
