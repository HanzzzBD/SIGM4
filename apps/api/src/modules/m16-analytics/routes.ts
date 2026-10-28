import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { AnalyticsTypeSchema, AnalyticsQuerySchema, AnalyticsResponseSchema, AnalyticsCatalogResponseSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { AnalyticsService } from "./service.js";
import type { AnalyticsProviderRegistry } from "./registry.js";
export const analyticsRoutes = [
    defineRoute({ method: "GET", path: "/analytics", permission: "report.view", module: "m16-analytics", rateLimitClass: "default", query: z.object({}).strict(), response: AnalyticsCatalogResponseSchema, summary: "Jenis laporan sesuai izin dan kesiapan perhitungan" }),
    defineRoute({ method: "GET", path: "/analytics/:jenis", permission: "report.view", module: "m16-analytics", rateLimitClass: "default", params: z.object({ jenis: AnalyticsTypeSchema }), query: AnalyticsQuerySchema, response: AnalyticsResponseSchema, summary: "Laporan terpaginasi dengan scope sebelum agregasi" }),
] as const;
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => { const r = schema.safeParse(input); if (!r.success) throw new DomainError("INVALID_REQUEST"); return r.data; };
export function analyticsRouter(d: { db: Kysely<Database>; clock: Clock; providers?: AnalyticsProviderRegistry }, limit: (r: RouteDefinition) => RequestHandler, authorize: (permission: string) => RequestHandler) {
    const router = express.Router(), service = new AnalyticsService(d.db, d.clock, d.providers);
    router.get("/analytics", limit(analyticsRoutes[0]), authorize("report.view"), async (req, res) => { parse(analyticsRoutes[0].query, req.query); res.setHeader("Cache-Control", "private, no-store"); res.json({ success: true, data: service.catalog(requireAuthContext(res)), meta: null }); });
    router.get("/analytics/:jenis", limit(analyticsRoutes[1]), authorize("report.view"), async (req, res) => { const { jenis } = parse(analyticsRoutes[1].params, req.params), query = parse(AnalyticsQuerySchema, req.query); res.setHeader("Cache-Control", "private, no-store"); res.json(await service.report(requireAuthContext(res), jenis, query)); });
    return router;
}
