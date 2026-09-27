// Controller delegasi approver (FR-10.2 A3): validasi skema (SDD-API-01), lalu delegasi.

import type { RequestHandler } from "express";
import { requireAuthContext } from "../../../shared/auth/index.js";
import { DelegateBodySchema } from "../schemas/delegation.schema.js";
import type { ApprovalService } from "../services/approval.service.js";

export function delegateHandler(service: ApprovalService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const b = DelegateBodySchema.parse(req.body);
        res.status(201).json({
            success: true,
            data: await service.delegasikan(ctx, { penerimaId: b.penerima_id, mulai: b.mulai, selesai: b.selesai }),
            meta: null,
        });
    };
}
