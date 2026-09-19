// Permukaan publik m01-auth (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/` — `repositories/`, `controllers/`, dan `services/` privat.
export type { AuthModuleDeps } from "./routes.js";
export { authRouter, loginRoute, refreshRoute } from "./routes.js";
