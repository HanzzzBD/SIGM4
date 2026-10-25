import { sql } from "kysely";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { ForbiddenError, DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { createAssetRepository } from "../repositories/asset.repository.js";
export async function executeAssetDisposal(scope: TransactionScope, clock: Clock, audit: AuditLogger, assetId: string, disposalId: string, tanggal: string) {
    if (!scope.ctx.can("disposal.execute")) throw new ForbiddenError();
    const repo = createAssetRepository(scope.tx), asset = await repo.kunciUntukUbah(scope.ctx, Number(assetId));
    if (!asset || asset.dihapuskan) throw new DomainError("VALIDATION_ERROR", "Aset sudah dihapuskan atau tidak ditemukan.");
    await repo.markDisposed(scope.ctx, assetId, new Date(`${tanggal}T00:00:00+07:00`));
    await audit.write(scope, { modul: "m04-assets", aksi: "ASSET_STATUS_CHANGED", entitas: "assets", entitasId: assetId, nilaiSebelum: { status: asset.status, kondisi: asset.kondisi }, nilaiSesudah: { status: "TIDAK_TERSEDIA", dihapuskan: true, disposal_id: disposalId, tanggal_penghapusan: tanggal, waktu: clock.now().toISOString() } });
}
export async function reinstateDisposedAsset(scope: TransactionScope, clock: Clock, audit: AuditLogger, input: { assetId: string; disposalId: string; roomId: string; kondisi: "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT"; alasan: string }) {
    if (scope.ctx.roleCode !== "R-01" || !scope.ctx.can("disposal.reinstate")) throw new ForbiddenError();
    const repo = createAssetRepository(scope.tx), asset = await repo.kunciUntukUbah(scope.ctx, Number(input.assetId));
    if (!asset || !asset.dihapuskan) throw new NotFoundError("Aset tidak sedang dihapuskan.");
    if (!await repo.findRuanganAktifById(scope.ctx, Number(input.roomId))) throw new DomainError("VALIDATION_ERROR", "Lokasi pemulihan harus ruangan aktif.");
    await sql`SELECT set_config('sigm4.reinstate_asset',${input.assetId},true)`.execute(scope.tx);
    await repo.reinstateDisposed(scope.ctx, input.assetId, input.roomId, input.kondisi);
    await sql`SELECT set_config('sigm4.reinstate_asset','',true)`.execute(scope.tx);
    await repo.insertRiwayatKondisi(scope.ctx, { assetId: Number(input.assetId), kondisiLama: asset.kondisi, kondisiBaru: input.kondisi, alasan: input.alasan, referensiJenis: "asset_disposal_reinstatement", referensiId: Number(input.disposalId), diubahOleh: scope.ctx.userId, diubahPada: clock.now() });
    await audit.write(scope, { modul: "m04-assets", aksi: "ASSET_CONDITION_CHANGED", entitas: "assets", entitasId: asset.id, nilaiSebelum: { kondisi: asset.kondisi }, nilaiSesudah: { kondisi: input.kondisi, alasan: input.alasan, disposal_id: input.disposalId } });
    if (asset.room_id !== input.roomId) await scope.tx.insertInto("asset_movements").values({ asset_id: asset.id, room_asal_id: asset.room_id, room_tujuan_id: input.roomId, tanggal: new Date(clock.now().getTime() + 7 * 3600000).toISOString().slice(0, 10), alasan: input.alasan, dilakukan_oleh: scope.ctx.userId }).execute();
    await audit.write(scope, { modul: "m04-assets", aksi: "ASSET_STATUS_CHANGED", entitas: "assets", entitasId: asset.id, nilaiSebelum: { status: asset.status, dihapuskan: true, kondisi: asset.kondisi, room_id: asset.room_id }, nilaiSesudah: { dihapuskan: false, kondisi: input.kondisi, room_id: input.roomId, status: input.kondisi === "RUSAK_BERAT" ? "TIDAK_TERSEDIA" : "TERSEDIA", alasan: input.alasan } });
}
