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
import { historyHandler } from "./controllers/history.controller.js";
import { createRuleHandler, listRulesHandler, previewRuleHandler, ruleStatusHandler, updateRuleHandler } from "./controllers/rule.controller.js";
import { DecideBodySchema, DecideResponseSchema, InstanceIdParamSchema, ListPendingResponseSchema } from "./schemas/decision.schema.js";
import { DelegateBodySchema, DelegateResponseSchema } from "./schemas/delegation.schema.js";
import { HistoryResponseSchema } from "@sigm4/schemas";
import { DefinisiAturanSchema, PreviewBodySchema, PreviewResponseSchema, RuleIdParamSchema, RuleListResponseSchema, RuleResponseSchema, StatusAturanBodySchema } from "./schemas/rule.schema.js";
import { ApprovalService } from "./services/approval.service.js";
import type { PenanganHasil } from "./services/decision.service.js";
import { DecisionService } from "./services/decision.service.js";
import { HistoryService } from "./services/history.service.js";
import { RuleConfigService } from "./services/rule-config.service.js";

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

/** FR-10.1: daftar aturan (aktif & nonaktif) beserta definisi D.5 utuh — P-68/P-69 (keputusan 77). */
export const listRulesRoute = defineRoute({
    method: "GET",
    path: "/approval-rules",
    permission: "approval_rule.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar approval rule beserta definisinya (FR-10.1)",
    response: RuleListResponseSchema,
});

/** FR-10.1 langkah 2-6; RE-08 (422 INVALID_RULE_DEFINITION). */
export const createRuleRoute = defineRoute({
    method: "POST",
    path: "/approval-rules",
    permission: "approval_rule.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat approval rule + langkah (FR-10.1)",
    body: DefinisiAturanSchema,
    response: RuleResponseSchema,
});

/** FR-10.1 A4 + AC versi (keputusan 77b): definisi utuh diganti, versi naik. */
export const updateRuleRoute = defineRoute({
    method: "PUT",
    path: "/approval-rules/:id",
    permission: "approval_rule.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Ganti definisi approval rule; instance berjalan tetap memakai snapshot (FR-10.1 A4)",
    params: RuleIdParamSchema,
    body: DefinisiAturanSchema,
    response: RuleResponseSchema,
});

/** FR-10.1 A4 (keputusan 77b). */
export const ruleStatusRoute = defineRoute({
    method: "PATCH",
    path: "/approval-rules/:id/status",
    permission: "approval_rule.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Aktifkan / nonaktifkan approval rule (FR-10.1 A4)",
    params: RuleIdParamSchema,
    body: StatusAturanBodySchema,
    response: RuleResponseSchema,
});

/** RE-07 + FR-10.1 AC 3: pratinjau sebelum simpan, evaluator yang sama (SDD-APR-10). `200`: tak ada yang dibuat. */
export const previewRuleRoute = defineRoute({
    method: "POST",
    path: "/approval-rules/preview",
    permission: "approval_rule.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Pratinjau aturan & jalur persetujuan yang akan terbentuk (RE-07)",
    successStatus: 200,
    body: PreviewBodySchema,
    response: PreviewResponseSchema,
});

/** FR-10.3: linimasa; scope `own` dievaluasi layanan (A1, keputusan 76). */
export const historyRoute = defineRoute({
    method: "GET",
    path: "/approvals/:id/history",
    permission: "approval.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Linimasa persetujuan sebuah pengajuan (FR-10.3)",
    params: InstanceIdParamSchema,
    response: HistoryResponseSchema,
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
    /** SDD-APR-17: daftar eksplisit (uji). Tanpa ini: registri proses `penanganHasil`, dipakai juga worker (keputusan 75). */
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
    const aturan = new RuleConfigService(deps.db, deps.auditLogger, service);
    router.get(listRulesRoute.path, batasi(listRulesRoute), otorisasi(listRulesRoute.permission), listRulesHandler(aturan));
    // `/preview` SEBELUM pola `/:id` — tak ada bentrok metode, tetapi urutan menjaga kejelasan.
    router.post(previewRuleRoute.path, batasi(previewRuleRoute), otorisasi(previewRuleRoute.permission), previewRuleHandler(aturan));
    router.post(createRuleRoute.path, batasi(createRuleRoute), otorisasi(createRuleRoute.permission), createRuleHandler(aturan));
    router.put(updateRuleRoute.path, batasi(updateRuleRoute), otorisasi(updateRuleRoute.permission), updateRuleHandler(aturan));
    router.patch(ruleStatusRoute.path, batasi(ruleStatusRoute), otorisasi(ruleStatusRoute.permission), ruleStatusHandler(aturan));
    router.get(historyRoute.path, batasi(historyRoute), otorisasi(historyRoute.permission), historyHandler(new HistoryService(deps.db, deps.clock, service)));
    return router;
}
