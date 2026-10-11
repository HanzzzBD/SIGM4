// Permukaan publik m20-settings web (SDD-11 §4.1). P-70, P-71, P-72 dimuat malas (SDD-11 §4.7).
export const loadParameterPage = () => import("./ParameterPage");
export const loadCalendarPage = () => import("./CalendarPage");
export const loadWorkUnitPage = () => import("./WorkUnitPage");
export type { Kelompok, SaringanUnit } from "./api";
export { JENIS_UNIT, KELOMPOK, STATUS_UNIT } from "./api";
