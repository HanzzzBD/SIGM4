// Permukaan publik m20-settings (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint `api/` — `repositories/`, `controllers/`,
// dan `services/` privat terhadap modul ini.
export type { SettingsModuleDeps } from "./routes.js";
export { getSettingsRoute, settingsRouter, updateSettingsRoute } from "./routes.js";
