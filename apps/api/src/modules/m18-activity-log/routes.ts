// Route M-18 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import {
    exportActivityLogsHandler,
    listActivityLogsHandler,
} from "./controllers/activity-log.controller.js";
import {
    ExportActivityLogsResponseSchema,
    ListActivityLogsResponseSchema,
} from "./schemas/activity-log.schema.js";
import { ActivityLogService } from "./services/activity-log.service.js";

/** Pemilik katalog endpoint M-18 (m18-activity-log.md §7). */
const MODUL = "m18-activity-log";

/** FR-18.2 langkah 2-4: telusuri, filter kombinasi, tabel sudah terpaginasi. */
export const listActivityLogsRoute = defineRoute({
    method: "GET",
    path: "/activity-logs",
    permission: "activity_log.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Telusuri activity log (filter tanggal, pengguna, role, modul, aksi, entitas)",
    response: ListActivityLogsResponseSchema,
});

/** FR-18.2 langkah 5, AL-10: ekspor hasil filter ke XLSX; aksi ekspor itu sendiri tercatat. */
export const exportActivityLogsRoute = defineRoute({
    method: "GET",
    path: "/activity-logs/export",
    permission: "activity_log.export",
    rateLimitClass: "export",
    module: MODUL,
    summary: "Ekspor hasil filter activity log ke XLSX",
    response: ExportActivityLogsResponseSchema,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

export interface ActivityLogModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
}

/** Router M-18. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function activityLogRouter(
    deps: ActivityLogModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new ActivityLogService(deps.db, deps.auditLogger);
    const router = express.Router();

    router.get(
        listActivityLogsRoute.path,
        batasi(listActivityLogsRoute),
        otorisasi(listActivityLogsRoute.permission),
        listActivityLogsHandler(service),
    );
    router.get(
        exportActivityLogsRoute.path,
        batasi(exportActivityLogsRoute),
        otorisasi(exportActivityLogsRoute.permission),
        exportActivityLogsHandler(service),
    );

    return router;
}
