// Controller keputusan persetujuan (FR-10.2): validasi skema (SDD-API-01), lalu delegasi.
// `decide` berjalan di dalam `runIdempotent` — kunci, keputusan, dan respons tersimpan
// commit bersama (ID-01 … ID-05, SDD-AVL-08).

import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { requireAuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { runIdempotent } from "../../../shared/http/index.js";
import { DecideBodySchema, InstanceIdParamSchema, ListPendingQuerySchema } from "../schemas/decision.schema.js";
import type { DecisionService } from "../services/decision.service.js";

export function decideHandler(db: Kysely<Database>, service: DecisionService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const { id } = InstanceIdParamSchema.parse(req.params);
        const b = DecideBodySchema.parse(req.body);
        const hasil = await runIdempotent(
            db,
            ctx,
            { key: req.header("Idempotency-Key") ?? "", endpoint: `POST /approvals/${String(id)}/decide`, body: req.body },
            async (scope) => ({
                statusCode: 200,
                body: {
                    success: true as const,
                    data: await service.putuskan(scope, id, { urutan: b.urutan, keputusan: b.keputusan, catatan: b.catatan ?? null }),
                    meta: null,
                },
            }),
        );
        res.status(hasil.statusCode).json(hasil.body);
    };
}

export function listPendingHandler(service: DecisionService): RequestHandler {
    return async (req, res) => {
        const ctx = requireAuthContext(res);
        const q = ListPendingQuerySchema.parse({ page: req.query["page"], per_page: req.query["per_page"] });
        const { rows, total } = await service.pending(ctx, q.page, q.per_page);
        res.status(200).json({
            success: true,
            data: rows,
            meta: { page: q.page, per_page: q.per_page, total, total_pages: total === 0 ? 1 : Math.ceil(total / q.per_page) },
        });
    };
}
