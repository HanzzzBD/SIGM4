// Akibat keputusan approval atas reservasi ruangan (SDD-APR-17, BR-043, sekuens 15.2; PR-03-10,
// keputusan 75 log phase-02). Didaftarkan ke registri `penanganHasil` m10 — dibaca API
// (`POST /approvals/{id}/decide`) DAN job `approval-sla-check` (`auto_reject`), sehingga keduanya
// melepas slot dengan jalur yang sama. Berjalan DI DALAM transaksi keputusan.
//
// Kedaluwarsa TTL (BR-023b) juga ditutup di sini, dipicu event `TentativeSlotExpired` (PR-02-37).

import type { PenanganHasil, PenyediaRincian, RincianPengajuan } from "../../m10-approval/index.js";
import type { ApprovalService } from "../../m10-approval/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { SlotService, slotMilikReservasi } from "../../../shared/booking/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { StatusReservasi, TransactionScope } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { BarisPengajuan } from "../repositories/reservation.repository.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";

const MODUL = "m07-reservation-room";
const MENUNGGU: StatusReservasi = "MENUNGGU_PERSETUJUAN";

/** BR-023b: pengajuan kedaluwarsa — konsumen M-17 menerbitkan NT-46 bagi pemohon + approver aktif. */
export const EVENT_RESERVASI_KEDALUWARSA = "RoomReservationExpired";

/** Baris pemegang slot: turunan bila berinduk, dirinya bila tunggal (keputusan 14h). */
function pemegangSlot(kelompok: readonly BarisPengajuan[], akarId: number): readonly BarisPengajuan[] {
    const turunan = kelompok.filter((b) => b.parent_id !== null);
    return turunan.length > 0 ? turunan : kelompok.filter((b) => b.id === String(akarId));
}

async function kunci(scope: TransactionScope, akarId: number) {
    const kelompok = await createReservationRepository(scope.tx).kunciKelompok(scope.ctx, akarId);
    return { kelompok, akar: kelompok.find((b) => b.id === String(akarId)) };
}

export function penangananReservasiRuangan(clock: Clock, audit: AuditLogger): PenanganHasil {
    const slot = new SlotService(clock);
    return {
        jenis: "RESERVASI_RUANGAN",

        /**
         * Persetujuan level akhir (sekuens 15.2 "verifikasi objek masih tersedia"): seluruh tanggal yang
         * masih menunggu wajib memegang slot TENTATIVE — slot yang telah dilepas TTL menggagalkan
         * persetujuan (FR-10.2 A5), tak pernah disetujui sebagian diam-diam. Slot → CONFIRMED.
         */
        async sebelumDisetujui(scope, referensiId) {
            const { kelompok, akar } = await kunci(scope, referensiId);
            if (akar?.status !== MENUNGGU) throw new DomainError("RESERVATION_CONFLICT", "Reservasi tidak lagi menunggu persetujuan; objek sudah tidak tersedia.");
            const tanggal = pemegangSlot(kelompok, referensiId).filter((b) => b.status === MENUNGGU);
            const milik = await slotMilikReservasi(scope.tx, tanggal.map((b) => Number(b.id)));
            const tentatif = tanggal.map((b) => milik.find((s) => s.reservation_id === b.id && s.status === "TENTATIVE"));
            if (tentatif.some((s) => s === undefined)) throw new DomainError("RESERVATION_CONFLICT", "Slot reservasi sudah dilepas; objek sudah tidak tersedia.");
            await slot.confirm(scope, tentatif.flatMap((s) => (s === undefined ? [] : [Number(s.id)])));
            const repo = createReservationRepository(scope.tx);
            const berubah = await repo.ubahStatus(scope.ctx, kelompok.filter((b) => b.status === MENUNGGU).map((b) => b.id), MENUNGGU, "DISETUJUI");
            await audit.write(scope, { modul: MODUL, aksi: "RESERVATION_UPDATED", entitas: "reservations", entitasId: referensiId, nilaiSebelum: { status: MENUNGGU }, nilaiSesudah: { status: "DISETUJUI", reservasi: berubah } });
        },

        /** Ditolak / perlu revisi (BR-038, FR-10.2 A1): seluruh slot dilepas, status mengikuti keputusan. */
        async setelahDitutup(scope, referensiId, status) {
            const { kelompok } = await kunci(scope, referensiId);
            const milik = await slotMilikReservasi(scope.tx, kelompok.map((b) => Number(b.id)));
            await slot.release(scope, milik.map((s) => Number(s.id)));
            const berubah = await createReservationRepository(scope.tx).ubahStatus(scope.ctx, kelompok.filter((b) => b.status === MENUNGGU).map((b) => b.id), MENUNGGU, status);
            if (berubah.length === 0) return;
            await audit.write(scope, { modul: MODUL, aksi: "RESERVATION_UPDATED", entitas: "reservations", entitasId: referensiId, nilaiSebelum: { status: MENUNGGU }, nilaiSesudah: { status, reservasi: berubah } });
        },
    };
}

