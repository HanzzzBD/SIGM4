// Permukaan publik m04-assets (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { AssetsModuleDeps } from "./routes.js";
export { movementDocumentRoute, movementDocumentDownloadRoute } from "./routes.js";
export { MovementDocumentService, MOVEMENT_DOCUMENT_JOB_NAME, EVENT_MOVEMENT_DOCUMENT_REQUESTED, movementDocumentQueueId } from "./services/movement-document.service.js";
export { importAssetsRoute, getAssetImportRoute, assetImportTemplateRoute } from "./routes.js";
export { AssetImportService, EVENT_ASSET_IMPORT_COMPLETED, EVENT_ASSET_IMPORT_REQUESTED } from "./services/asset-import.service.js";
export { AssetImportRunner, ASSET_IMPORT_JOB_NAME, assetImportQueueId } from "./jobs/asset-import.job.js";
export {
    assetsRouter,
    createAssetRoute,
    createCategoryRoute,
    deleteCategoryRoute,
    listCategoriesRoute,
    updateCategoryRoute,
    listAssetsRoute,
    listRoomAssetsRoute,
    moveAssetsRoute,
    updateAssetConditionRoute,
} from "./routes.js";
export type { RingkasanAset } from "./services/dashboard-source.js";
export { ringkasanAset } from "./services/dashboard-source.js";
/** Job `slot-activation` (BR-005b, SDD-AVL-11) — M-04 tetap pemilik `assets.status`. */
export type { HasilSinkronStatus } from "./services/reservation-status.js";
export { sinkronkanStatusDireservasi } from "./services/reservation-status.js";
/** Kolom QR `assets` atas permintaan M-05 (FR-05.1, PR-03-01). */
export type { LabelAset } from "./services/qr-aset.js";
export { asetUntukLabel, gantiUuidAset, tandaiQrTerpasang } from "./services/qr-aset.js";
/** Resolusi pindaian QR atas permintaan M-05 (FR-05.2, PR-03-03). */
export type { AsetPindaian, LokasiAset, ProfilPublikAset } from "./services/scan-aset.js";
export { asetByUuid, profilPublikAset } from "./services/scan-aset.js";
/** Bentuk item katalog — dipakai ulang respons pemindaian M-05 (keputusan 3a log phase-03). */
export { AssetCatalogItemSchema } from "./schemas/asset.schema.js";
/** Keberadaan aset bagi tautan dokumen M-06 (FR-06.1 A3, PR-03-06). */
export { asetTidakTerdaftar } from "./services/aset-terdaftar.js";
export type { UbahKondisiInput } from "./services/asset.service.js";
export { AssetService } from "./services/asset.service.js";
