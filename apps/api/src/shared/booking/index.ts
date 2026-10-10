// Permukaan publik shared/booking (SDD-SYS-06, SDD-SYS-10). Modul memesan dan
// melepas slot HANYA lewat SlotService; tabel booking_slots tidak disentuh langsung.
export type {
    AlokasiUnit,
    AsalSlot,
    JenisSumberDaya,
    PesanSlot,
    RentangWaktu,
    RujukanSlot,
    SlotReservasi,
    SlotRow,
    SlotTerpakai,
    StatusAwal,
    StatusSlot,
    SumberDaya,
} from "./slot-service.js";
export { BATCH_KEDALUWARSA, EVENT_SLOT_TENTATIF_KEDALUWARSA, SlotService, adaSlotAsetTerkonfirmasi, daftarSlotTerpakai, slotMilikReservasi } from "./slot-service.js";
