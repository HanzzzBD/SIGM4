// Permukaan publik modul web m07-reservation-room (SDD-11 §4.1).
export const loadRoomCalendarPage = () => import("./RoomCalendarPage");
export type { PencarianKalender, PilihanSlot } from "./RoomCalendarPage";
export { TAMPILAN, hariIniWib } from "./kalender";
export type { Tampilan } from "./kalender";
export const loadReservationWizardPage = () => import("./ReservationWizardPage");
export { isianDariSlot } from "./pengajuan";
export type { IsianWizard } from "./pengajuan";
