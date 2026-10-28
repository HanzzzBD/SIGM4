import { z } from "zod";
import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { MovementDocumentService } from "../services/movement-document.service.js";
export const MovementDocumentParamsSchema = z.object({ id: z.coerce.number().int().positive().safe().transform(String) });
export const movementDocumentHandler = (service: MovementDocumentService, download: boolean): RequestHandler => async (req, res) => {
    const { id } = MovementDocumentParamsSchema.parse(req.params);
    const ctx = requireAuthContext(res);
    const data = download ? await service.download(ctx, id) : await service.status(ctx, id);
    res.json({ success: true, data, meta: null });
};
