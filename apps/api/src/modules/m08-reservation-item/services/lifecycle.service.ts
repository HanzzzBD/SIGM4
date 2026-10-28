import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { daftarSlotTerpakai, SlotService } from "../../../shared/booking/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { createLifecycleRepository } from "../repositories/lifecycle.repository.js";
import { ruanganUntukReservasi } from "../../m03-locations/index.js";

/** SDD-APR-17 / BR-043: memeriksa semua unit, bukan hanya slot pertama tiap tanggal. */
export async function validateAssetApproval(scope: TransactionScope, ids: readonly string[]) {
    const repo = createLifecycleRepository(scope.tx);
    const items = await repo.items(scope.ctx, ids);
    try { await repo.lockAssets(scope.ctx, items.map((i) => i.asset_id)); } catch (e) { if ((e as { code?: string }).code === "55P03") throw new DomainError("ASSET_NOT_AVAILABLE", "Aset sedang diproses transaksi lain."); throw e; }
    const current = await repo.items(scope.ctx, ids);
    if (current.some((i) => !i.dapat_dipinjam || i.dihapuskan || !["BAIK", "RUSAK_RINGAN"].includes(i.kondisi) || ["DALAM_PERBAIKAN", "TIDAK_TERSEDIA"].includes(i.status))) throw new DomainError("ASSET_NOT_AVAILABLE", "Kelayakan aset telah berubah.");
    const records = await repo.records(scope.ctx, ids);
    for (const record of records) {
        const student = await repo.student(scope.ctx, record.pemohon_id);
        const units = current.filter((i) => i.reservation_id === record.id);
        if (student && units.some((i) => !i.boleh_dipinjam_siswa)) throw new DomainError("ASSET_NOT_AVAILABLE", "Aset tidak lagi diizinkan untuk siswa.");
        const slots = await daftarSlotTerpakai(scope.tx, "asset", units.map((i) => Number(i.asset_id)), { mulai: record.waktu_mulai, selesai: record.waktu_selesai });
        if (units.some((i) => !slots.some((s) => s.resource_id === i.asset_id && s.reservation_id === record.id && s.status === "TENTATIVE"))) throw new DomainError("ASSET_NOT_AVAILABLE", "Sebagian alokasi tidak lagi memegang slot tentatif.");
        if (record.room_id !== null && await ruanganUntukReservasi(scope, Number(record.room_id), student) === undefined) throw new DomainError("RESERVATION_CONFLICT", "Ruangan pendukung tidak lagi dapat direservasi.");
    }
    const expected = new Map(records.map((r) => [r.id, current.filter((i) => i.reservation_id === r.id).length + (r.room_id === null ? 0 : 1)]));
    if (records.some((r) => !current.some((i) => i.reservation_id === r.id))) throw new DomainError("ASSET_NOT_AVAILABLE", "Alokasi aset tidak lengkap.");
    return expected;
}
export async function confirmCombinedRoom(scope: TransactionScope, ids: readonly string[], clock: Clock) { const repo = createLifecycleRepository(scope.tx); await repo.confirmItems(scope.ctx, ids, clock.now()); await repo.confirmedRoom(scope.ctx, ids); }

