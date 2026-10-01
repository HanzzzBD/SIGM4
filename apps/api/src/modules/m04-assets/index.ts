// Permukaan publik m04-assets (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { AssetsModuleDeps } from "./routes.js";
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
export { gantiUuidAset, tandaiQrTerpasang } from "./services/qr-aset.js";
