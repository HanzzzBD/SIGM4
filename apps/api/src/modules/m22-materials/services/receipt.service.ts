import type { MaterialReceiptBody } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { ForbiddenError, DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { claimMaterialReceiptFiles } from "../../m06-documents/index.js";
import { materialStorageRoom } from "../../m03-locations/index.js";
import { MaterialLedgerService } from "./ledger.service.js";
export class MaterialReceiptService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async receive(scope: TransactionScope, id: string, input: MaterialReceiptBody) {
        if (!scope.ctx.can("material.receive")) throw new ForbiddenError();
        const date = new Date(this.clock.now().getTime() + 7 * 3600000).toISOString().slice(0, 10);
        if (input.tanggal_terima > date) throw new DomainError("VALIDATION_ERROR", "Tanggal penerimaan tidak boleh mendatang (WIB).");
        const material = await scope.tx.selectFrom("materials").select(["id", "status"]).where("id", "=", id).forUpdate().executeTakeFirst();
        if (!material) throw new NotFoundError();
        if (material.status !== "AKTIF") throw new DomainError("VALIDATION_ERROR", "Penerimaan memerlukan bahan aktif.");
        await materialStorageRoom(scope, input.room_id);
        const receipt = await scope.tx.insertInto("material_receipts").values({ material_id: id, room_id: String(input.room_id), jumlah: input.jumlah, tanggal_terima: input.tanggal_terima, nomor_dokumen: input.nomor_dokumen, catatan: input.catatan || null, created_at: this.clock.now(), created_by: String(scope.ctx.userId) }).returning("id").executeTakeFirstOrThrow();
        await claimMaterialReceiptFiles(scope, input.dokumen.map(f => f.file_id), receipt.id);
        await scope.tx.insertInto("material_receipt_files").values(input.dokumen.map(f => ({ receipt_id: receipt.id, file_id: String(f.file_id), nama_berkas: f.nama_berkas }))).execute();
        const tx = await new MaterialLedgerService(this.clock, this.audit).record(scope, { materialId: Number(id), roomId: input.room_id, jenis: "PENERIMAAN", delta: input.jumlah, referenceKind: "material_receipt", referenceId: Number(receipt.id), alasan: input.catatan || input.nomor_dokumen });
        await scope.tx.updateTable("material_receipts").set({ transaction_id: tx.id }).where("id", "=", receipt.id).execute();
        await this.audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_RECEIVED", entitas: "material_receipts", entitasId: receipt.id, nilaiSesudah: { ...input, material_id: id, transaction_id: tx.id, saldo_sesudah: tx.saldo_sesudah } });
        return { id: receipt.id, material_id: id, room_id: String(input.room_id), jumlah: input.jumlah, transaction_id: tx.id, created_at: this.clock.now().toISOString() };
    }
}
