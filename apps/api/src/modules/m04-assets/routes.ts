// Route M-04 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { listRoomAssetsHandler } from "./controllers/asset.controller.js";
import { RoomAssetsResponseSchema, RoomIdParamSchema } from "./schemas/asset.schema.js";
import { AssetService } from "./services/asset.service.js";

/** Pemilik katalog endpoint M-04 (m04-assets.md §7). */
const MODUL = "m04-assets";

/**
 * FR-03.2 langkah 2-3 — KERANGKA (fase ini): `assets` belum ada (`PR-02-10`),
 * jadi `data.assets` selalu kosong. Filter divalidasi agar kontrak stabil saat
 * data sungguhan tersambung.
 */
export const listRoomAssetsRoute = defineRoute({
    method: "GET",
    path: "/rooms/:id/assets",
    permission: "asset.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar aset per ruangan + ringkasan kondisi (kerangka, FR-03.2)",
    params: RoomIdParamSchema,
    response: RoomAssetsResponseSchema,
});

export interface AssetsModuleDeps {
    readonly db: Kysely<Database>;
}

/** Router M-04. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function assetsRouter(
    deps: AssetsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new AssetService(deps.db);
    const router = express.Router();

    router.get(
        listRoomAssetsRoute.path,
        batasi(listRoomAssetsRoute),
        otorisasi(listRoomAssetsRoute.permission),
        listRoomAssetsHandler(service),
    );

    return router;
}
