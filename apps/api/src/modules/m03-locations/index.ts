// Permukaan publik m03-locations (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { LocationsModuleDeps } from "./routes.js";
export {
    createAreaRoute,
    createBuildingRoute,
    createRoomRoute,
    locationsRouter,
    updateRoomRoute,
} from "./routes.js";
