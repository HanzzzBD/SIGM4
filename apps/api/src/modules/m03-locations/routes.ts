// Route M-03 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import { z } from "zod";
import type { AuditLogger } from "../../shared/audit/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { SystemClock } from "../../shared/clock/index.js";
import type { Clock } from "../../shared/clock/index.js";
import { PembangkitPdfChromium } from "../../shared/pdf/index.js";
import type { PembangkitPdf } from "../../shared/pdf/index.js";
import { exportLocation } from "./services/location-export.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import {
    createAreaHandler,
    createBuildingHandler,
    createRoomHandler,
    getLocationTreeHandler,
    getRoomHandler,
    updateBuildingStatusHandler,
    updateRoomHandler,
    updateRoomStatusHandler,
} from "./controllers/location.controller.js";
import {
    CreateAreaBodySchema,
    CreateBuildingBodySchema,
    CreateRoomBodySchema,
    IdParamSchema,
    LocationTreeResponseSchema,
    LocationExportQuerySchema,
    SingleAreaResponseSchema,
    SingleBuildingResponseSchema,
    SingleRoomResponseSchema,
    UpdateLocationStatusBodySchema,
    UpdateRoomBodySchema,
} from "./schemas/location.schema.js";
import { LocationService } from "./services/location.service.js";

/** Pemilik katalog endpoint M-03 (m03-locations.md §7). */
const MODUL = "m03-locations";

export const getRoomRoute = defineRoute({ method: "GET", path: "/rooms/:id", permission: "location.view", rateLimitClass: "default", module: MODUL, summary: "Detail ruangan", params: IdParamSchema, response: SingleRoomResponseSchema });
export const exportLocationRoute = defineRoute({ method: "GET", path: "/rooms/:id/assets/export", permission: "report.export", rateLimitClass: "export", module: MODUL, summary: "Ekspor inventaris ruangan XLSX/PDF", response: z.string(), contentType: "application/octet-stream", params: IdParamSchema });

/** FR-03.1 langkah 1: pohon lokasi lengkap, dapat diperluas/diciutkan di klien. */
export const getLocationTreeRoute = defineRoute({
    method: "GET",
    path: "/locations/tree",
    permission: "location.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Pohon lokasi lengkap",
    response: LocationTreeResponseSchema,
});

export const createBuildingRoute = defineRoute({
    method: "POST",
    path: "/buildings",
    permission: "location.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat gedung baru",
    body: CreateBuildingBodySchema,
    response: SingleBuildingResponseSchema,
});

export const createAreaRoute = defineRoute({
    method: "POST",
    path: "/areas",
    permission: "location.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat lantai/area baru",
    body: CreateAreaBodySchema,
    response: SingleAreaResponseSchema,
});

export const createRoomRoute = defineRoute({
    method: "POST",
    path: "/rooms",
    permission: "location.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat ruangan baru",
    body: CreateRoomBodySchema,
    response: SingleRoomResponseSchema,
});

export const updateRoomRoute = defineRoute({
    method: "PUT",
    path: "/rooms/:id",
    permission: "location.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui ruangan",
    params: IdParamSchema,
    body: UpdateRoomBodySchema,
    response: SingleRoomResponseSchema,
});

/**
 * Penonaktifan berjenjang — KERANGKA hierarki (BR-015): gedung ditolak selagi
 * masih memiliki ruangan AKTIF di bawahnya. Pemeriksaan aset sungguhan menyusul
 * `PR-02-10` (`Database` belum memiliki tabel `assets`).
 */
export const updateBuildingStatusRoute = defineRoute({
    method: "PATCH",
    path: "/buildings/:id/status",
    permission: "location.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Aktifkan/nonaktifkan gedung berjenjang (BR-015)",
    params: IdParamSchema,
    body: UpdateLocationStatusBodySchema,
    response: SingleBuildingResponseSchema,
});

/** BR-015 di tingkat ruangan menyusul `PR-02-10` — lihat `LocationService.updateRoomStatus`. */
export const updateRoomStatusRoute = defineRoute({
    method: "PATCH",
    path: "/rooms/:id/status",
    permission: "location.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Aktifkan/nonaktifkan ruangan",
    params: IdParamSchema,
    body: UpdateLocationStatusBodySchema,
    response: SingleRoomResponseSchema,
});

export interface LocationsModuleDeps {
    readonly clock?: Clock;
    readonly pdf?: PembangkitPdf;
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
}

/**
 * Router M-03. `batasi`/`otorisasi` datang dari perakit `api/index.ts` — pola
 * yang sama dengan `usersRouter` (`PR-01-02`).
 */
export function locationsRouter(
    deps: LocationsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new LocationService(deps.db, deps.auditLogger);
    const router = express.Router();

    // Jangan menangkap endpoint statis M-07 `/rooms/availability`.
    router.get(getRoomRoute.path, (req, _res, next) => /^[1-9]\d*$/.test(String(req.params["id"])) ? next() : next("route"), batasi(getRoomRoute), otorisasi(getRoomRoute.permission), getRoomHandler(service));
    router.get(exportLocationRoute.path, batasi(exportLocationRoute), otorisasi(exportLocationRoute.permission), async (req, res) => {
        const { id } = IdParamSchema.parse(req.params);
        const filter = LocationExportQuerySchema.parse({ format: req.query["format"], q: req.query["q"], kategori_id: req.query["filter[kategori_id]"], kondisi: req.query["filter[kondisi]"], status: req.query["filter[status]"] });
        const buffer = await exportLocation(deps.db, deps.auditLogger, deps.clock ?? new SystemClock(), deps.pdf ?? new PembangkitPdfChromium(null), requireAuthContext(res), id, filter);
        res.setHeader("Cache-Control", "no-store");
        res.type(filter.format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").attachment(`inventaris-ruangan-${id}.${filter.format}`).send(buffer);
    });

    router.get(
        getLocationTreeRoute.path,
        batasi(getLocationTreeRoute),
        otorisasi(getLocationTreeRoute.permission),
        getLocationTreeHandler(service),
    );
    router.post(
        createBuildingRoute.path,
        batasi(createBuildingRoute),
        otorisasi(createBuildingRoute.permission),
        createBuildingHandler(service),
    );
    router.post(
        createAreaRoute.path,
        batasi(createAreaRoute),
        otorisasi(createAreaRoute.permission),
        createAreaHandler(service),
    );
    router.post(
        createRoomRoute.path,
        batasi(createRoomRoute),
        otorisasi(createRoomRoute.permission),
        createRoomHandler(service),
    );
    router.put(
        updateRoomRoute.path,
        batasi(updateRoomRoute),
        otorisasi(updateRoomRoute.permission),
        updateRoomHandler(service),
    );
    router.patch(
        updateBuildingStatusRoute.path,
        batasi(updateBuildingStatusRoute),
        otorisasi(updateBuildingStatusRoute.permission),
        updateBuildingStatusHandler(service),
    );
    router.patch(
        updateRoomStatusRoute.path,
        batasi(updateRoomStatusRoute),
        otorisasi(updateRoomStatusRoute.permission),
        updateRoomStatusHandler(service),
    );

    return router;
}
