// Permukaan publik m03-locations (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { LocationsModuleDeps } from "./routes.js";
export {
    createAreaRoute,
    createBuildingRoute,
    createRoomRoute,
    getLocationTreeRoute,
    getRoomRoute,
    exportLocationRoute,
    locationsRouter,
    updateBuildingStatusRoute,
    updateRoomRoute,
    updateRoomStatusRoute,
} from "./routes.js";
export type { RuanganReservasi } from "./services/reservation-eligibility.js";
export { idRuanganDariKode, ruanganUntukReservasi } from "./services/reservation-eligibility.js";
export { materialStorageRoom,materialStorageOptions } from "./services/storage-room.js";
export { chatRooms } from "./repositories/chat.repository.js";
