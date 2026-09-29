// Permukaan publik m15-dashboard (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/` — `controllers/`, `services/`, dan `schemas/` privat.
export type { DashboardModuleDeps } from "./routes.js";
export { dashboardCardRoute, dashboardManifestRoute, dashboardRouter, penyimpanRedis } from "./routes.js";
export type { DefinisiKartu, KonteksKartu, LayananKartu, RentangTerhitung } from "./services/cards.js";
export { KARTU, TEMPLAT } from "./services/cards.js";
export type { DataKartu, KartuManifes, PenyimpanKartu } from "./services/dashboard.service.js";
export { DashboardService, TTL_KARTU_DETIK } from "./services/dashboard.service.js";
