// Permukaan publik m11-damage-reports (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/` dan `worker/`.
export type { DamageReportsModuleDeps } from "./routes.js";
export { createDamageReportRoute, damageReportsRouter, getDamageReportRoute, openDamageReportRoute, verifyDamageReportRoute } from "./routes.js";
export { EVENT_KERUSAKAN_DILAPORKAN } from "./services/damage-report.service.js";
export { EVENT_KERUSAKAN_DIVERIFIKASI } from "./services/verification.service.js";
export type { TiketTerkunci } from "./repositories/damage-report.repository.js";
/** Titik ekstensi work order (keputusan 21d) — dipanggil M-12 di Phase 04. */
export { TitikWorkOrderKerusakan } from "./services/work-order-hook.js";
