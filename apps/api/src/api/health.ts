// Route kesehatan sigm4-api (SDD-OBS-06, SDD-15 §4.5).
//
// Dua probe publik dan `/health` ringkasan sama-sama dipasang `api/index.ts`;
// ringkasan di belakang `authorize('setting.view')` (PM-02, PR-01-15) karena ia
// membeberkan status seluruh dependensi, sementara kedua probe tidak.

import express from "express";
import type { RequestHandler, Router } from "express";
import { z } from "zod";
import { defineRoute } from "../shared/http/index.js";
import type { RouteDefinition } from "../shared/http/index.js";
import type {
    HealthRegistry,
    ProbeResponse,
} from "../shared/observability/index.js";
import { liveResponse, readyResponse } from "../shared/observability/index.js";

/** Pemilik `/health` pada katalog endpoint M-20. */
const MODUL = "m20-settings";

const ProbeSchema = z.object({
    success: z.boolean(),
    data: z.object({ status: z.string() }),
    meta: z.null(),
});

const StatusSchema = z.enum(["up", "degraded", "down"]);

const SummarySchema = z.object({
    success: z.literal(true),
    data: z.object({
        status: StatusSchema,
        checks: z.record(
            z.string(),
            z.object({
                status: StatusSchema,
                latency_ms: z.number().optional(),
                note: z.string().optional(),
                queue: z.number().optional(),
            }),
        ),
    }),
    meta: z.null(),
});

// Kedua probe publik: OBS-04 menuntut pemantauan uptime dari luar, dan pemantau
// luar tidak memegang token (SDD-AUTH-01 §4.1).
export const healthLiveRoute = defineRoute({
    method: "GET",
    path: "/health/live",
    public: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Liveness — proses hidup",
    response: ProbeSchema,
});

export const healthReadyRoute = defineRoute({
    method: "GET",
    path: "/health/ready",
    public: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Readiness — DB, Redis, dan storage siap",
    response: ProbeSchema,
});

export const healthSummaryRoute = defineRoute({
    method: "GET",
    path: "/health",
    permission: "setting.view",
    rateLimitClass: "default",
    module: MODUL,
    summary:
        "Ringkasan kesehatan dependensi untuk kartu Kesehatan Integrasi (OBS-06)",
    response: SummarySchema,
});

function kirim(res: express.Response, r: ProbeResponse): void {
    res.status(r.statusCode).json(r.body);
}

/**
 * Router kedua probe publik. `batasi` memasang rate limit menurut kelas yang
 * dideklarasikan route itu sendiri (SDD-06 §4.2).
 */
export function healthRouter(
    health: HealthRegistry,
    batasi: (route: RouteDefinition) => RequestHandler,
): Router {
    const router = express.Router();
    router.get(healthLiveRoute.path, batasi(healthLiveRoute), (_req, res) => {
        kirim(res, liveResponse());
    });
    router.get(
        healthReadyRoute.path,
        batasi(healthReadyRoute),
        async (_req, res) => {
            kirim(res, await readyResponse(health));
        },
    );
    return router;
}

/**
 * Handler `/health` ringkasan (`setting.view`). Dipasang `healthSummaryRouter`
 * di belakang `authorize()` — bukan `healthRouter`, sebab keduanya beda kelas
 * akses: probe publik lolos tanpa apa pun, ringkasan menuntut permission.
 */
export function healthSummaryHandler(health: HealthRegistry): RequestHandler {
    return async (_req, res) => {
        res.status(200).json({
            success: true,
            data: await health.summary(),
            meta: null,
        });
    };
}

/**
 * Router `/health` ringkasan. Terpisah dari `healthRouter` karena permission
 * `otorisasi` hanya berlaku di sini — mencampurnya ke satu router membuat satu
 * router memegang dua aturan akses berbeda.
 */
export function healthSummaryRouter(
    health: HealthRegistry,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const router = express.Router();
    router.get(
        healthSummaryRoute.path,
        batasi(healthSummaryRoute),
        otorisasi(healthSummaryRoute.permission),
        healthSummaryHandler(health),
    );
    return router;
}
