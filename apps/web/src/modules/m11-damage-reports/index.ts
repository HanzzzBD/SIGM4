// Permukaan publik m11-damage-reports web (SDD-11 §4.1). P-39, P-40, P-41 dimuat malas (SDD-11 §4.7).
export const loadDamageListPage = () => import("./DamageListPage");
export type { PencarianKerusakan } from "./DamageListPage";
export const loadDamageReportPage = () => import("./DamageReportPage");
export type { AwalLaporan } from "./DamageReportPage";
export const loadDamageDetailPage = () => import("./DamageDetailPage");
export { STATUS as STATUS_TIKET, URGENSI as URGENSI_TIKET } from "./api";
