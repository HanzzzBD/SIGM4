import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { MaterialRequestBodySchema, MaterialRequestQuerySchema, MaterialIssueBodySchema, MaterialRequestReasonSchema, MaterialRequestDetailResponseSchema, MaterialRequestListResponseSchema, MaterialReceiptBodySchema, MaterialAdjustmentBodySchema, MaterialOperationResponseSchema, MaterialThresholdOverrideSchema, MaterialReceiptHistoryQuerySchema, MaterialReceiptHistoryResponseSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { NotFoundError } from "../../shared/errors/index.js";
import { ApprovalService, HistoryService } from "../m10-approval/index.js";
import { materialRequestThresholds, setMaterialRequestThreshold } from "../m20-settings/index.js";
import { MaterialRequestSubmissionService } from "./services/request-submission.service.js";
import { MaterialRequestQueryService } from "./services/request-query.service.js";
import { MaterialIssueService } from "./services/issue.service.js";
import { MaterialReceiptService } from "./services/receipt.service.js";
import { MaterialAdjustmentService } from "./services/adjustment.service.js";
import { parseMaterial, mapMaterialWriteError } from "./routes.js";
import { registerMaterialRequests } from "./registration.js";
import { materialReceiptHistory } from "./services/receipt-query.service.js";
const params = z.object({ id: z.string().regex(/^[1-9]\d*$/) }), empty = z.object({}).strict();
const thresholdResponse = z.object({ success: z.literal(true), data: z.object({ default_qty: z.number().nullable(), batas_khusus: z.number().nullable(), batas_efektif: z.number().nullable() }), meta: z.null() });
const route = (method: RouteDefinition["method"], path: string, permission: string, summary: string, extra: { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType; response: z.ZodType; successStatus?: 200 | 201 | 202 | 204 }) => defineRoute({ method, path, permission, summary, module: "m22-materials", rateLimitClass: "default", ...extra });
export const materialBusinessRoutes = [
    route("GET", "/materials/:id/receipts", "material.view", "Bukti penerimaan langsung terverifikasi", { params, query: MaterialReceiptHistoryQuerySchema, response: MaterialReceiptHistoryResponseSchema }),
    route("POST", "/materials/:id/receipts", "material.receive", "Terima bahan dengan dokumen terverifikasi", { params, body: MaterialReceiptBodySchema, response: MaterialOperationResponseSchema, successStatus: 201 }),
    route("POST", "/materials/:id/adjustments", "material.adjust", "Sesuaikan saldo lewat ledger dengan alasan wajib", { params, body: MaterialAdjustmentBodySchema, response: MaterialOperationResponseSchema, successStatus: 201 }),
    route("GET", "/materials/:id/request-threshold", "setting.view", "Ambang permintaan bawaan dan khusus bahan", { params, response: thresholdResponse }),
    route("PUT", "/materials/:id/request-threshold", "setting.manage", "Atur ambang jumlah khusus bahan", { params, body: MaterialThresholdOverrideSchema, response: thresholdResponse }),
    route("DELETE", "/materials/:id/request-threshold", "setting.manage", "Kembalikan ambang bahan ke bawaan", { params, body: empty, response: thresholdResponse }),
    route("GET", "/material-requests", "material.view", "Permintaan bahan sesuai scope dan status", { query: MaterialRequestQuerySchema, response: MaterialRequestListResponseSchema }),
    route("POST", "/material-requests", "material.request", "Ajukan permintaan tanpa menahan stok", { body: MaterialRequestBodySchema, response: MaterialRequestDetailResponseSchema, successStatus: 201 }),
    route("GET", "/material-requests/:id", "material.view", "Detail, keputusan dan penyerahan permintaan bahan", { params, response: MaterialRequestDetailResponseSchema }),
    route("PUT", "/material-requests/:id", "material.request", "Revisi dan ajukan ulang dengan ambang terkini", { params, body: MaterialRequestBodySchema, response: MaterialRequestDetailResponseSchema }),
    route("POST", "/material-requests/:id/issue", "material.issue", "Serahkan jumlah aktual dengan pemeriksaan saldo atomik", { params, body: MaterialIssueBodySchema, response: MaterialRequestDetailResponseSchema }),
    route("POST", "/material-requests/:id/cancel", "material.request", "Batalkan sebelum penyerahan dengan alasan", { params, body: MaterialRequestReasonSchema, response: MaterialRequestDetailResponseSchema }),
    route("POST", "/material-requests/:id/close", "material.issue", "Tutup sisa setelah penyerahan sebagian", { params, body: MaterialRequestReasonSchema, response: MaterialRequestDetailResponseSchema }),
] as const;
export function materialBusinessRouter(d: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; storage: PenyimpananObjek }, limit: (r: RouteDefinition) => RequestHandler, authorize: (p: string) => RequestHandler) {
    registerMaterialRequests(d.clock, d.audit);
    const router = express.Router(), approval = new ApprovalService(d.db, d.audit, d.clock), submission = new MaterialRequestSubmissionService(d.clock, d.audit, approval), query = new MaterialRequestQueryService(new HistoryService(d.db, d.clock, approval)), issue = new MaterialIssueService(d.clock, d.audit), receipts = new MaterialReceiptService(d.clock, d.audit), adjustments = new MaterialAdjustmentService(d.clock, d.audit);
    const threshold = async (scope: Parameters<typeof materialRequestThresholds>[0], id: string) => { if (!await scope.tx.selectFrom("materials").select("id").where("id", "=", id).executeTakeFirst()) throw new NotFoundError(); const p = await materialRequestThresholds(scope, [id]); return { default_qty: p.default_qty, batas_khusus: p.overrides.get(id) ?? null, batas_efektif: p.overrides.get(id) ?? p.default_qty }; };
    for (const r of materialBusinessRoutes) {
        const handler: RequestHandler = async (req, res) => { try {
            const ctx = requireAuthContext(res), id = r.params ? parseMaterial(params, req.params).id : undefined;
            if (r.method === "GET") { const data = await withTransaction(ctx, async scope => { if (r.path.endsWith("/receipts")) {const f=parseMaterial(MaterialReceiptHistoryQuerySchema,req.query);return materialReceiptHistory(scope,id!,f.page,f.per_page,d.clock,d.storage);} if (r.path === "/material-requests") return query.list(scope, parseMaterial(MaterialRequestQuerySchema, req.query)); if (r.path.endsWith("request-threshold")) return threshold(scope, id!); return query.detail(scope, id!); }, d.db); if (r.path === "/material-requests" || r.path.endsWith("/receipts")) res.json({ success: true, ...data }); else res.json({ success: true, data, meta: null }); return; }
            const body = parseMaterial(r.body!, req.body ?? {}), response = await runIdempotent(d.db, ctx, { key: req.header("Idempotency-Key") ?? "", endpoint: `${r.method} ${req.path}`, body }, async scope => {
                let result: unknown;
                if (r.path.endsWith("request-threshold")) { await setMaterialRequestThreshold(scope, d.clock, d.audit, id!, r.method === "DELETE" ? null : MaterialThresholdOverrideSchema.parse(body).batas); result = await threshold(scope, id!); }
                else if (r.path.endsWith("/receipts")) result = await receipts.receive(scope, id!, MaterialReceiptBodySchema.parse(body));
                else if (r.path.endsWith("/adjustments")) result = await adjustments.adjust(scope, id!, MaterialAdjustmentBodySchema.parse(body));
                else { let requestId = id; if (r.path === "/material-requests" || r.method === "PUT") requestId = await submission.submit(scope, MaterialRequestBodySchema.parse(body), id); else if (r.path.endsWith("/issue")) await issue.issue(scope, id!, MaterialIssueBodySchema.parse(body)); else if (r.path.endsWith("/cancel")) await submission.cancel(scope, id!, MaterialRequestReasonSchema.parse(body).alasan); else await issue.close(scope, id!, MaterialRequestReasonSchema.parse(body).alasan); result = await query.detail(scope, requestId!); }
                return { statusCode: r.successStatus ?? 200, body: { success: true, data: result, meta: null } };
            }); res.status(response.statusCode).json(response.body);
        } catch (error) { mapMaterialWriteError(error); } };
        router[r.method === "GET" ? "get" : r.method === "PUT" ? "put" : r.method === "DELETE" ? "delete" : "post"](r.path, limit(r), authorize(r.permission!), handler);
    } return router;
}
