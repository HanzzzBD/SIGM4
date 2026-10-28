import type { MaterialAdjustmentBody } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { materialStorageRoom } from "../../m03-locations/index.js";
import { MaterialLedgerService } from "./ledger.service.js";
export class MaterialAdjustmentService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async adjust(scope: TransactionScope, id: string, input: MaterialAdjustmentBody) {
        if (!scope.ctx.can("material.adjust")) throw new ForbiddenError();
        if (!await scope.tx.selectFrom("materials").select("id").where("id", "=", id).forUpdate().executeTakeFirst()) throw new NotFoundError();
        await materialStorageRoom(scope, input.room_id);
        const row = await scope.tx.insertInto("material_adjustments").values({ material_id: id, room_id: String(input.room_id), arah: input.arah, jumlah: input.jumlah, alasan: input.alasan, created_at: this.clock.now(), created_by: String(scope.ctx.userId) }).returning("id").executeTakeFirstOrThrow();
        const tx = await new MaterialLedgerService(this.clock, this.audit).record(scope, { materialId: Number(id), roomId: input.room_id, jenis: "PENYESUAIAN", delta: input.arah === "TAMBAH" ? input.jumlah : -input.jumlah, referenceKind: "material_adjustment", referenceId: Number(row.id), alasan: input.alasan });
        await scope.tx.updateTable("material_adjustments").set({ transaction_id: tx.id }).where("id", "=", row.id).execute();
        await this.audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_ADJUSTED", entitas: "material_adjustments", entitasId: row.id, nilaiSesudah: { ...input, material_id: id, transaction_id: tx.id, saldo_sesudah: tx.saldo_sesudah } });
        return { id: row.id, material_id: id, room_id: String(input.room_id), jumlah: input.arah === "TAMBAH" ? input.jumlah : -input.jumlah, transaction_id: tx.id, created_at: this.clock.now().toISOString() };
    }
}
