import type { AuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor, TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { MaterialLedgerService } from "./ledger.service.js";
export async function procurementMaterialOptions(db: QueryExecutor, ctx: AuthContext) {
    if (!ctx.can("procurement.view") && !ctx.can("procurement.create")) throw new ForbiddenError();
    return db.selectFrom("materials as m").innerJoin("material_units as u", "u.id", "m.satuan_id").select(["m.id", "m.nama", "u.simbol as satuan", "m.material_category_id as category_id"]).where("m.status", "=", "AKTIF").orderBy("m.nama").execute();
}
export async function procurementMaterial(scope: TransactionScope, id: number) {
    if (!scope.ctx.can("procurement.create") && !scope.ctx.can("procurement.receive")) throw new ForbiddenError();
    const material = await scope.tx.selectFrom("materials as m").innerJoin("material_units as u", "u.id", "m.satuan_id").select(["m.id", "m.nama", "m.status", "m.satuan_id", "u.simbol"]).where("m.id", "=", String(id)).forUpdate("m").executeTakeFirst();
    if (!material) throw new NotFoundError("Jenis bahan tidak ditemukan.");
    if (material.status !== "AKTIF") throw new DomainError("VALIDATION_ERROR", "Pengadaan dan penerimaan bahan memerlukan master aktif.");
    return material;
}
/** BR-064: receiving a material procurement line never calls the asset module. */
export async function receiveProcurementMaterial(scope: TransactionScope, clock: Clock, audit: AuditLogger, input: { receiptItemId: string; materialId: string; unitId: string; roomId: number; jumlah: number; nomor: string }) {
    if (!scope.ctx.can("procurement.receive") || !scope.ctx.can("material.receive")) throw new ForbiddenError();
    const material = await procurementMaterial(scope, Number(input.materialId));
    if (material.satuan_id !== input.unitId) throw new DomainError("VALIDATION_ERROR", "Satuan bahan berubah sejak pengajuan pengadaan. Penyerahan tanpa konversi tidak dapat dilanjutkan.");
    const tx = await new MaterialLedgerService(clock, audit).record(scope, { materialId: Number(material.id), roomId: input.roomId, jenis: "PENERIMAAN", delta: input.jumlah, referenceKind: "procurement_receipt_item", referenceId: Number(input.receiptItemId), alasan: input.nomor });
    await scope.tx.insertInto("procurement_receipt_materials").values({ receipt_item_id: input.receiptItemId, material_id: material.id, room_id: String(input.roomId), transaction_id: tx.id }).execute();
    await audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_RECEIVED", entitas: "procurement_receipt_items", entitasId: input.receiptItemId, nilaiSesudah: { ...input, transaction_id: tx.id, saldo_sesudah: tx.saldo_sesudah } });
}
