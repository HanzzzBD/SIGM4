// Permukaan publik m03-locations (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { LocationsModuleDeps } from "./routes.js";
export {
    createAreaRoute,
    createBuildingRoute,
    createRoomRoute,
    getLocationTreeRoute,
    locationsRouter,
    updateBuildingStatusRoute,
    updateRoomRoute,
    updateRoomStatusRoute,
} from "./routes.js";
export type { RuanganReservasi } from "./services/reservation-eligibility.js";
export { ruanganUntukReservasi } from "./services/reservation-eligibility.js";
