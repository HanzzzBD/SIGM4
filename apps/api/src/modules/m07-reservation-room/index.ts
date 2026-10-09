// Permukaan publik m07-reservation-room (SDD-SYS-03). Hanya berkas ini yang boleh diimpor modul
// lain / entrypoint `api/`. Endpoint `/reservations` lahir `PR-03-10`.
export type { InputReservasiRuangan, ReservasiTerbentuk } from "./services/reservation.service.js";
export { ReservationService } from "./services/reservation.service.js";
