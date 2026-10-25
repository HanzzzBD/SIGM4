import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError } from "../../../shared/errors/index.js";
export async function claimMaterialReceiptFiles(scope: TransactionScope, ids: readonly number[], receiptId: string): Promise<void> {
    if (!scope.ctx.can("material.receive")) throw new ForbiddenError();
    if (!ids.length || new Set(ids).size !== ids.length) throw new DomainError("VALIDATION_ERROR", "Lampirkan dokumen penerimaan yang tidak berulang.");
    const files = await scope.tx.selectFrom("stored_files").select("id").where("id", "in", ids.map(String)).where("owner_type", "=", "MATERIAL_RECEIPT_DOCUMENT").where("uploaded_by", "=", String(scope.ctx.userId)).where("checksum", "is not", null).where("scan_status", "=", "CLEAN").where(e => e.or([e("owner_id", "is", null), e("owner_id", "=", receiptId)])).orderBy("id").forUpdate().execute();
    if (files.length !== ids.length) throw new DomainError("VALIDATION_ERROR", "Dokumen harus milik Anda, terunggah dan terverifikasi, serta belum dipakai penerimaan lain.");
    await scope.tx.updateTable("stored_files").set({ owner_id: receiptId }).where("id", "in", ids.map(String)).execute();
}
