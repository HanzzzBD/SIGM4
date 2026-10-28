import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { MaintenanceScheduleInputSchema, MaintenanceScheduleQuerySchema, MaintenanceReasonSchema, MaintenanceScheduleResponseSchema, MaintenanceScheduleListSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { MaintenanceScheduleService } from "./services/maintenance-schedule.service.js";
import { registerPreventiveSkipTimeline } from "./schedule-registration.js";

const params = z.object({ id: z.string().regex(/^[1-9]\d*$/) });
const base = { module: "m12-maintenance", permission: "maintenance.manage", rateLimitClass: "default" as const };
export const maintenanceScheduleRoutes = [
    defineRoute({ ...base, method: "GET", path: "/maintenance-schedules/:id/work-orders", summary: "Work order dari jadwal preventif", params, query: z.object({ page: z.coerce.number().int().positive().default(1) }), response: z.object({ success: z.literal(true), data: z.array(z.object({ id: z.string(), nomor: z.string(), asset_id: z.string().nullable(), status: z.string(), menunggu_ketersediaan_aset: z.boolean(), target_selesai: z.string() })), meta: z.null() }) }),
    defineRoute({ ...base, method: "GET", path: "/maintenance-schedules/options", summary: "Pilihan kategori dan teknisi jadwal", response: z.object({ success: z.literal(true), data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string(), interval_preventif_hari: z.number().nullable() })), technicians: z.array(z.object({ id: z.string(), nama: z.string() })) }), meta: z.null() }) }),
    defineRoute({ ...base, method: "GET", path: "/maintenance-schedules/assets", summary: "Pemilih aset kategori", query: z.object({ category_id: z.string().regex(/^[1-9]\d*$/), page: z.coerce.number().int().positive().default(1) }), response: z.object({ success: z.literal(true), data: z.array(z.object({ id: z.string(), nama: z.string(), kode_barang: z.string() })), meta: z.null() }) }),
    defineRoute({ ...base, method: "GET", path: "/maintenance-schedules", summary: "Daftar jadwal preventif", query: MaintenanceScheduleQuerySchema, response: MaintenanceScheduleListSchema }),
    defineRoute({ ...base, method: "POST", path: "/maintenance-schedules", idempotent: true, summary: "Buat jadwal preventif", body: MaintenanceScheduleInputSchema, response: MaintenanceScheduleResponseSchema }),
    defineRoute({ ...base, method: "GET", path: "/maintenance-schedules/:id", summary: "Detail jadwal preventif", params, response: MaintenanceScheduleResponseSchema }),
    defineRoute({ ...base, method: "PUT", path: "/maintenance-schedules/:id", idempotent: true, summary: "Ubah jadwal preventif", params, body: MaintenanceScheduleInputSchema, response: MaintenanceScheduleResponseSchema }),
    ...(["deactivate", "skip"] as const).map(action => defineRoute({ ...base, method: "POST", path: `/maintenance-schedules/:id/${action}`, idempotent: true, successStatus: 200, summary: action === "skip" ? "Lewati satu siklus" : "Nonaktifkan jadwal", params, body: MaintenanceReasonSchema, response: MaintenanceScheduleResponseSchema })),
];
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new DomainError("VALIDATION_ERROR", "Isian jadwal tidak sah.", { errors: result.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) });
    return result.data;
}
export function maintenanceSchedulesRouter(deps: { db: Kysely<Database>; clock: Clock; audit: AuditLogger }, limit: (r: RouteDefinition) => RequestHandler, authorize: (p: string) => RequestHandler) {
    registerPreventiveSkipTimeline();
    const router = express.Router(), service = new MaintenanceScheduleService(deps.db, deps.clock, deps.audit);
    for (const route of maintenanceScheduleRoutes) {
        const handler: RequestHandler = async (req, res) => {
            const ctx = requireAuthContext(res);
            if (route.method === "GET") {
                if (route.path.endsWith("/work-orders")) { const q = parse(z.object({ page: z.coerce.number().int().positive().default(1) }), req.query); res.json({ success: true, data: await service.orders(ctx, parse(params, req.params).id, q.page), meta: null }); }
                else if (route.path.endsWith("/options")) res.json({ success: true, data: await service.options(), meta: null });
                else if (route.path.endsWith("/assets")) { const q = parse(z.object({ category_id: z.string().regex(/^[1-9]\d*$/), page: z.coerce.number().int().positive().default(1) }), req.query); res.json({ success: true, data: await service.assetOptions(q.category_id, q.page), meta: null }); }
                else if (route.path === "/maintenance-schedules") res.json({ success: true, ...await service.list(ctx, parse(MaintenanceScheduleQuerySchema, req.query)) });
                else res.json({ success: true, data: await service.detail(ctx, parse(params, req.params).id), meta: null });
                return;
            }
            const id = route.method === "POST" && route.path === "/maintenance-schedules" ? null : parse(params, req.params).id;
            const input = route.body === MaintenanceReasonSchema ? parse(MaintenanceReasonSchema, req.body) : parse(MaintenanceScheduleInputSchema, req.body);
            const result = await runIdempotent(deps.db, ctx, { key: req.header("Idempotency-Key") ?? "", endpoint: `${route.method} ${req.path}`, body: req.body }, async scope => {
                const data = "alasan" in input ? await service.action(scope, id!, route.path.endsWith("/skip") ? "skip" : "deactivate", input.alasan) : id === null ? await service.create(scope, input) : await service.update(scope, id, input);
                return { statusCode: id === null ? 201 : 200, body: { success: true, data, meta: null } };
            });
            res.status(result.statusCode).json(result.body);
        };
        if (route.method === "GET") router.get(route.path, limit(route), authorize(route.permission!), handler);
        else if (route.method === "PUT") router.put(route.path, limit(route), authorize(route.permission!), handler);
        else router.post(route.path, limit(route), authorize(route.permission!), handler);
    }
    return router;
}
