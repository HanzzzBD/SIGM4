// Route M-11 (SDD-AUTH-01, PM-01) + perakit router modul. Katalog: m11-damage-reports.md §7.
// PR-03-14 memasang `POST /damage-reports` dan `GET /damage-reports/open`; daftar, detail, dan
// verifikasi menyusul PR-03-15/PR-03-16.

import { DamageReportCreateSchema, DamageReportCreatedResponseSchema, DamageReportOpenQuerySchema, DamageReportOpenResponseSchema } from "@sigm4/schemas";
import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { createDamageReportHandler, openDamageReportHandler } from "./controllers/damage-report.controller.js";
import { DamageReportService } from "./services/damage-report.service.js";

/** Pemilik katalog endpoint M-11 (m11-damage-reports.md §7). */
const MODUL = "m11-damage-reports";

/** FR-11.1 — tiket `DILAPORKAN` bernomor KRS; 1–5 foto, unggahannya boleh tertunda (A2, keputusan 20b). */
export const createDamageReportRoute = defineRoute({
    method: "POST",
    path: "/damage-reports",
    permission: "damage.create",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Laporkan kerusakan aset atau ruangan beserta 1–5 foto (FR-11.1)",
    successStatus: 201,
    body: DamageReportCreateSchema,
    response: DamageReportCreatedResponseSchema,
});

/** FR-11.1 A1 — tiket terbuka atas aset/ruangan; `null` bila tidak ada (keputusan 20c/20e). */
export const openDamageReportRoute = defineRoute({
    method: "GET",
    path: "/damage-reports/open",
    permission: "damage.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tiket kerusakan terbuka untuk aset atau ruangan tertentu (FR-11.1 A1)",
    params: DamageReportOpenQuerySchema,
    response: DamageReportOpenResponseSchema,
});

export interface DamageReportsModuleDeps {
    readonly db: Kysely<Database>;
    readonly clock: Clock;
    readonly auditLogger: AuditLogger;
}

/** Router M-11. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function damageReportsRouter(
    deps: DamageReportsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const laporan = new DamageReportService(deps.db, deps.clock, deps.auditLogger);
    const router = express.Router();
    router.get(openDamageReportRoute.path, batasi(openDamageReportRoute), otorisasi(openDamageReportRoute.permission), openDamageReportHandler(laporan));
    router.post(createDamageReportRoute.path, batasi(createDamageReportRoute), otorisasi(createDamageReportRoute.permission), createDamageReportHandler(laporan));
    return router;
}
