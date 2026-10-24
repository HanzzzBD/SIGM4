import express from "express";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { z } from "zod";
import { AssetExportQuerySchema, ReportExportResponseSchema, ReportExportListResponseSchema, ReportExportDownloadResponseSchema } from "@sigm4/schemas";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { createAnalyticsProviders } from "./providers/production.js";
import { ReportExportService } from "./exports/service.js";
import { currentExportActor } from "./exports/authorization.js";
import { validateExportFilter } from "./exports/dataset.js";

const base = { method: "GET" as const, permission: "asset.export", module: "m04-assets", rateLimitClass: "default" as const };
const id = z.object({ id: z.coerce.number().int().positive().safe().transform(String) });
export const assetExportRoutes = [
    defineRoute({ ...base, path: "/assets/export", query: AssetExportQuerySchema, response: ReportExportResponseSchema, successStatus: 202, idempotent: true, summary: "Ekspor seluruh hasil saringan katalog melalui worker; Idempotency-Key wajib" }),
    defineRoute({ ...base, path: "/assets/exports", query: z.object({}).strict(), response: ReportExportListResponseSchema, summary: "25 ekspor katalog terbaru milik pemanggil" }),
    defineRoute({ ...base, path: "/assets/exports/:id", params: id, query: z.object({}).strict(), response: ReportExportResponseSchema, summary: "Status ekspor katalog milik pemanggil" }),
    defineRoute({ ...base, path: "/assets/exports/:id/download", params: id, query: z.object({}).strict(), response: ReportExportDownloadResponseSchema, summary: "URL privat ekspor katalog setelah revalidasi izin dan scope" }),
] as const;
/** M-04 memiliki data/policy; M-16 menyediakan infrastruktur worker/file ekspor. */
export function assetExportsRouter(d: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; storage: PenyimpananObjek }, limit: (r: RouteDefinition) => RequestHandler, authorize: (p: string) => RequestHandler) {
    const router = express.Router(), providers = createAnalyticsProviders(), service = new ReportExportService(d.db, d.clock, d.audit, d.storage, providers);
    for (const r of assetExportRoutes) router.get(r.path, limit(r), authorize(r.permission), async (req, res) => {
        const ctx = requireAuthContext(res); res.setHeader("Cache-Control", "private, no-store");
        if (r.path === "/assets/export") {
            const query = AssetExportQuerySchema.parse(req.query), { format, q, sort, ...rest } = query;
            const filter = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key.slice(7, -1), value]));
            const body = { format, filter: { ...filter, q, sort } }, actor = await currentExportActor(d.db, ctx, ctx.userId);
            validateExportFilter(actor.ctx, "assets", body, d.clock, providers);
            const result = await runIdempotent(d.db, actor.ctx, { key: req.header("Idempotency-Key") ?? "", endpoint: "GET /assets/export", body: { actor_id: ctx.userId, ...body } }, async scope => ({ statusCode: 202, body: { success: true, data: await service.request(scope, "assets", body), meta: null } }));
            res.status(result.statusCode).json(result.body); return;
        }
        z.object({}).strict().parse(req.query);
        const data = r.path === "/assets/exports" ? await service.list(ctx, "assets") : r.path.endsWith("/download") ? await service.download(ctx, id.parse(req.params).id, "assets") : await service.status(ctx, id.parse(req.params).id, "assets");
        res.json({ success: true, data, meta: null });
    });
    return router;
}
