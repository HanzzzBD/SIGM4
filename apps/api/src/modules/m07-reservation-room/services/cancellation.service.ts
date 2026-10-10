// Pembatalan reservasi ruangan `POST /reservations/{id}/cancel` (FR-07.3, BR-024, BR-024a, BR-025;
// PR-03-11, keputusan 15 log phase-03). Satu transaksi: kelompok dikunci, slot dilepas lewat
// SlotService (SDD-SYS-10), status → `DIBATALKAN`, instance approval yang masih berjalan ditutup,
// `RESERVATION_CANCELLED` beserta alasannya dicatat, dan `RoomReservationCancelled` terbit ke
// outbox — konsumen M-17 menotifikasi pemohon (NT-08) bila pembatalnya pihak lain (A2).
//
// BR-024 (perubahan jadwal = pembatalan + pengajuan baru) tidak punya endpoint sendiri: klien
// membatalkan lalu mengajukan ulang lewat `POST /reservations`.

import type { ReservationCancelled } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { ApprovalService } from "../../m10-approval/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { SlotService, slotMilikReservasi } from "../../../shared/booking/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";
import { rencanakanPembatalan } from "./cancellation-plan.js";

const MODUL = "m07-reservation-room";

/** FR-07.3: pengajuan dibatalkan — konsumen M-17 menerbitkan NT-08 bila `sepihak` (A2). */
export const EVENT_RESERVASI_DIBATALKAN = "RoomReservationCancelled";

export class CancellationService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly clock: Clock,
        private readonly audit: AuditLogger,
        private readonly approval: ApprovalService,
    ) {}

    async batalkan(ctx: AuthContext, reservationId: number, alasan: string): Promise<ReservationCancelled> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createReservationRepository(scope.tx);
                const akarId = await repo.akarDari(scope.ctx, reservationId);
                if (akarId === undefined) throw new NotFoundError("Reservasi tidak ditemukan.");
                // Urutan kunci seragam: kelompok reservasi LALU instance approval (keputusan 14j).
                const kelompok = await repo.kunciKelompok(scope.ctx, akarId);
                const akar = kelompok.find((b) => b.id === String(akarId));
                if (akar === undefined) throw new NotFoundError("Reservasi tidak ditemukan.");

                // m07 §7 (keputusan 15b): route menuntut `cancel_own`; reservasi pihak lain menuntut `cancel_any`.
                // Kepemilikan dibaca dari basis data, bukan disimpulkan dari role.
                const sepihak = akar.pemohon_id !== String(ctx.userId);
                if (sepihak && !ctx.can("reservation.cancel_any")) throw new ForbiddenError(); // pesan seragam (SDD-AUTH-08)

                const rencana = rencanakanPembatalan(kelompok, akar.id, String(reservationId), this.clock.now());
                if (!rencana.sah) throw new DomainError("VALIDATION_ERROR", rencana.alasan, { errors: [{ field: "id", message: rencana.alasan }] });

                // FR-07.3 AC: slot dilepas di transaksi yang sama — langsung dapat dipesan pengguna lain.
                const ids = rencana.dibatalkan.map((b) => b.id);
                const milik = await slotMilikReservasi(scope.tx, ids.map(Number));
                await new SlotService(this.clock).release(scope, milik.filter((s) => s.status !== "RELEASED").map((s) => Number(s.id)));
                for (const dari of ["MENUNGGU_PERSETUJUAN", "DISETUJUI"] as const) {
                    await repo.ubahStatus(scope.ctx, rencana.dibatalkan.filter((b) => b.status === dari).map((b) => b.id), dari, "DIBATALKAN");
                }
                const tutup = rencana.akarTertutup && akar.status === "MENUNGGU_PERSETUJUAN" ? await this.approval.tutupKarenaObjek(scope, "RESERVASI_RUANGAN", akarId) : undefined;

                const target = kelompok.find((b) => b.id === String(reservationId)) ?? akar;
                const status = rencana.akarTertutup || target.id !== akar.id ? "DIBATALKAN" : target.status;
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "RESERVATION_CANCELLED",
                    entitas: "reservations",
                    entitasId: reservationId,
                    keterangan: alasan,
                    nilaiSebelum: { reservasi: rencana.dibatalkan.map((b) => ({ id: b.id, status: b.status })) },
                    nilaiSesudah: { status: "DIBATALKAN", reservasi: ids, sepihak, approval_instance_id: tutup?.instanceId ?? null },
                });
                await publish(scope, {
                    name: EVENT_RESERVASI_DIBATALKAN,
                    aggregateType: "reservation",
                    aggregateId: reservationId,
                    payload: { reservation_id: reservationId, nomor: target.nomor, pemohon_id: Number(akar.pemohon_id), pelaku_id: ctx.userId, alasan, sepihak, dibatalkan: ids.map(Number) },
                });
                return { id: target.id, nomor: target.nomor, status, dibatalkan: rencana.dibatalkan.map((b) => ({ id: b.id, nomor: b.nomor })) };
            },
            this.db,
        );
    }
}
