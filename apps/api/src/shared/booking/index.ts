// Permukaan publik shared/booking (SDD-SYS-06, SDD-SYS-10). Modul memesan dan
// melepas slot HANYA lewat SlotService; tabel booking_slots tidak disentuh langsung.
export type {
    AlokasiUnit,
    AsalSlot,
    JenisSumberDaya,
    PesanSlot,
    RentangWaktu,
    RujukanSlot,
    SlotRow,
    StatusAwal,
    StatusSlot,
    SumberDaya,
} from "./slot-service.js";
export { SlotService } from "./slot-service.js";
