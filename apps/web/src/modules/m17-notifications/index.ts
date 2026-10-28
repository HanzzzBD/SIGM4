// Permukaan publik m17-notifications web (SDD-11 §4.1). P-13 dan P-78 dimuat malas (SDD-11 §4.7);
// lonceng ikut bundel shell karena selalu tampil di topbar.
export const loadNotificationCenterPage = () => import("./NotificationCenterPage");
export type { PencarianNotifikasi } from "./NotificationCenterPage";
export { TAMPILAN_NOTIFIKASI } from "./NotificationCenterPage";
export const loadPreferencesPage = () => import("./PreferencesPage");
export { Lonceng } from "./Lonceng";
export { KELOMPOK } from "./api";
