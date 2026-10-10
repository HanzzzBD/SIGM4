// Pembentukan reservasi ruangan beserta slotnya (FR-07.2 langkah 5, SDD-AVL-06; PR-03-08, PR-03-10).
// Berjalan di TransactionScope PEMANGGIL: nomor, baris reservasi, slot TENTATIVE, dan
// RESERVATION_CREATED commit atau batal bersama (SDD-01 §4.2 langkah 6-7, CI-03). Irisan
// diputus exclusion constraint (CI-01) → 23P01 → `409 RESERVATION_CONFLICT` oleh ErrorMapper.
//
// Berulang (BR-024a, keputusan 11b & 14h log phase-03): satu baris INDUK tanpa slot + satu baris
// turunan ber-`parent_id` bernomor `.NN` per tanggal, masing-masing dengan slotnya sendiri —
// pengelompokan hidup di `reservations.parent_id`, bukan di `booking_slots.parent_slot_id`.
//
// Yang BUKAN urusan layanan ini (milik `SubmissionService`, pemanggilnya): kelayakan ruangan,
// blokir BR-030, kuota BR-023a, jadwal BR-018/BR-020/BR-023c, kapasitas BR-019, TTL BR-023b
// (diteruskan sebagai `kedaluwarsa`), dan instance approval.

import type { AuditLogger } from "../../../shared/audit/index.js";
import type { RentangWaktu, SlotService } from "../../../shared/booking/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { DocumentNumberService } from "../../../shared/numbering/index.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";

const MODUL = "m07-reservation-room";

interface IsianKegiatan {
    readonly roomId: number;
    /** Batas slot TENTATIVE (BR-023b) — dihitung pemanggil. */
    readonly kedaluwarsa: Date;
    readonly namaKegiatan: string;
    readonly jenisKegiatan: string;
    readonly jumlahPeserta: number;
    readonly keperluan?: string | null;
    readonly kebutuhanTambahan?: string | null;
    readonly keterangan?: string | null;
}

export interface InputReservasiRuangan extends IsianKegiatan {
    readonly rentang: RentangWaktu;
}

export interface InputPengajuanRuangan extends IsianKegiatan {
    /** Terurut menaik; lebih dari satu atau `berulang` → induk + turunan. */
    readonly tanggal: readonly RentangWaktu[];
    readonly berulang: boolean;
}

export interface ReservasiTerbentuk {
    readonly id: string;
    readonly nomor: string;
    readonly slotId: string;
}

export interface PengajuanTerbentuk {
    /** Akar pengajuan — referensi instance approval. */
    readonly id: string;
    readonly nomor: string;
    /** Baris yang memegang slot: dirinya bila tunggal, turunannya bila berulang. */
    readonly tanggal: readonly (ReservasiTerbentuk & RentangWaktu)[];
}

/** SEQ-04 + BR-024a: sufiks turunan minimal dua digit. */
const nomorTurunan = (induk: string, ke: number): string => `${induk}.${String(ke).padStart(2, "0")}`;

export class ReservationService {
    constructor(
        private readonly slot: SlotService,
        private readonly nomor: DocumentNumberService,
        private readonly audit: AuditLogger,
    ) {}

    async buatReservasiRuangan(scope: TransactionScope, input: InputReservasiRuangan): Promise<ReservasiTerbentuk> {
        const { rentang, ...isian } = input;
        const hasil = await this.buatPengajuanRuangan(scope, { ...isian, tanggal: [rentang], berulang: false });
        const [satu] = hasil.tanggal;
        if (satu === undefined) throw new Error("Reservasi tidak terbentuk.");
        return { id: satu.id, nomor: satu.nomor, slotId: satu.slotId };
    }

    async buatPengajuanRuangan(scope: TransactionScope, input: InputPengajuanRuangan): Promise<PengajuanTerbentuk> {
        const [pertama] = input.tanggal;
        const terakhir = input.tanggal.at(-1);
        if (pertama === undefined || terakhir === undefined) throw new Error("Pengajuan tanpa tanggal.");
        const repo = createReservationRepository(scope.tx);
        // SEQ-02: nomor dari penghitung di transaksi yang sama — gagal = lompatan, bukan pakai ulang (SEQ-03).
        const nomor = await this.nomor.next(scope.tx, "RSV-RG");
        const isian = {
            roomId: input.roomId,
            namaKegiatan: input.namaKegiatan,
            jenisKegiatan: input.jenisKegiatan,
            jumlahPeserta: input.jumlahPeserta,
            keperluan: input.keperluan ?? null,
            kebutuhanTambahan: input.kebutuhanTambahan ?? null,
            keterangan: input.keterangan ?? null,
        };

        const berinduk = input.berulang || input.tanggal.length > 1;
        // Induk berulang: rentang keseluruhan pola, tanpa slot (0043, keputusan 14h).
        const akarId = await repo.buatRuangan(scope.ctx, { ...isian, nomor, mulai: pertama.mulai, selesai: (berinduk ? terakhir : pertama).selesai });

        const tanggal: (ReservasiTerbentuk & RentangWaktu)[] = [];
        for (const [i, rentang] of input.tanggal.entries()) {
            const id = berinduk
                ? await repo.buatRuangan(scope.ctx, { ...isian, nomor: nomorTurunan(nomor, i + 1), parentId: akarId, mulai: rentang.mulai, selesai: rentang.selesai })
                : akarId;
            const [slot] = await this.slot.reserve(scope, {
                sumberDaya: [{ jenis: "room", id: input.roomId }],
                rentang,
                asal: "reservation",
                status: "TENTATIVE",
                kedaluwarsa: input.kedaluwarsa,
                rujukan: { reservationId: Number(id) },
            });
            if (slot === undefined) throw new Error("Slot reservasi tidak terbentuk.");
            tanggal.push({ id, nomor: berinduk ? nomorTurunan(nomor, i + 1) : nomor, slotId: slot.id, mulai: rentang.mulai, selesai: rentang.selesai });
        }

        // AL-01 (m07 §11): satu entri bagi satu pengajuan, dicatat pemanggil SlotService (keputusan 64c).
        await this.audit.write(scope, {
            modul: MODUL,
            aksi: "RESERVATION_CREATED",
            entitas: "reservations",
            entitasId: akarId,
            nilaiSesudah: {
                nomor,
                jenis: "RUANGAN",
                room_id: input.roomId,
                waktu_mulai: pertama.mulai.toISOString(),
                waktu_selesai: (berinduk ? terakhir : pertama).selesai.toISOString(),
                status: "MENUNGGU_PERSETUJUAN",
                ...(berinduk
                    ? { tanggal: tanggal.map((t) => ({ id: t.id, nomor: t.nomor, waktu_mulai: t.mulai.toISOString(), slot_id: t.slotId })) }
                    : { slot_id: tanggal[0]?.slotId }),
            },
        });
        return { id: akarId, nomor, tanggal };
    }
}
