import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { WorkOrderCreateSchema, WorkOrderListQuerySchema, WorkOrderListResponseSchema, WorkOrderDetailResponseSchema, WorkOrderResponseSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { defineRoute, runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { createWorkOrderRepository } from "./repositories/work-order.repository.js";
import { WorkOrderService, maskWorkOrderCosts } from "./services/work-order.service.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { executionRouter, executionRoutes } from "./execution-routes.js";
import { ExecutionQueryService } from "./services/execution-query.service.js";
import { createExecutionRepository } from "./repositories/execution.repository.js";
import { registerMaintenanceTimeline } from "./registration.js";

const params = z.object({ id: z.coerce.number().int().positive() });
const listResponse = WorkOrderListResponseSchema;
const techniciansResponse = z.object({ success: z.literal(true), data: z.array(z.object({ id: z.string(), nama: z.string(), work_order_aktif: z.string() })), meta: z.null() });
export const createWorkOrderRoute = defineRoute({ method: "POST", path: "/work-orders", module: "m12-maintenance", permission: "workorder.create", rateLimitClass: "default", summary: "Buat work order korektif", body: WorkOrderCreateSchema, response: WorkOrderResponseSchema });
export const listWorkOrdersRoute = defineRoute({ method: "GET", path: "/work-orders", module: "m12-maintenance", permission: "workorder.view", rateLimitClass: "default", summary: "Daftar work order sesuai scope", query: WorkOrderListQuerySchema, response: listResponse });
export const mineWorkOrdersRoute = defineRoute({ method: "GET", path: "/work-orders/mine", module: "m12-maintenance", permission: "workorder.execute", rateLimitClass: "default", summary: "Work order yang ditugaskan kepada saya", query: WorkOrderListQuerySchema, response: listResponse });
export const workOrderTechniciansRoute = defineRoute({ method: "GET", path: "/work-orders/technicians", module: "m12-maintenance", permission: "workorder.create", rateLimitClass: "default", summary: "Teknisi aktif dan beban pekerjaan", response: techniciansResponse });
export const getWorkOrderRoute = defineRoute({ method: "GET", path: "/work-orders/:id", module: "m12-maintenance", permission: "workorder.view", rateLimitClass: "default", summary: "Detail work order sesuai scope", params, response: WorkOrderDetailResponseSchema });
export const workOrderRoutes = [createWorkOrderRoute, listWorkOrdersRoute, mineWorkOrdersRoute, workOrderTechniciansRoute, getWorkOrderRoute, ...executionRoutes];
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) throw new DomainError("VALIDATION_ERROR", "Isian work order tidak sah.", { errors: result.error.issues.map(i => ({ field: i.path.join("."), message: i.message })) });
    return result.data;
}
export function workOrdersRouter(deps: { db: Kysely<Database>; clock: Clock; audit: AuditLogger; storage: PenyimpananObjek }, limit: (route: RouteDefinition) => RequestHandler, authorize: (permission: string) => RequestHandler) {
    registerMaintenanceTimeline();
    const router = express.Router(), service = new WorkOrderService(deps.db, deps.clock, deps.audit);
    router.post(createWorkOrderRoute.path, limit(createWorkOrderRoute), authorize(createWorkOrderRoute.permission), async (req, res) => {
        const input = parse(WorkOrderCreateSchema, req.body);
        const result = await runIdempotent(deps.db, requireAuthContext(res), { key: req.header("Idempotency-Key") ?? "", endpoint: "POST /work-orders", body: req.body }, async scope => ({ statusCode: 201, body: { success: true, data: await service.create(scope, input), meta: null } }));
        res.status(result.statusCode).json(result.body);
    });
    for (const route of [listWorkOrdersRoute, mineWorkOrdersRoute]) router.get(route.path, limit(route), authorize(route.permission!), async (req, res) => {
        const q = parse(WorkOrderListQuerySchema, req.query);
        const ctx = requireAuthContext(res), result = await createExecutionRepository(deps.db).list(ctx, q, route === mineWorkOrdersRoute);
        res.json({ success: true, data: result.data.map(row => ({...maskWorkOrderCosts(ctx,row),created_at:row.created_at.toISOString()})), meta: result.meta });
    });
    router.get(workOrderTechniciansRoute.path, limit(workOrderTechniciansRoute), authorize(workOrderTechniciansRoute.permission!), async (_req, res) => res.json({ success: true, data: await createWorkOrderRepository(deps.db).technicians(requireAuthContext(res)), meta: null }));
    router.get(getWorkOrderRoute.path, limit(getWorkOrderRoute), authorize(getWorkOrderRoute.permission), async (req, res) => res.json({ success: true, data: await new ExecutionQueryService(deps.db,deps.clock,deps.storage).detail(requireAuthContext(res),parse(params,req.params).id), meta: null }));
    router.use(executionRouter(deps,limit,authorize));
    return router;
}
