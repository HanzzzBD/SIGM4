// Penggunaan & penyelesaian reservasi ruangan (FR-07.4; PR-03-12, keputusan 16 log phase-03).
//   * Otomatis — job `slot-activation` (SDD-01 §4.6): `Disetujui` → `Berlangsung` + slot CONFIRMED →
//     ACTIVE saat waktu mulai; `Berlangsung` → `Selesai` saat waktu selesai (slot tetap ACTIVE sebagai
//     arsip utilisasi); induk berulang → `Selesai` begitu tak ada tanggal yang masih hidup.
//   * Manual — `POST /reservations/{id}/usage` (`reservation.record_usage`): kondisi Baik/Perlu
//     Perhatian bagi yang `Selesai`, atau `Tidak Digunakan` (A1) dari `Berlangsung`/`Selesai` — slotnya
//     dilepas (tidak dihitung waktu terpakai). Sekali per tanggal.

import type { HasilPenggunaan, ReservationUsage } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { SlotService, slotMilikReservasi } from "../../../shared/booking/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, StatusReservasi, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";

const MODUL = "m07-reservation-room";
/** Batas baris per langkah per putaran job; sisanya diambil putaran berikut (tiap 5 menit). */
export const BATCH_PENGGUNAAN = 500;

/** Aturan keputusan 16b — `null` = boleh dicatat. */
export function alasanTolakPencatatan(status: StatusReservasi, sudahDicatat: boolean, hasil: HasilPenggunaan): string | null {
    if (sudahDicatat) return "Penggunaan reservasi ini sudah dicatat.";
    if (hasil === "TIDAK_DIGUNAKAN") {
        return status === "BERLANGSUNG" || status === "SELESAI" ? null : "Hanya reservasi yang sedang berlangsung atau sudah selesai yang dapat ditandai Tidak Digunakan.";
    }
    return status === "SELESAI" ? null : "Kondisi ruangan dicatat setelah kegiatan selesai.";
}

export class UsageService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly audit: AuditLogger,
    ) {}

    async catat(ctx: AuthContext, reservationId: number, hasil: HasilPenggunaan, catatan: string | null): Promise<ReservationUsage> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createReservationRepository(scope.tx);
                const akarId = await repo.akarDari(scope.ctx, reservationId);
                if (akarId === undefined) throw new NotFoundError("Reservasi tidak ditemukan.");
                // Kunci kelompok lebih dulu — urutan yang sama dengan pembatalan & keputusan (keputusan 14j).
                const kelompok = await repo.kunciKelompok(scope.ctx, akarId);
                const target = kelompok.find((b) => b.id === String(reservationId));
                if (target === undefined) throw new NotFoundError("Reservasi tidak ditemukan.");
                const tolak = (pesan: string) => new DomainError("VALIDATION_ERROR", pesan, { errors: [{ field: "id", message: pesan }] });
                if (target.parent_id === null && kelompok.length > 1) throw tolak("Penggunaan reservasi berulang dicatat per tanggal.");

                const alasan = alasanTolakPencatatan(target.status, (await repo.pencatatan(scope.ctx, reservationId)) !== null, hasil);
                if (alasan !== null) throw tolak(alasan);

                const status: "SELESAI" | "TIDAK_DIGUNAKAN" = hasil === "TIDAK_DIGUNAKAN" ? "TIDAK_DIGUNAKAN" : "SELESAI";
                const kondisi = hasil === "TIDAK_DIGUNAKAN" ? null : hasil;
                if (status === "TIDAK_DIGUNAKAN") {
                    // A1: ruangan tak dipakai — slot dilepas, tak terhitung waktu terpakai; sisa waktu Berlangsung kembali tersedia.
                    const milik = await slotMilikReservasi(scope.tx, [reservationId]);
                    await new SlotService(this.clock).release(scope, milik.filter((s) => s.status !== "RELEASED").map((s) => Number(s.id)));
                }
                await repo.catatPenggunaan(scope.ctx, reservationId, { status, kondisi, catatan, pada: this.clock.now() });
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "RESERVATION_UPDATED",
                    entitas: "reservations",
                    entitasId: reservationId,
                    ...(catatan === null ? {} : { keterangan: catatan }),
                    nilaiSebelum: { status: target.status },
                    nilaiSesudah: { status, kondisi_ruangan: kondisi },
                });
                return { id: target.id, nomor: target.nomor, status, kondisi_ruangan: kondisi, catatan };
            },
            this.db,
        );
    }
}

export interface HasilSinkronReservasi {
    readonly berlangsung: number;
    readonly selesai: number;
    readonly indukSelesai: number;
}

/** FR-07.4 langkah 1-2, dijalankan job `slot-activation` berpelaku SYSTEM (AL-06). Idempoten (JOB-03). */
export async function sinkronkanStatusReservasi(scope: TransactionScope, audit: AuditLogger, clock: Clock): Promise<HasilSinkronReservasi> {
    const repo = createReservationRepository(scope.tx);
    const kini = clock.now();
    const catat = (id: string, dari: StatusReservasi, ke: StatusReservasi, keterangan: string) =>
        audit.write(scope, { modul: MODUL, aksi: "RESERVATION_UPDATED", entitas: "reservations", entitasId: id, keterangan, nilaiSebelum: { status: dari }, nilaiSesudah: { status: ke } });

    const mulai = await repo.kunciJatuhTempo(scope.ctx, "DISETUJUI", "waktu_mulai", kini, BATCH_PENGGUNAAN);
    const berlangsung = await repo.ubahStatus(scope.ctx, mulai.map((b) => b.id), "DISETUJUI", "BERLANGSUNG");
    const milik = await slotMilikReservasi(scope.tx, berlangsung.map(Number));
    await new SlotService(clock).activate(scope, milik.filter((s) => s.status === "CONFIRMED").map((s) => Number(s.id)));
    for (const id of berlangsung) await catat(id, "DISETUJUI", "BERLANGSUNG", "Waktu mulai tiba (FR-07.4 langkah 1)");

    // Setelah langkah pertama: tanggal yang mulai & selesai di antara dua putaran tetap melewati Berlangsung.
    const usai = await repo.kunciJatuhTempo(scope.ctx, "BERLANGSUNG", "waktu_selesai", kini, BATCH_PENGGUNAAN);
    const selesai = await repo.ubahStatus(scope.ctx, usai.map((b) => b.id), "BERLANGSUNG", "SELESAI");
    for (const id of selesai) await catat(id, "BERLANGSUNG", "SELESAI", "Waktu selesai tiba (FR-07.4 langkah 2)");

    const induk = await repo.kunciIndukTuntas(scope.ctx, BATCH_PENGGUNAAN);
    const indukSelesai = await repo.ubahStatus(scope.ctx, induk.map((b) => b.id), "DISETUJUI", "SELESAI");
    for (const id of indukSelesai) await catat(id, "DISETUJUI", "SELESAI", "Seluruh tanggal reservasi berulang telah berakhir (BR-024a)");

    return { berlangsung: berlangsung.length, selesai: selesai.length, indukSelesai: indukSelesai.length };
}
