// Route M-04 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import {
    createAssetHandler,
    listAssetsHandler,
    listRoomAssetsHandler,
    moveAssetsHandler,
    updateAssetConditionHandler,
} from "./controllers/asset.controller.js";
import {
    AssetIdParamSchema,
    CreateAssetBodySchema,
    CreateAssetResponseSchema,
    ListAssetsResponseSchema,
    MoveAssetsBodySchema,
    MoveAssetsResponseSchema,
    RoomAssetsResponseSchema,
    RoomIdParamSchema,
    UpdateAssetConditionBodySchema,
    UpdateAssetConditionResponseSchema,
} from "./schemas/asset.schema.js";
import { AssetService } from "./services/asset.service.js";

/** Pemilik katalog endpoint M-04 (m04-assets.md §7). */
const MODUL = "m04-assets";

/** FR-03.2 langkah 2-3: daftar aset per ruangan + ringkasan kondisi/status. */
export const listRoomAssetsRoute = defineRoute({
    method: "GET",
    path: "/rooms/:id/assets",
    permission: "asset.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar aset per ruangan + ringkasan kondisi (FR-03.2)",
    params: RoomIdParamSchema,
    response: RoomAssetsResponseSchema,
});

/** FR-04.1 langkah 2-6, A1. `jumlah_unit` > 1 menghasilkan N record (BR-001). */
export const createAssetRoute = defineRoute({
    method: "POST",
    path: "/assets",
    permission: "asset.create",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftarkan aset baru (mendukung N unit sekaligus)",
    body: CreateAssetBodySchema,
    response: CreateAssetResponseSchema,
});

/** FR-04.2 langkah 2-4: katalog aset — pencarian, filter, dan paginasi (SDD-API-05). */
export const listAssetsRoute = defineRoute({
    method: "GET",
    path: "/assets",
    permission: "asset.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Katalog aset: pencarian, filter, dan paginasi (FR-04.2)",
    response: ListAssetsResponseSchema,
});

/**
 * FR-04.3 langkah 1-4. Permission `asset.update_condition` (bukan `asset.update`
 * — katalog `m04-assets.md` §10 + seed RBAC `0010` memberi Teknisi scope
 * `ASSIGNED` khusus di sini; tabel endpoint §7 keliru menyebut `asset.update`,
 * dikonfirmasi pemilik produk).
 */
export const updateAssetConditionRoute = defineRoute({
    method: "PATCH",
    path: "/assets/:id/condition",
    permission: "asset.update_condition",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Ubah kondisi aset + alasan wajib, riwayat kondisi (FR-04.3)",
    params: AssetIdParamSchema,
    body: UpdateAssetConditionBodySchema,
    response: UpdateAssetConditionResponseSchema,
});

/**
 * FR-04.4 langkah 1-4 (`asset.update` — katalog §10: "Menyunting aset & mutasi
 * lokasi"). `200`, bukan bawaan POST `201`: tidak ada sumber daya baru yang
 * dibuat, aset yang ada dipindahkan.
 */
export const moveAssetsRoute = defineRoute({
    method: "POST",
    path: "/assets/move",
    permission: "asset.update",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Mutasi lokasi aset (1..50 sekaligus, atomik) + riwayat mutasi (FR-04.4)",
    body: MoveAssetsBodySchema,
    response: MoveAssetsResponseSchema,
    successStatus: 200,
});

export interface AssetsModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
}

/** Router M-04. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function assetsRouter(
    deps: AssetsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new AssetService(deps.db, deps.auditLogger, deps.clock);
    const router = express.Router();

    router.get(
        listRoomAssetsRoute.path,
        batasi(listRoomAssetsRoute),
        otorisasi(listRoomAssetsRoute.permission),
        listRoomAssetsHandler(service),
    );
    router.post(
        createAssetRoute.path,
        batasi(createAssetRoute),
        otorisasi(createAssetRoute.permission),
        createAssetHandler(service),
    );
    router.get(
        listAssetsRoute.path,
        batasi(listAssetsRoute),
        otorisasi(listAssetsRoute.permission),
        listAssetsHandler(service),
    );
    router.patch(
        updateAssetConditionRoute.path,
        batasi(updateAssetConditionRoute),
        otorisasi(updateAssetConditionRoute.permission),
        updateAssetConditionHandler(service),
    );
    router.post(
        moveAssetsRoute.path,
        batasi(moveAssetsRoute),
        otorisasi(moveAssetsRoute.permission),
        moveAssetsHandler(service),
    );

    return router;
}
