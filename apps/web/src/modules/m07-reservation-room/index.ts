// Permukaan publik modul web m07-reservation-room (SDD-11 §4.1).
export const loadRoomCalendarPage = () => import("./RoomCalendarPage");
export type { PencarianKalender, PilihanSlot, ReservasiSlot } from "./RoomCalendarPage";
export { TAMPILAN, hariIniWib } from "./kalender";
export type { Tampilan } from "./kalender";
export const loadReservationWizardPage = () => import("./ReservationWizardPage");
export { isianDariSlot } from "./pengajuan";
export type { IsianWizard } from "./pengajuan";
// P-30/P-31 (PR-03-27) — dimuat malas (SDD-11 §4.7).
export const loadReservationListPage = () => import("./ReservationListPage");
export type { PencarianDaftar } from "./ReservationListPage";
export const loadReservationDetailPage = () => import("./ReservationDetailPage");
export { isianDariReservasi } from "./pengajuan";
export { detailReservasiQuery } from "./api";
