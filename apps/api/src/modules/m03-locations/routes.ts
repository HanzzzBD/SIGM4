// Route M-03 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import {
    createAreaHandler,
    createBuildingHandler,
    createRoomHandler,
    getLocationTreeHandler,
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
    SingleAreaResponseSchema,
    SingleBuildingResponseSchema,
    SingleRoomResponseSchema,
    UpdateLocationStatusBodySchema,
    UpdateRoomBodySchema,
} from "./schemas/location.schema.js";
import { LocationService } from "./services/location.service.js";

/** Pemilik katalog endpoint M-03 (m03-locations.md §7). */
const MODUL = "m03-locations";

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
