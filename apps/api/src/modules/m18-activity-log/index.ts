// Permukaan publik m18-activity-log (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { ActivityLogModuleDeps } from "./routes.js";
export { activityLogRouter, listActivityLogsRoute } from "./routes.js";
