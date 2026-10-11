export const loadAssetImportPage = () => import("./AssetImportPage");
export const loadAssetMovementPage = () => import("./AssetMovementPage");
// P-15/P-18 (PR-02-45) — dimuat malas.
export const loadInventoryPage = () => import("./InventoryPage");
export const loadAssetDetailPage = () => import("./AssetDetailPage");
export type { TabAset } from "./AssetDetailPage";
export { KONDISI, STATUS, URUTAN } from "./katalog";
export type { SaringanKatalog } from "./katalog";
// P-16/P-19/P-21 (PR-02-46) — dimuat malas.
export const loadAddAssetPage = () => import("./AddAssetPage");
export const loadEditAssetPage = () => import("./EditAssetPage");
export const loadCategoryPage = () => import("./CategoryPage");
