// Route M-15 (SDD-AUTH-01, PM-01; keputusan 82) + perakit router.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { ApprovalService, DecisionService } from "../m10-approval/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { getRedis } from "../../shared/cache/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { HealthRegistry } from "../../shared/observability/index.js";
import { cardHandler, manifestHandler } from "./controllers/dashboard.controller.js";
import { CardIdParamSchema, CardResponseSchema, ManifestResponseSchema } from "./schemas/dashboard.schema.js";
import type { PenyimpanKartu } from "./services/dashboard.service.js";
import { DashboardService } from "./services/dashboard.service.js";

const MODUL = "m15-dashboard";
const PERMISSION = "dashboard.view";

/** FR-15.1 langkah 1–2: manifes kartu yang boleh dilihat, tanpa data. */
export const dashboardManifestRoute = defineRoute({
    method: "GET",
    path: "/dashboard",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Manifes kartu dashboard saya (sesuai role & permission)",
    response: ManifestResponseSchema,
});

/** FR-15.1 langkah 2–3, 19.1: data satu kartu; permission kartu diperiksa di layanan. */
export const dashboardCardRoute = defineRoute({
    method: "GET",
    path: "/dashboard/cards/:id",
    permission: PERMISSION,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Data satu kartu dashboard (?rentang=7_hari|30_hari|semester|tahun_ajaran&segarkan=true)",
    params: CardIdParamSchema,
    response: CardResponseSchema,
});

export interface DashboardModuleDeps {
    readonly db: Kysely<Database>;
    readonly clock: Clock;
    readonly auditLogger: AuditLogger;
    /** Sumber kartu Kesehatan Integrasi (OBS-06). */
    readonly health: HealthRegistry;
    /** Bawaan: Redis bersama (SDD-14 §4.3). */
    readonly cache?: PenyimpanKartu | undefined;
}

/** Cache kartu di Redis (SDD-14 §4.3a). */
export function penyimpanRedis(): PenyimpanKartu {
    return {
        baca: (kunci) => getRedis().get(kunci),
        tulis: async (kunci, nilai, ttl) => {
            await getRedis().set(kunci, nilai, "EX", ttl);
        },
    };
}

export function dashboardRouter(
    deps: DashboardModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const approval = new ApprovalService(deps.db, deps.auditLogger, deps.clock);
    const keputusan = new DecisionService(deps.db, deps.auditLogger, deps.clock, approval, []);
    const service = new DashboardService(
        deps.clock,
        {
            db: deps.db,
            audit: deps.auditLogger,
            integrasi: async () => (await deps.health.summary()).checks,
            menungguSaya: (ctx, batas) => keputusan.pending(ctx, 1, batas),
        },
        deps.cache ?? penyimpanRedis(),
    );
    const router = express.Router();
    router.get(dashboardManifestRoute.path, batasi(dashboardManifestRoute), otorisasi(PERMISSION), manifestHandler(service));
    router.get(dashboardCardRoute.path, batasi(dashboardCardRoute), otorisasi(PERMISSION), cardHandler(service));
    return router;
}
