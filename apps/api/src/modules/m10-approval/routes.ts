// Route M-10 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { delegateHandler } from "./controllers/delegation.controller.js";
import { DelegateBodySchema, DelegateResponseSchema } from "./schemas/delegation.schema.js";
import { ApprovalService } from "./services/approval.service.js";

/** Pemilik katalog endpoint M-10 (m10-approval.md §7). */
const MODUL = "m10-approval";

/** FR-10.2 A3, RE-12, SDD-APR-16 (keputusan 67). */
export const delegateRoute = defineRoute({
    method: "POST",
    path: "/approvals/delegate",
    permission: "approval.delegate",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tetapkan approver pengganti untuk rentang tanggal (FR-10.2 A3)",
    body: DelegateBodySchema,
    response: DelegateResponseSchema,
});

export interface ApprovalModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
}

/** Router M-10. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function approvalRouter(
    deps: ApprovalModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new ApprovalService(deps.db, deps.auditLogger, deps.clock);
    const router = express.Router();
    router.post(delegateRoute.path, batasi(delegateRoute), otorisasi(delegateRoute.permission), delegateHandler(service));
    return router;
}
