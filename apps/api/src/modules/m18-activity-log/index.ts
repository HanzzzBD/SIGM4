// Permukaan publik m18-activity-log (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { ActivityLogModuleDeps } from "./routes.js";
export {
    activityLogRouter,
    exportActivityLogsRoute,
    listActivityLogsRoute,
} from "./routes.js";
export type { EntriTerbaru } from "./services/dashboard-source.js";
export { aktivitasPerHari, aktivitasTerbaru, catatAksesLogDashboard, ringkasanLogin } from "./services/dashboard-source.js";
export type { EntriRiwayat } from "./services/entity-history.js";
export { BATAS_RIWAYAT, riwayatEntitas } from "./services/entity-history.js";
