// Route M-20 (SDD-AUTH-01, PM-01) + perakit router modul. `GET /health` juga
// tercantum di `m20-settings.md` §7 tetapi sudah dimiliki `api/health.ts` (PR-01-15).

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { getSettingsHandler, updateSettingsHandler } from "./controllers/setting.controller.js";
import {
    ListSettingsResponseSchema,
    UpdateSettingsBodySchema,
    UpdateSettingsResponseSchema,
} from "./schemas/setting.schema.js";
import { SettingService } from "./services/setting.service.js";

/** Pemilik katalog endpoint M-20 (m20-settings.md §7). */
const MODUL = "m20-settings";

/** FR-20.1 langkah 1-2: parameter (terpaginasi, dapat disaring per kelompok) beserta penjelasan, nilai bawaan, dan rentangnya. */
export const getSettingsRoute = defineRoute({
    method: "GET",
    path: "/settings",
    permission: "setting.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Baca parameter sistem",
    response: ListSettingsResponseSchema,
});

/** FR-20.1 langkah 3-4: simpan; nilai di luar rentang ditolak dengan penjelasan (A1). */
export const updateSettingsRoute = defineRoute({
    method: "PUT",
    path: "/settings",
    permission: "setting.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui parameter sistem",
    body: UpdateSettingsBodySchema,
    response: UpdateSettingsResponseSchema,
});

export interface SettingsModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
}

/** Router M-20. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function settingsRouter(
    deps: SettingsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new SettingService(deps.db, deps.auditLogger);
    const router = express.Router();

    router.get(
        getSettingsRoute.path,
        batasi(getSettingsRoute),
        otorisasi(getSettingsRoute.permission),
        getSettingsHandler(service),
    );
    router.put(
        updateSettingsRoute.path,
        batasi(updateSettingsRoute),
        otorisasi(updateSettingsRoute.permission),
        updateSettingsHandler(service),
    );

    return router;
}
