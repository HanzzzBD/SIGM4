// Controller dashboard (FR-15.1; SDD-14 §4.3a, keputusan 82).

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { CardIdParamSchema, CardQuerySchema } from "../schemas/dashboard.schema.js";
import type { DashboardService } from "../services/dashboard.service.js";

export function manifestHandler(service: DashboardService): RequestHandler {
    return (_req, res) => {
        res.json({ success: true, data: service.manifes(requireAuthContext(res)), meta: null });
    };
}

export function cardHandler(service: DashboardService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = CardIdParamSchema.parse(req.params);
        const opsi = CardQuerySchema.parse(req.query);
        res.json({ success: true, data: await service.kartu(ctx, id, opsi), meta: null });
    };
}