/** `{nomor}`/`{objek}`/`{tanggal}` + deep link P-31 (UX §6) bagi notifikasi approval NT-01 … NT-07. */
export const rincianReservasiRuangan: PenyediaRincian = {
    jenis: "RESERVASI_RUANGAN",
    async rincian(scope, referensiId): Promise<RincianPengajuan> {
        const r = await createReservationRepository(scope.tx).rincian(scope.ctx, referensiId);
        return {
            label: `Reservasi ${r?.nomor ?? `#${String(referensiId)}`}`,
            objek: r?.ruangan ?? null,
            tanggal: r === undefined ? null : new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(r.waktu_mulai),
            deepLink: `/reservasi/${String(referensiId)}`,
        };
    },
};

/**
 * Konsumen `TentativeSlotExpired` (BR-023b, PR-02-37): pengajuan yang slotnya habis TTL →
 * `KEDALUWARSA` seluruh kelompoknya, slot saudara dilepas, instance approval ditutup, dan
 * `RESERVATION_EXPIRED` dicatat — sekali per pengajuan meski tiap tanggal turunan menerbitkan event
 * sendiri (yang berikutnya mendapati akar tak lagi menunggu: idempoten, JOB-03).
 */
export async function kedaluwarsakanReservasi(scope: TransactionScope, deps: { readonly clock: Clock; readonly audit: AuditLogger; readonly approval: ApprovalService }, reservationId: number): Promise<void> {
    const repo = createReservationRepository(scope.tx);
    const akarId = await repo.akarDari(scope.ctx, reservationId);
    if (akarId === undefined) return;
    // Urutan kunci seragam dengan jalur keputusan: reservasi LALU instance (keputusan 14j) — approver
    // yang memutus pada detik yang sama menunggu, bukan deadlock. Sudah diputuskan = tak ada yang dikedaluwarsakan.
    const { kelompok, akar } = await kunci(scope, akarId);
    if (akar?.status !== MENUNGGU) return;
    const tutup = await deps.approval.tutupKarenaObjek(scope, "RESERVASI_RUANGAN", akarId);
    if (tutup === undefined) return;
    const milik = await slotMilikReservasi(scope.tx, kelompok.map((b) => Number(b.id)));
    await new SlotService(deps.clock).release(scope, milik.filter((s) => s.status === "TENTATIVE").map((s) => Number(s.id)));
    const berubah = await repo.ubahStatus(scope.ctx, kelompok.filter((b) => b.status === MENUNGGU).map((b) => b.id), MENUNGGU, "KEDALUWARSA");
    await deps.audit.write(scope, {
        modul: MODUL,
        aksi: "RESERVATION_EXPIRED",
        entitas: "reservations",
        entitasId: akarId,
        keterangan: "TTL slot tentatif habis sebelum diputuskan (BR-023b)",
        nilaiSebelum: { status: MENUNGGU },
        nilaiSesudah: { status: "KEDALUWARSA", reservasi: berubah, approval_instance_id: tutup.instanceId, approval_status: "DIBATALKAN" },
    });
    await publish(scope, {
        name: EVENT_RESERVASI_KEDALUWARSA,
        aggregateType: "reservation",
        aggregateId: akarId,
        payload: { reservation_id: akarId, nomor: akar.nomor, pemohon_id: Number(akar.pemohon_id), instance_id: tutup.instanceId, langkah_aktif: tutup.langkahAktif },
    });
}
