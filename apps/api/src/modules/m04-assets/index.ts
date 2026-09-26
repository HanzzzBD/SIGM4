// Permukaan publik m04-assets (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { AssetsModuleDeps } from "./routes.js";
export {
    assetsRouter,
    createAssetRoute,
    listAssetsRoute,
    listRoomAssetsRoute,
    moveAssetsRoute,
    updateAssetConditionRoute,
} from "./routes.js";
