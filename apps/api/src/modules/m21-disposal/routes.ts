import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { Kysely } from "kysely";
import { DisposalCreateSchema, DisposalQuerySchema, DisposalExecuteSchema, DisposalReinstateSchema, DisposalCancelSchema, DisposalCandidatesResponseSchema, DisposalListResponseSchema, DisposalDetailResponseSchema } from "@sigm4/schemas";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import type { PembangkitPdf } from "../../shared/pdf/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { ApprovalService } from "../m10-approval/index.js";
import { DisposalSubmissionService } from "./services/submission.service.js";
import { DisposalExecutionService } from "./services/execution.service.js";
import { DisposalReportService } from "./services/report.service.js";
import { createDisposalRepository } from "./repositories/disposal.repository.js";
import { registerDisposals } from "./registration.js";
const base = { module: "m21-disposal", rateLimitClass: "default" as const }, params = z.object({ id: z.string().regex(/^[1-9]\d*$/) });
const options = z.object({ success: z.literal(true), data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })), rooms: z.array(z.object({ id: z.string(), nama: z.string() })) }), meta: z.null() });
const mutation = (path: string, permission: string, body: z.ZodType, method: "POST" | "PUT" = "POST") => defineRoute({ ...base, path, method, permission, body, ...(path.includes(":id") ? { params } : {}), idempotent: true, response: DisposalDetailResponseSchema, successStatus: path === "/asset-disposals" ? 201 : 200, summary: path });
export const disposalRoutes: readonly RouteDefinition[] = [
    defineRoute({ ...base, method: "GET", path: "/asset-disposals/candidates", permission: "disposal.create", query: DisposalQuerySchema, response: DisposalCandidatesResponseSchema, summary: "Kandidat dan data pendukung penghapusan, berhalaman" }),
    defineRoute({ ...base, method: "GET", path: "/asset-disposals/options", permission: "disposal.view", response: options, summary: "Filter kategori/lokasi dan lokasi pemulihan" }),
    defineRoute({ ...base, method: "GET", path: "/asset-disposals", permission: "disposal.view", query: DisposalQuerySchema, response: DisposalListResponseSchema, summary: "Daftar usulan/arsip dan total nilai menurut izin" }),
    ...(["xlsx", "pdf"] as const).map(format => defineRoute({ ...base, method: "GET", path: `/asset-disposals/export/${format}`, permission: "disposal.view", query: DisposalQuerySchema, response: z.string(), contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", summary: `Ekspor arsip ${format.toUpperCase()}` })),
    defineRoute({ ...base, method: "GET", path: "/asset-disposals/:id/report", permission: "disposal.view", params, response: z.object({ success: z.literal(true), data: z.object({ status: z.string(), file_id: z.string().nullable(), url: z.string().nullable() }), meta: z.null() }), summary: "URL berita acara persisten sesuai izin finansial" }),
    defineRoute({ ...base, method: "GET", path: "/asset-disposals/:id", permission: "disposal.view", params, response: DisposalDetailResponseSchema, summary: "Detail penghapusan, bukti dan data pendukung" }),
    mutation("/asset-disposals", "disposal.create", DisposalCreateSchema), mutation("/asset-disposals/:id", "disposal.create", DisposalCreateSchema, "PUT"),
    mutation("/asset-disposals/:id/cancel", "disposal.create", DisposalCancelSchema), mutation("/asset-disposals/:id/execute", "disposal.execute", DisposalExecuteSchema),
    mutation("/asset-disposals/:id/report/retry", "disposal.execute", z.object({}).strict()), mutation("/assets/:id/reinstate", "disposal.reinstate", DisposalReinstateSchema),
];
function parse<T>(schema: z.ZodType<T>, value: unknown): T { const r = schema.safeParse(value); if (!r.success) throw new DomainError("VALIDATION_ERROR", "Isian penghapusan tidak sah.", { errors: r.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) }); return r.data; }
export function disposalsRouter(deps: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; storage: PenyimpananObjek; pdf: PembangkitPdf }, limit: (r: RouteDefinition) => RequestHandler, authorize: (p: string) => RequestHandler) {
    registerDisposals(deps.audit, deps.clock);
    const router = express.Router(), submission = new DisposalSubmissionService(deps.clock, deps.audit, new ApprovalService(deps.db, deps.audit, deps.clock)), execution = new DisposalExecutionService(deps.clock, deps.audit), report = new DisposalReportService(deps.db, deps.clock, deps.audit, deps.storage);
    for (const route of disposalRoutes) {
        const handler: RequestHandler = async (req, res) => {
            const ctx = requireAuthContext(res), repo = createDisposalRepository(deps.db);
            if (route.method === "GET") {
                if (route.path.endsWith("/options")) { const [categories, rooms] = await Promise.all([deps.db.selectFrom("asset_categories").select(["id", "nama"]).orderBy("nama").execute(), deps.db.selectFrom("rooms").select(["id", "nama"]).where("status", "=", "AKTIF").orderBy("nama").execute()]); res.json({ success: true, data: { categories, rooms }, meta: null }); return; }
                if (route.path.includes("/export/")) { const output = await report.export(ctx, parse(DisposalQuerySchema, req.query), route.path.endsWith("pdf") ? "PDF" : "XLSX", deps.pdf); res.type(route.contentType!).setHeader("Content-Disposition", `attachment; filename="${output.filename}"`); res.send(output.bytes); return; }
                if (route.path.endsWith("/candidates")) { const result = await withTransaction(ctx, scope => createDisposalRepository(scope.tx).candidates(ctx, scope, parse(DisposalQuerySchema, req.query), deps.clock.now()), deps.db); res.json({ success: true, ...result }); return; }
                if (route.path === "/asset-disposals") { res.json({ success: true, ...await repo.list(ctx, parse(DisposalQuerySchema, req.query)) }); return; }
                const id = parse(params, req.params).id;
                res.json({ success: true, data: route.path.endsWith("/report") ? await report.download(ctx, id) : await repo.detail(ctx, id, deps.storage), meta: null }); return;
            }
            const body = parse(route.body!, req.body ?? {});
            const response = await runIdempotent(deps.db, ctx, { key: req.header("Idempotency-Key") ?? "", endpoint: `${route.method} ${req.path}`, body: req.body ?? {} }, async scope => {
                let id = route.path === "/asset-disposals" ? undefined : parse(params, req.params).id;
                if (route.path === "/asset-disposals" || route.method === "PUT") id = await submission.save(scope, DisposalCreateSchema.parse(body), id);
                else if (route.path.endsWith("/cancel")) await submission.cancel(scope, id!, DisposalCancelSchema.parse(body).alasan);
                else if (route.path.endsWith("/execute")) await execution.execute(scope, id!, DisposalExecuteSchema.parse(body));
                else if (route.path.endsWith("/reinstate")) id = await execution.reinstate(scope, id!, DisposalReinstateSchema.parse(body));
                else await report.retry(scope, id!);
                return { statusCode: route.successStatus ?? 200, body: { success: true, data: await createDisposalRepository(scope.tx).detail(ctx, id!), meta: null } };
            }); res.status(response.statusCode).json(response.body);
        };
        if (route.method === "GET") router.get(route.path, limit(route), authorize(route.permission!), handler);
        else if (route.method === "PUT") router.put(route.path, limit(route), authorize(route.permission!), handler);
        else router.post(route.path, limit(route), authorize(route.permission!), handler);
    } return router;
}
