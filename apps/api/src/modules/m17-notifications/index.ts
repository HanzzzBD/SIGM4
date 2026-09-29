// Permukaan publik m17-notifications (SDD-SYS-03). Hanya berkas ini yang boleh
// diimpor modul lain / entrypoint.
export type { NotificationsModuleDeps } from "./routes.js";
export {
    buatHubSse,
    listNotificationsRoute,
    markAllReadRoute,
    markReadRoute,
    notificationsRouter,
    streamNotificationsRoute,
} from "./routes.js";
export type { KlienSse, PesanSiaran } from "./services/fanout.js";
export { HubSse, PenyiarNotifikasi, kanalPengguna } from "./services/fanout.js";
export { BATCH_ARSIP, UMUR_ARSIP_HARI, arsipkanNotifikasi } from "./services/archive.js";
export type { KonsumenDeps } from "./services/consumers.js";
export { pasangKonsumenNotifikasi } from "./services/consumers.js";
export type { Terbitan } from "./services/notification.service.js";
export { NotificationService } from "./services/notification.service.js";
export type { Templat } from "./services/templates.js";
export { TEMPLAT, templatUntuk } from "./services/templates.js";
