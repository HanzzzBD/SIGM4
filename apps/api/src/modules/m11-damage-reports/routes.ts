// Route M-11 (SDD-AUTH-01, PM-01) + perakit router modul. Katalog: m11-damage-reports.md §7.
// PR-03-14: `POST /damage-reports`, `GET /damage-reports/open`. PR-03-15: `GET /damage-reports/{id}`,
// `POST /damage-reports/{id}/verify`. Daftar menyusul PR-03-16.

import {
    DamageReportCreateSchema,
    DamageReportCreatedResponseSchema,
    DamageReportDetailResponseSchema,
    DamageReportIdParamSchema,
    DamageReportOpenQuerySchema,
    DamageReportOpenResponseSchema,
    DamageReportVerifiedResponseSchema,
    DamageReportVerifySchema,
} from "@sigm4/schemas";
import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { createDamageReportHandler, getDamageReportHandler, openDamageReportHandler, verifyDamageReportHandler } from "./controllers/damage-report.controller.js";
import { DamageReportQueryService } from "./services/damage-report-query.service.js";
import { DamageReportService } from "./services/damage-report.service.js";
import { VerificationService } from "./services/verification.service.js";

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

/** FR-11.2 langkah 1–2, A3 — deskripsi, foto, garansi aktif; scope `own` = milik sendiri (keputusan 21a). */
export const getDamageReportRoute = defineRoute({
    method: "GET",
    path: "/damage-reports/:id",
    permission: "damage.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Detail tiket kerusakan beserta foto dan peringatan garansi (FR-11.2)",
    params: DamageReportIdParamSchema,
    response: DamageReportDetailResponseSchema,
});

/** FR-11.2 langkah 3–5 (keputusan 21b/21c): tindak lanjut, perbaikan ringan, atau tolak beralasan. */
export const verifyDamageReportRoute = defineRoute({
    method: "POST",
    path: "/damage-reports/:id/verify",
    permission: "damage.verify",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Verifikasi / tolak tiket kerusakan; kondisi aset opsional (FR-11.2)",
    successStatus: 200,
    params: DamageReportIdParamSchema,
    body: DamageReportVerifySchema,
    response: DamageReportVerifiedResponseSchema,
});

export interface DamageReportsModuleDeps {
    readonly db: Kysely<Database>;
    readonly clock: Clock;
    readonly auditLogger: AuditLogger;
    /** URL foto `CLEAN` pada detail (SDD-FS-03). */
    readonly penyimpanan: PenyimpananObjek;
}

/** Router M-11. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function damageReportsRouter(
    deps: DamageReportsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const laporan = new DamageReportService(deps.db, deps.clock, deps.auditLogger);
    const router = express.Router();
    // `/open` SEBELUM pola `/:id` agar tak tertangkap sebagai id.
    router.get(openDamageReportRoute.path, batasi(openDamageReportRoute), otorisasi(openDamageReportRoute.permission), openDamageReportHandler(laporan));
    router.get(getDamageReportRoute.path, batasi(getDamageReportRoute), otorisasi(getDamageReportRoute.permission), getDamageReportHandler(new DamageReportQueryService(deps.db, deps.clock, deps.penyimpanan)));
    router.post(verifyDamageReportRoute.path, batasi(verifyDamageReportRoute), otorisasi(verifyDamageReportRoute.permission), verifyDamageReportHandler(new VerificationService(deps.db, deps.clock, deps.auditLogger)));
    router.post(createDamageReportRoute.path, batasi(createDamageReportRoute), otorisasi(createDamageReportRoute.permission), createDamageReportHandler(laporan));
    return router;
}
