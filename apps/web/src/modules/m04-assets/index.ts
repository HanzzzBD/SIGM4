export const loadAssetImportPage = () => import("./AssetImportPage");
export const loadAssetMovementPage = () => import("./AssetMovementPage");
// P-15/P-18 (PR-02-45) — dimuat malas.
export const loadInventoryPage = () => import("./InventoryPage");
export const loadAssetDetailPage = () => import("./AssetDetailPage");
export type { TabAset } from "./AssetDetailPage";
export { KONDISI, STATUS, URUTAN } from "./katalog";
export type { SaringanKatalog } from "./katalog";
