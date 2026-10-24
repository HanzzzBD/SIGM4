// BR-023: tidak diambil 1×24 jam, berbeda dari TTL BR-023b dan pembatalan manual.
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { daftarSlotTerpakai, SlotService, slotMilikReservasi } from "../../../shared/booking/index.js";
import { publish } from "../../../shared/events/index.js";
import { assetExpiryCandidates, reservationAllocatedUnitIds } from "../../m08-reservation-item/index.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";
import { EVENT_RESERVASI_KEDALUWARSA } from "./approval-outcome.js";

export async function expireUncollectedAssets(scope: TransactionScope, clock: Clock, audit: AuditLogger): Promise<number> {
    const repo = createReservationRepository(scope.tx);
    let count = 0;
    for (const candidate of await assetExpiryCandidates(scope, clock.now())) {
        const root = candidate.parent_id ?? candidate.id;
        const group = await repo.kunciKelompok(scope.ctx, Number(root));
        const target = group.find((r) => r.id === candidate.id);
        if (target?.status !== "DISETUJUI") continue;
        const record = await scope.tx.selectFrom("reservations").select(["waktu_mulai", "waktu_selesai", "room_id"]).where("id", "=", target.id).executeTakeFirstOrThrow();
        const unitIds = await reservationAllocatedUnitIds(scope, target.id);
        const assetSlots = await daftarSlotTerpakai(scope.tx, "asset", unitIds, { mulai: record.waktu_mulai, selesai: record.waktu_selesai });
        if (assetSlots.some((s) => s.status === "ACTIVE")) continue;
        const roomSlots = await daftarSlotTerpakai(scope.tx, "room", record.room_id === null ? [] : [Number(record.room_id)], { mulai: record.waktu_mulai, selesai: record.waktu_selesai });
        const consumedRooms = new Set(roomSlots.filter((s) => s.reservation_id === target.id && s.status === "ACTIVE").map((s) => s.id));
        const slots = await slotMilikReservasi(scope.tx, [Number(target.id)]);
        await new SlotService(clock).release(scope, slots.filter((s) => !consumedRooms.has(s.id)).map((s) => Number(s.id)));
        await repo.ubahStatus(scope.ctx, [target.id], "DISETUJUI", "KEDALUWARSA");
        if (target.parent_id !== null && !group.some((r) => r.id !== target.id && r.parent_id !== null && ["MENUNGGU_PERSETUJUAN", "DISETUJUI", "BERLANGSUNG"].includes(r.status))) await repo.ubahStatus(scope.ctx, [root], "DISETUJUI", "KEDALUWARSA");
        if (target.parent_id !== null && await repo.completeLoanParent(scope.ctx, root)) await audit.write(scope, { modul: "m07-reservation-room", aksi: "RESERVATION_UPDATED", entitas: "reservations", entitasId: root, nilaiSebelum: { status: "BERLANGSUNG" }, nilaiSesudah: { status: "SELESAI", alasan: "Seluruh realisasi/tanggal turunan sudah ditutup" } });
        await audit.write(scope, { modul: "m07-reservation-room", aksi: "RESERVATION_EXPIRED", entitas: "reservations", entitasId: target.id, keterangan: "Tidak diambil dalam 1×24 jam sejak waktu mulai (BR-023)", nilaiSebelum: { status: "DISETUJUI" }, nilaiSesudah: { status: "KEDALUWARSA", alasan: "TIDAK_DIAMBIL" } });
        await publish(scope, { name: EVENT_RESERVASI_KEDALUWARSA, aggregateType: "reservation", aggregateId: target.id, payload: { reservation_id: Number(target.id), nomor: target.nomor, pemohon_id: Number(target.pemohon_id), alasan: "TIDAK_DIAMBIL" } }); count++;
    }
    return count;
}
