// Permukaan publik m11-damage-reports (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/` dan `worker/`.
export type { DamageReportsModuleDeps } from "./routes.js";
export { createDamageReportRoute, damageReportsRouter, openDamageReportRoute } from "./routes.js";
export { EVENT_KERUSAKAN_DILAPORKAN } from "./services/damage-report.service.js";
