// Route M-10 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { decideHandler, listPendingHandler } from "./controllers/decision.controller.js";
import { delegateHandler } from "./controllers/delegation.controller.js";
import { DecideBodySchema, DecideResponseSchema, InstanceIdParamSchema, ListPendingResponseSchema } from "./schemas/decision.schema.js";
import { DelegateBodySchema, DelegateResponseSchema } from "./schemas/delegation.schema.js";
import { ApprovalService } from "./services/approval.service.js";
import type { PenanganHasil } from "./services/decision.service.js";
import { DecisionService } from "./services/decision.service.js";

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

/** FR-10.2 langkah 2 + AC "hanya langkah yang menjadi kewenangannya". */
export const listPendingRoute = defineRoute({
    method: "GET",
    path: "/approvals/pending",
    permission: "approval.decide",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Pengajuan yang menunggu keputusan saya (FR-10.2)",
    response: ListPendingResponseSchema,
});

/** FR-10.2 langkah 4-7, A1, A5, A6; RE-09 first-responder-wins; ID-01 (keputusan 69). */
export const decideRoute = defineRoute({
    method: "POST",
    path: "/approvals/:id/decide",
    permission: "approval.decide",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Setujui, tolak, atau minta revisi langkah persetujuan (FR-10.2)",
    idempotent: true,
    params: InstanceIdParamSchema,
    body: DecideBodySchema,
    response: DecideResponseSchema,
});

export interface ApprovalModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
    /** SDD-APR-17: penangan hasil per jenis pengajuan; didaftarkan modul pengajuan (Phase 03). */
    readonly penanganHasil?: readonly PenanganHasil[];
}

/** Router M-10. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function approvalRouter(
    deps: ApprovalModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new ApprovalService(deps.db, deps.auditLogger, deps.clock);
    const keputusan = new DecisionService(deps.db, deps.auditLogger, deps.clock, service, deps.penanganHasil);
    const router = express.Router();
    // `/approvals/pending` SEBELUM pola `/:id/...` agar tidak tertangkap sebagai id.
    router.get(listPendingRoute.path, batasi(listPendingRoute), otorisasi(listPendingRoute.permission), listPendingHandler(keputusan));
    router.post(decideRoute.path, batasi(decideRoute), otorisasi(decideRoute.permission), decideHandler(deps.db, keputusan));
    router.post(delegateRoute.path, batasi(delegateRoute), otorisasi(delegateRoute.permission), delegateHandler(service));
    return router;
}
