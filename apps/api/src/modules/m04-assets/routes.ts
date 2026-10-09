// Route M-04 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { PenyimpananObjek } from "../../shared/storage/index.js";
import { AssetMovementDocumentResponseSchema, AssetMovementDownloadResponseSchema } from "@sigm4/schemas";
import { MovementDocumentService } from "./services/movement-document.service.js";
import { movementDocumentHandler, MovementDocumentParamsSchema } from "./controllers/movement-document.controller.js";
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
import {
    createCategoryHandler,
    deleteCategoryHandler,
    listCategoriesHandler,
    updateCategoryHandler,
} from "./controllers/category.controller.js";
import {
    CategoryBodySchema,
    CategoryIdParamSchema,
    CategoryResponseSchema,
    DeleteCategoryResponseSchema,
    ListCategoriesResponseSchema,
} from "./schemas/category.schema.js";
import { CategoryService } from "./services/category.service.js";
import { z } from "zod";
import { AssetImportResponseSchema, ImportAssetsBodySchema } from "@sigm4/schemas";
import { assetImportTemplateHandler, getAssetImportHandler, importAssetsHandler } from "./controllers/asset-import.controller.js";
import { AssetImportService } from "./services/asset-import.service.js";

export const importAssetsRoute = defineRoute({ method: "POST", path: "/assets/import", permission: "asset.create", rateLimitClass: "upload", module: "m04-assets", summary: "Impor aset CSV/XLSX; >200 baris asinkron, replay 24 jam (PR-02-38)", body: ImportAssetsBodySchema, response: AssetImportResponseSchema, successStatus: 200, additionalSuccessStatuses: [202] });
export const getAssetImportRoute = defineRoute({ method: "GET", path: "/assets/import/:id", permission: "asset.create", rateLimitClass: "default", module: "m04-assets", summary: "Status dan laporan impor aset milik pengunggah", params: AssetIdParamSchema, response: AssetImportResponseSchema });
export const assetImportTemplateRoute = defineRoute({ method: "GET", path: "/assets/import/template", permission: "asset.create", rateLimitClass: "default", module: "m04-assets", summary: "Template XLSX impor aset E.5.1", response: z.string(), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

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

/** FR-04.5 langkah 1: daftar kategori (pilihan pada form aset, langkah 3). */
export const listCategoriesRoute = defineRoute({
    method: "GET",
    path: "/asset-categories",
    permission: "asset.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar kategori aset (FR-04.5)",
    response: ListCategoriesResponseSchema,
});

/** FR-04.5 langkah 2-3, A1. Baris endpoint ditambahkan ke PRD §7 lebih dulu (keputusan 62). */
export const createCategoryRoute = defineRoute({
    method: "POST",
    path: "/asset-categories",
    permission: "category.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat kategori aset (FR-04.5)",
    body: CategoryBodySchema,
    response: CategoryResponseSchema,
});

/** FR-04.5 A1, A4. */
export const updateCategoryRoute = defineRoute({
    method: "PUT",
    path: "/asset-categories/:id",
    permission: "category.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui kategori aset (FR-04.5)",
    params: CategoryIdParamSchema,
    body: CategoryBodySchema,
    response: CategoryResponseSchema,
});

/** FR-04.5 A2, A3 — hanya kategori yang tak dipakai aset dan tanpa subkategori. */
export const deleteCategoryRoute = defineRoute({
    method: "DELETE",
    path: "/asset-categories/:id",
    permission: "category.manage",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Hapus kategori aset yang tidak dipakai (FR-04.5)",
    params: CategoryIdParamSchema,
    response: DeleteCategoryResponseSchema,
});

export const movementDocumentRoute = defineRoute({ method: "GET", path: "/assets/movements/:id/document", permission: "asset_movement_document.view",
    rateLimitClass: "default", module: MODUL, summary: "Status berita acara mutasi (FR-04.4)", params: MovementDocumentParamsSchema, response: AssetMovementDocumentResponseSchema });
export const movementDocumentDownloadRoute = defineRoute({ method: "GET", path: "/assets/movements/:id/document/download", permission: "asset_movement_document.view",
    rateLimitClass: "default", module: MODUL, summary: "URL PDF mutasi privat 15 menit; diaudit (FR-04.4)", params: MovementDocumentParamsSchema, response: AssetMovementDownloadResponseSchema });

export interface AssetsModuleDeps {
    readonly penyimpanan: PenyimpananObjek;
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
    /** `APP_BASE_URL` tervalidasi — dasar `qr_url` (FR-05.1, PR-03-01). */
    readonly appBaseUrl: string;
}

/** Router M-04. `batasi`/`otorisasi` datang dari perakit `api/index.ts`. */
export function assetsRouter(
    deps: AssetsModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new AssetService(deps.db, deps.auditLogger, deps.clock);
    const kategori = new CategoryService(deps.db, deps.auditLogger);
    const router = express.Router();
    const importer = new AssetImportService(deps.db, deps.auditLogger, deps.clock);
    const documents = new MovementDocumentService(deps.db, deps.auditLogger, deps.clock, deps.penyimpanan);
    router.get(movementDocumentRoute.path, batasi(movementDocumentRoute), otorisasi(movementDocumentRoute.permission), movementDocumentHandler(documents, false));
    router.get(movementDocumentDownloadRoute.path, batasi(movementDocumentDownloadRoute), otorisasi(movementDocumentDownloadRoute.permission), movementDocumentHandler(documents, true));
    router.get(assetImportTemplateRoute.path, batasi(assetImportTemplateRoute), otorisasi(assetImportTemplateRoute.permission), assetImportTemplateHandler(importer));
    router.get(getAssetImportRoute.path, batasi(getAssetImportRoute), otorisasi(getAssetImportRoute.permission), getAssetImportHandler(importer));
    router.post(importAssetsRoute.path, batasi(importAssetsRoute), otorisasi(importAssetsRoute.permission), importAssetsHandler(importer));

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
        createAssetHandler(service, deps.appBaseUrl),
    );
    router.get(
        listAssetsRoute.path,
        batasi(listAssetsRoute),
        otorisasi(listAssetsRoute.permission),
        listAssetsHandler(service, deps.appBaseUrl),
    );
    router.patch(
        updateAssetConditionRoute.path,
        batasi(updateAssetConditionRoute),
        otorisasi(updateAssetConditionRoute.permission),
        updateAssetConditionHandler(service, deps.appBaseUrl),
    );
    router.post(
        moveAssetsRoute.path,
        batasi(moveAssetsRoute),
        otorisasi(moveAssetsRoute.permission),
        moveAssetsHandler(service, deps.appBaseUrl),
    );

    router.get(
        listCategoriesRoute.path,
        batasi(listCategoriesRoute),
        otorisasi(listCategoriesRoute.permission),
        listCategoriesHandler(kategori),
    );
    router.post(
        createCategoryRoute.path,
        batasi(createCategoryRoute),
        otorisasi(createCategoryRoute.permission),
        createCategoryHandler(kategori),
    );
    router.put(
        updateCategoryRoute.path,
        batasi(updateCategoryRoute),
        otorisasi(updateCategoryRoute.permission),
        updateCategoryHandler(kategori),
    );
    router.delete(
        deleteCategoryRoute.path,
        batasi(deleteCategoryRoute),
        otorisasi(deleteCategoryRoute.permission),
        deleteCategoryHandler(kategori),
    );

    return router;
}
