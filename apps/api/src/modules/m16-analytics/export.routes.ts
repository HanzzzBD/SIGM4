import { analyticsFilterOptions } from "./options.js";
import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { AnalyticsTypeSchema, AnalyticsExportBodySchema, ReservationExportBodySchema, DamageExportBodySchema, ReportExportResponseSchema, ReportExportListResponseSchema, ReportExportDownloadResponseSchema, AnalyticsFilterOptionsResponseSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { createAnalyticsProviders } from "./providers/production.js";
import type { AnalyticsProviderRegistry } from "./registry.js";
import { ReportExportService } from "./exports/service.js";
import { currentExportActor } from "./exports/authorization.js";
import { validateExportFilter } from "./exports/dataset.js";
const base = { module: "m16-analytics", permission: "report.export", rateLimitClass: "default" as const };
const id = z.object({ id: z.coerce.number().int().positive().safe().transform(String) });
export const reportExportRoutes = [
    defineRoute({ ...base, permission: "report.view", method: "GET", path: "/analytics/:jenis/options", params: z.object({ jenis: AnalyticsTypeSchema }), query: z.object({}).strict(), response: AnalyticsFilterOptionsResponseSchema, summary: "Pilihan filter dalam irisan scope laporan/domain" }),
    defineRoute({ ...base, method: "POST", path: "/analytics/:jenis/export", params: z.object({ jenis: AnalyticsTypeSchema }), body: AnalyticsExportBodySchema, idempotent: true, successStatus: 202, response: ReportExportResponseSchema, summary: "Ajukan ekspor analitik ke worker" }),
    defineRoute({ ...base, method: "POST", path: "/reservations/export", body: ReservationExportBodySchema, idempotent: true, successStatus: 202, response: ReportExportResponseSchema, summary: "Ekspor seluruh daftar reservasi tersaring" }),
    defineRoute({ ...base, method: "POST", path: "/damage-reports/export", body: DamageExportBodySchema, idempotent: true, successStatus: 202, response: ReportExportResponseSchema, summary: "Ekspor seluruh daftar kerusakan tersaring" }),
    defineRoute({ ...base, method: "GET", path: "/report-exports", query: z.object({}).strict(), response: ReportExportListResponseSchema, summary: "25 ekspor terbaru milik pemanggil" }),
    defineRoute({ ...base, method: "GET", path: "/report-exports/:id", params: id, query: z.object({}).strict(), response: ReportExportResponseSchema, summary: "Status ekspor milik pemanggil" }),
    defineRoute({ ...base, method: "GET", path: "/report-exports/:id/download", params: id, query: z.object({}).strict(), response: ReportExportDownloadResponseSchema, summary: "Tautan privat lima menit setelah revalidasi cakupan" }),
] as const;
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => { const r = schema.safeParse(input); if (!r.success) throw new DomainError("INVALID_REQUEST"); return r.data; };
export function reportExportsRouter(d: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; storage: PenyimpananObjek; providers?: AnalyticsProviderRegistry }, limit: (r: RouteDefinition) => RequestHandler, authorize: (p: string) => RequestHandler) {
    const router = express.Router(), providers = d.providers ?? createAnalyticsProviders(), service = new ReportExportService(d.db, d.clock, d.audit, d.storage, providers);
    for (const r of reportExportRoutes) {
        const handler: RequestHandler = async (req, res) => {
            const ctx = requireAuthContext(res); res.setHeader("Cache-Control", "private, no-store");
            if (r.method === "GET") {
                parse(z.object({}).strict(), req.query);
                const data = r.path.endsWith("/options") ? await analyticsFilterOptions(d.db, ctx, parse(z.object({ jenis: AnalyticsTypeSchema }), req.params).jenis) : r.path === "/report-exports" ? await service.list(ctx) : r.path.endsWith("/download") ? await service.download(ctx, parse(id, req.params).id) : await service.status(ctx, parse(id, req.params).id);
                res.json({ success: true, data, meta: null }); return;
            }
            const jenis = r.path.startsWith("/analytics") ? parse(z.object({ jenis: AnalyticsTypeSchema }), req.params).jenis : r.path.startsWith("/reservations") ? "reservations" : "damage-reports";
            const body = parse<unknown>(r.body!, req.body), actor = await currentExportActor(d.db, ctx, ctx.userId);
            validateExportFilter(actor.ctx, jenis, body, d.clock, providers);
            // Bind the shared global idempotency key to this actor and endpoint as well as the payload.
            const result = await runIdempotent(d.db, actor.ctx, { key: req.header("Idempotency-Key") ?? "", endpoint: `POST ${req.path}`, body: { actor_id: actor.ctx.userId, endpoint: req.path, payload: req.body } }, async scope => ({ statusCode: 202, body: { success: true, data: await service.request(scope, jenis, body), meta: null } }));
            res.status(result.statusCode).json(result.body);
        };
        if (r.method === "GET") router.get(r.path, limit(r), authorize(r.permission), handler);
        else router.post(r.path, limit(r), authorize(r.permission), handler);
    }
    return router;
}
