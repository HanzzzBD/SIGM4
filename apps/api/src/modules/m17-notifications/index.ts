// Permukaan publik m17-notifications (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint.
export type { KonsumenDeps } from "./services/consumers.js";
export { pasangKonsumenNotifikasi } from "./services/consumers.js";
export type { Terbitan } from "./services/notification.service.js";
export { NotificationService } from "./services/notification.service.js";
export type { Templat } from "./services/templates.js";
export { TEMPLAT, templatUntuk } from "./services/templates.js";
