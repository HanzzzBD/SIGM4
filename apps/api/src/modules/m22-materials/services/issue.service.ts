import type { MaterialIssueBody } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { createMaterialRequestRepository } from "../repositories/request.repository.js";
import { MaterialLedgerService } from "./ledger.service.js";
import { materialInvalid, materialWibDate } from "../access.js";
export class MaterialIssueService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async issue(scope: TransactionScope, id: string, input: MaterialIssueBody) {
        if (!scope.ctx.can("material.issue")) throw new ForbiddenError();
        const repo = createMaterialRequestRepository(scope.tx), row = await repo.lock(scope.ctx, id);
        if (!["DISETUJUI", "DISETUJUI_SEBAGIAN", "DISERAHKAN_SEBAGIAN"].includes(row.status)) throw materialInvalid("Permintaan belum disetujui atau sudah ditutup.");
        if (input.tanggal_serah > materialWibDate(this.clock.now()) || input.tanggal_serah < materialWibDate(row.approved_at!)) throw materialInvalid("Tanggal serah tidak boleh sebelum persetujuan atau mendatang (WIB).", "tanggal_serah");
        const items = await repo.items(scope.ctx, id, row.revision), selected = input.items.map(i => ({ input: i, item: items.find(r => r.id === String(i.item_id)) }));
        if (selected.some(i => !i.item || i.input.jumlah > (i.item.jumlah_disetujui ?? 0) - i.item.jumlah_diserahkan)) throw materialInvalid("Jumlah melampaui sisa disetujui, atau item bukan milik permintaan ini.", "items");
        const ids = [...new Set(selected.map(i => i.item!.material_id))];
        const materials = await scope.tx.selectFrom("materials").select(["id", "satuan_id"]).where("id", "in", ids).orderBy("id").forUpdate().execute();
        if (selected.some(i => materials.find(m => m.id === i.item!.material_id)?.satuan_id !== i.item!.satuan_id)) throw materialInvalid("Satuan bahan berubah sejak pengajuan.");
        const issue = await scope.tx.insertInto("material_issues").values({ request_id: id, nama_penerima: input.nama_penerima, tanggal_serah: input.tanggal_serah, catatan: input.catatan || null, created_at: this.clock.now(), created_by: String(scope.ctx.userId) }).returning("id").executeTakeFirstOrThrow();
        for (const i of selected.sort((a, b) => Number(a.item!.material_id) - Number(b.item!.material_id) || Number(a.item!.room_id) - Number(b.item!.room_id))) {
            const item = i.item!, tx = await new MaterialLedgerService(this.clock, this.audit).record(scope, { materialId: Number(item.material_id), roomId: Number(item.room_id), jenis: "PENGELUARAN", delta: -i.input.jumlah, referenceKind: "material_issue", referenceId: Number(issue.id), alasan: input.catatan || row.keperluan });
            await scope.tx.insertInto("material_issue_items").values({ issue_id: issue.id, item_id: item.id, jumlah: i.input.jumlah, transaction_id: tx.id }).execute();
            await scope.tx.updateTable("material_request_items").set({ jumlah_diserahkan: item.jumlah_diserahkan + i.input.jumlah }).where("id", "=", item.id).execute();
        }
        const remaining = await repo.items(scope.ctx, id, row.revision), status = remaining.every(i => i.jumlah_diserahkan === (i.jumlah_disetujui ?? 0)) ? "DISERAHKAN" : "DISERAHKAN_SEBAGIAN";
        await scope.tx.updateTable("material_requests").set({ status, diserahkan_oleh: String(scope.ctx.userId), diserahkan_pada: this.clock.now(), updated_at: this.clock.now(), updated_by: String(scope.ctx.userId) }).where("id", "=", id).execute();
        await this.audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_ISSUED", entitas: "material_issues", entitasId: issue.id, nilaiSesudah: { ...input, request_id: id, status } });
        await publish(scope, { name: "MaterialIssued", aggregateType: "material_request", aggregateId: id, payload: { request_id: Number(id), issue_id: Number(issue.id), pemohon_id: Number(row.pemohon_id), tanggal: input.tanggal_serah } });
    }
    async close(scope: TransactionScope, id: string, alasan: string) {
        if (!scope.ctx.can("material.issue")) throw new ForbiddenError();
        const row = await createMaterialRequestRepository(scope.tx).lock(scope.ctx, id);
        if (row.status !== "DISERAHKAN_SEBAGIAN") throw materialInvalid("Penutupan sisa hanya tersedia setelah penyerahan sebagian.");
        await scope.tx.updateTable("material_requests").set({ status: "DITUTUP", catatan_penutupan: alasan, updated_at: this.clock.now(), updated_by: String(scope.ctx.userId) }).where("id", "=", id).execute();
        await this.audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_REQUEST_CLOSED", entitas: "material_requests", entitasId: id, nilaiSesudah: { alasan } });
    }
}
