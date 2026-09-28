// Controller linimasa persetujuan (FR-10.3): validasi parameter (SDD-API-01), lalu delegasi.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { InstanceIdParamSchema } from "../schemas/decision.schema.js";
import type { HistoryService } from "../services/history.service.js";

export function historyHandler(service: HistoryService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = InstanceIdParamSchema.parse(req.params);
        res.status(200).json({ success: true, data: await service.linimasa(ctx, id), meta: null });
    };
}
