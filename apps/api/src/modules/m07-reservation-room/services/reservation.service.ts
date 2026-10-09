// Pembentukan reservasi ruangan beserta slotnya (FR-07.2 langkah 5, SDD-AVL-06; PR-03-08).
// Berjalan di TransactionScope PEMANGGIL: nomor, baris reservasi, slot TENTATIVE, dan
// RESERVATION_CREATED commit atau batal bersama (SDD-01 §4.2 langkah 6-7, CI-03). Irisan
// diputus exclusion constraint (CI-01) → 23P01 → `409 RESERVATION_CONFLICT` oleh ErrorMapper.
//
// Yang BUKAN urusan layanan ini (milik `PR-03-10`, pemanggilnya): kelayakan ruangan (ada, aktif,
// `dapat_direservasi`, BR-022 — ruangan tak terdaftar berujung FK 23503), blokir pemohon BR-030, kuota
// BR-023a, jam operasional BR-018, kapasitas BR-019, tenggat H-1 BR-020, horizon BR-023c, TTL
// BR-023b (dihitung pemanggil, diteruskan sebagai `kedaluwarsa`), dan instance approval.

import type { AuditLogger } from "../../../shared/audit/index.js";
import type { RentangWaktu, SlotService } from "../../../shared/booking/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { DocumentNumberService } from "../../../shared/numbering/index.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";

const MODUL = "m07-reservation-room";

export interface InputReservasiRuangan {
    readonly roomId: number;
    readonly rentang: RentangWaktu;
    /** Batas slot TENTATIVE (BR-023b) — dihitung pemanggil. */
    readonly kedaluwarsa: Date;
    readonly namaKegiatan: string;
    readonly jenisKegiatan: string;
    readonly jumlahPeserta: number;
    readonly keperluan?: string | null;
    readonly kebutuhanTambahan?: string | null;
    readonly keterangan?: string | null;
}

export interface ReservasiTerbentuk {
    readonly id: string;
    readonly nomor: string;
    readonly slotId: string;
}

export class ReservationService {
    constructor(
        private readonly slot: SlotService,
        private readonly nomor: DocumentNumberService,
        private readonly audit: AuditLogger,
    ) {}

    async buatReservasiRuangan(scope: TransactionScope, input: InputReservasiRuangan): Promise<ReservasiTerbentuk> {
        // SEQ-02: nomor dari penghitung di transaksi yang sama — gagal = lompatan, bukan pakai ulang (SEQ-03).
        const nomor = await this.nomor.next(scope.tx, "RSV-RG");
        const id = await createReservationRepository(scope.tx).buatRuangan(scope.ctx, {
            nomor,
            roomId: input.roomId,
            namaKegiatan: input.namaKegiatan,
            jenisKegiatan: input.jenisKegiatan,
            mulai: input.rentang.mulai,
            selesai: input.rentang.selesai,
            jumlahPeserta: input.jumlahPeserta,
            keperluan: input.keperluan ?? null,
            kebutuhanTambahan: input.kebutuhanTambahan ?? null,
            keterangan: input.keterangan ?? null,
        });
        const [slot] = await this.slot.reserve(scope, {
            sumberDaya: [{ jenis: "room", id: input.roomId }],
            rentang: input.rentang,
            asal: "reservation",
            status: "TENTATIVE",
            kedaluwarsa: input.kedaluwarsa,
            rujukan: { reservationId: Number(id) },
        });
        if (slot === undefined) throw new Error("Slot reservasi tidak terbentuk.");
        // AL-01 (m07 §11): dicatat pemanggil SlotService, tanpa aksi SLOT_* (keputusan 64c).
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "RESERVATION_CREATED",
            entitas: "reservations",
            entitasId: id,
            nilaiSesudah: {
                nomor,
                jenis: "RUANGAN",
                room_id: input.roomId,
                waktu_mulai: input.rentang.mulai.toISOString(),
                waktu_selesai: input.rentang.selesai.toISOString(),
                status: "MENUNGGU_PERSETUJUAN",
                slot_id: slot.id,
            },
        });
        return { id, nomor, slotId: slot.id };
    }
}
