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
// Konteks objek bagi P-38 Detail Keputusan (PR-02-44).
export { RingkasanReservasi } from "./RingkasanReservasi";
// Panel blokade ruangan — aksi sekunder P-27 (PR-03-13), dimuat malas.
export const loadRoomBlocksPanel = () => import("./RoomBlocksPanel");
