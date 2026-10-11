// Permukaan publik m18-activity-log web (SDD-11 §4.1). P-73, P-74 dimuat malas (SDD-11 §4.7).
export const loadActivityLogPage = () => import("./ActivityLogPage");
export const loadActivityLogDetailPage = () => import("./ActivityLogDetailPage");
export type { SaringanLog } from "./api";