/** Detail hanya dipanggil setelah repository M-07 memeriksa scope objek. */
export async function assetReservationSupplement(scope: TransactionScope, ids: readonly string[], reveal: boolean) {
    const repo = createLifecycleRepository(scope.tx), record = (await repo.records(scope.ctx, ids)).find((r) => r.id === ids[0]);
    const items = await repo.items(scope.ctx, ids);
    return { lokasi_penggunaan: record?.lokasi_penggunaan ?? null, status_penggunaan_ruangan: record?.status_penggunaan_ruangan ?? null, aset: items.map((i) => ({ reservation_id: i.reservation_id, asset_id: reveal && i.confirmed_at !== null ? i.asset_id : null, kode_barang: reveal && i.confirmed_at !== null ? i.kode_barang : null, nama: i.nama, category_id: i.category_id, kondisi: i.kondisi })) };
}
export const reservationAllocatedUnitIds = async (scope: TransactionScope, id: string) => (await createLifecycleRepository(scope.tx).items(scope.ctx, [id])).map((item) => Number(item.asset_id));
export async function assertNotCheckedOut(scope: TransactionScope, ids: readonly string[], now: Date) {
    const repo = createLifecycleRepository(scope.tx), records = await repo.records(scope.ctx, ids), items = await repo.items(scope.ctx, ids);
    for (const r of records) {
        const slots = await daftarSlotTerpakai(scope.tx, "asset", items.filter((i) => i.reservation_id === r.id).map((i) => Number(i.asset_id)), { mulai: r.waktu_mulai, selesai: r.waktu_selesai });
        if (slots.some((s) => s.reservation_id === r.id && s.status === "ACTIVE")) throw new DomainError("RESERVATION_CONFLICT", "Aset sudah diserahkan; gunakan proses pengembalian.");
        if (["BERLANGSUNG", "SELESAI"].includes(r.status_penggunaan_ruangan ?? "") || (r.status === "DISETUJUI" && r.room_id !== null && r.status_penggunaan_ruangan !== "TIDAK_DIGUNAKAN" && r.waktu_mulai <= now)) throw new DomainError("RESERVATION_CONFLICT", "Ruangan pada pengajuan gabungan sudah digunakan; seluruh pengajuan tidak dapat dibatalkan.");
    }
}
export async function syncCombinedRoomUsage(scope: TransactionScope, clock: Clock, audit: AuditLogger) {
    const repo = createLifecycleRepository(scope.tx);
    let changed = 0;
    for (const [from, to, column] of [["DISETUJUI", "BERLANGSUNG", "waktu_mulai"], ["BERLANGSUNG", "SELESAI", "waktu_selesai"]] as const) {
        for (const row of await repo.lockRoomUsage(scope.ctx, from, column, clock.now())) {
            const slots = await daftarSlotTerpakai(scope.tx, "room", row.room_id === null ? [] : [Number(row.room_id)], { mulai: row.waktu_mulai, selesai: row.waktu_selesai });
            if (to === "BERLANGSUNG") await new SlotService(clock).activate(scope, slots.filter((s) => s.reservation_id === row.id && s.status === "CONFIRMED").map((s) => Number(s.id)));
            await repo.setRoomUsage(scope.ctx, row.id, to);
            await audit.write(scope, { modul: "m07-reservation-room", aksi: "RESERVATION_UPDATED", entitas: "reservations", entitasId: row.id, nilaiSebelum: { status_penggunaan_ruangan: from }, nilaiSesudah: { status_penggunaan_ruangan: to } }); changed++;
        }
    }
    return changed;
}
export const assetExpiryCandidates = async (scope: TransactionScope, now: Date) => createLifecycleRepository(scope.tx).expiryCandidates(scope.ctx, new Date(now.getTime() - 24 * 3_600_000));
export const reservationsAffectedByDamage = async (scope: TransactionScope, asset: number, now: Date) => createLifecycleRepository(scope.tx).affected(scope.ctx, asset, now);
export async function recordCombinedRoomUsage(scope: TransactionScope, id: number, result: "BAIK" | "PERLU_PERHATIAN" | "TIDAK_DIGUNAKAN", note: string | null, clock: Clock, audit: AuditLogger) {
    const repo = createLifecycleRepository(scope.tx), record = (await repo.records(scope.ctx, [String(id)]))[0];
    if (record === undefined || record.room_id === null || record.penggunaan_dicatat_pada !== null) throw new DomainError("VALIDATION_ERROR", "Penggunaan ruangan tidak dapat dicatat.");
    const status = record.status_penggunaan_ruangan;
    if (result === "TIDAK_DIGUNAKAN" ? !["BERLANGSUNG", "SELESAI"].includes(status ?? "") : status !== "SELESAI") throw new DomainError("VALIDATION_ERROR", "Penggunaan dicatat setelah kegiatan dimulai; kondisi dicatat setelah selesai.");
    const next: "TIDAK_DIGUNAKAN" | "SELESAI" = result === "TIDAK_DIGUNAKAN" ? "TIDAK_DIGUNAKAN" : "SELESAI";
    if (next === "TIDAK_DIGUNAKAN") {
        const roomSlots = await daftarSlotTerpakai(scope.tx, "room", [Number(record.room_id)], { mulai: record.waktu_mulai, selesai: record.waktu_selesai });
        await new SlotService(clock).release(scope, roomSlots.filter((s) => s.reservation_id === record.id).map((s) => Number(s.id)));
    }
    const condition = result === "TIDAK_DIGUNAKAN" ? null : result;
    await repo.recordRoomUsage(scope.ctx, record.id, next, condition, note, clock.now());
    await audit.write(scope, { modul: "m07-reservation-room", aksi: "RESERVATION_UPDATED", entitas: "reservations", entitasId: record.id, ...(note === null ? {} : { keterangan: note }), nilaiSebelum: { status_penggunaan_ruangan: status }, nilaiSesudah: { status_penggunaan_ruangan: next, kondisi_ruangan: condition } });
    return { id: record.id, nomor: record.nomor, status: next, kondisi_ruangan: condition, catatan: note };
}
