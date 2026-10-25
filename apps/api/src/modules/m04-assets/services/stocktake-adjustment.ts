import { sql } from "kysely";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { ForbiddenError, DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { createAssetRepository } from "../repositories/asset.repository.js";
import { AssetService } from "./asset.service.js";
import type { AssetCondition, AssetStatus } from "./asset.service.js";
import { assertNoMovementConflicts } from "./movement-conflicts.js";

export async function applyStocktakeAdjustment(scope: TransactionScope, clock: Clock, audit: AuditLogger,
    input: { assetId: string; sessionId: string; roomId: string | null; kondisi: AssetCondition | null; alasan: string }) {
    if (!scope.ctx.can("audit.approve")) throw new ForbiddenError();
    const repo = createAssetRepository(scope.tx), asset = await repo.findById(scope.ctx, Number(input.assetId));
    const live = await scope.tx.selectFrom("assets").select("dihapuskan").where("id", "=", input.assetId).executeTakeFirst();
    if (!asset || !live || live.dihapuskan) throw new NotFoundError("Aset tidak dapat disesuaikan.");
    const date = new Date(clock.now().getTime() + 7 * 3600000).toISOString().slice(0, 10);
    if (input.roomId && input.roomId !== asset.room_id) {
        if (!["TERSEDIA", "DALAM_PERBAIKAN"].includes(asset.status)) throw new DomainError("ASSET_NOT_AVAILABLE", "Selesaikan reservasi/pinjaman sebelum penyesuaian lokasi aset.");
        if (!await repo.findRuanganAktifById(scope.ctx, Number(input.roomId))) throw new DomainError("VALIDATION_ERROR", "Lokasi tujuan tidak aktif.");
        await assertNoMovementConflicts(scope.tx, [asset], date);
        await repo.updateLokasi(scope.ctx, Number(asset.id), { roomId: Number(input.roomId) });
        await scope.tx.insertInto("asset_movements").values({ asset_id: asset.id, room_asal_id: asset.room_id, room_tujuan_id: input.roomId, tanggal: date, alasan: input.alasan, dilakukan_oleh: scope.ctx.userId, audit_session_id: input.sessionId }).execute();
        await audit.write(scope, { modul: "m04-assets", aksi: "ASSET_MOVED", entitas: "assets", entitasId: asset.id, nilaiSebelum: { room_id: asset.room_id }, nilaiSesudah: { room_id: input.roomId, audit_session_id: input.sessionId } });
    }
    if (input.kondisi && input.kondisi !== asset.kondisi) await new AssetService(scope.tx, audit, clock).ubahKondisiDalam(scope, Number(asset.id), { kondisi: input.kondisi, alasan: input.alasan, referensiJenis: "audit_session", referensiId: Number(input.sessionId) }, "audit.approve");
    const condition = input.kondisi ?? asset.kondisi;
    const [loan, work, booked] = await Promise.all([
        scope.tx.selectFrom("loan_items").select("id").where("asset_id", "=", asset.id).where("status_kembali", "=", "BELUM_KEMBALI").executeTakeFirst(),
        scope.tx.selectFrom("work_orders").select("id").where("asset_id", "=", asset.id).where("nonaktifkan_aset", "=", true).where("status", "not in", ["SELESAI", "DIBATALKAN"]).executeTakeFirst(),
        scope.tx.selectFrom("booking_slots").select("id").where("resource_type", "=", "asset").where("resource_id", "=", asset.id).where("status", "=", "CONFIRMED").where(sql<boolean>`slot_range @> ${clock.now()}::timestamptz`).executeTakeFirst(),
    ]);
    const status: AssetStatus = ["HILANG", "RUSAK_BERAT"].includes(condition) ? "TIDAK_TERSEDIA" : loan ? "DIPINJAM" : work ? "DALAM_PERBAIKAN" : booked ? "DIRESERVASI" : "TERSEDIA";
    await repo.reconcileStocktakeStatus(scope.ctx, asset.id, status);
    if (asset.status !== status) await audit.write(scope, { modul: "m04-assets", aksi: "ASSET_STATUS_CHANGED", entitas: "assets", entitasId: asset.id, nilaiSebelum: { status: asset.status }, nilaiSesudah: { status, audit_session_id: input.sessionId } });
}
