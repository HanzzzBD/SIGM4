import { MaterialRequestDecisionSchema } from "@sigm4/schemas";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { PenanganHasil, PenyediaRincian } from "../../m10-approval/index.js";
import { createMaterialRequestRepository } from "../repositories/request.repository.js";
import { materialInvalid } from "../access.js";
import type { MaterialItemSnapshot } from "../access.js";
export function materialRequestApproval(clock: Clock, audit: AuditLogger): PenanganHasil { return {
    jenis: "PERMINTAAN_BAHAN",
    kunciObjek: async (scope, id) => { await createMaterialRequestRepository(scope.tx).lock(scope.ctx, String(id), true); },
    saatKeputusan: async (scope, id, input) => {
        if (!scope.ctx.can("material.view")) throw new ForbiddenError();
        const repo = createMaterialRequestRepository(scope.tx), row = await repo.lock(scope.ctx, String(id), true);
        if (row.status !== "MENUNGGU_PERSETUJUAN") throw materialInvalid("Permintaan tidak lagi menunggu persetujuan.");
        if (!input.catatan?.trim()) throw materialInvalid("Catatan keputusan bahan wajib diisi.", "catatan");
        if (input.keputusan !== "DISETUJUI" && input.rincian !== undefined) throw materialInvalid("Rincian jumlah hanya untuk persetujuan.", "rincian_keputusan");
        const items = await repo.items(scope.ctx, row.id, row.revision);
        if (input.keputusan === "DISETUJUI") {
            const parsed = input.rincian === undefined ? undefined : MaterialRequestDecisionSchema.safeParse(input.rincian);
            if (parsed && !parsed.success) throw materialInvalid("Rincian jumlah tidak sah.", "rincian_keputusan");
            const choices = parsed?.success ? parsed.data.items : undefined;
            if (choices && (choices.length !== items.length || choices.some(c => !items.some(i => i.id === String(c.item_id))))) throw materialInvalid("Setiap baris wajib diputuskan tepat sekali.", "rincian_keputusan");
            const selected = items.map(i => ({ ...i, qty: choices?.find(c => String(c.item_id) === i.id)?.jumlah_disetujui ?? i.jumlah_disetujui ?? i.jumlah_diminta }));
            if (selected.some(i => i.qty > (i.jumlah_disetujui ?? i.jumlah_diminta))) throw materialInvalid("Level berikutnya tidak boleh menaikkan jumlah yang disetujui.", "rincian_keputusan");
            if (!selected.some(i => i.qty > 0)) throw materialInvalid("Setujui minimal satu unit atau gunakan Tolak.", "rincian_keputusan");
            for (const i of selected) await scope.tx.updateTable("material_request_items").set({ jumlah_disetujui: i.qty }).where("id", "=", i.id).execute();
        }
        const result = { revision: row.revision, keputusan: input.keputusan, items: (await repo.items(scope.ctx, row.id, row.revision)).map(i => ({ item_id: Number(i.id), ...(i.snapshot as MaterialItemSnapshot), jumlah_diminta: i.jumlah_diminta, jumlah_disetujui: i.jumlah_disetujui })) };
        await audit.write(scope, { modul: "m22-materials", aksi: input.keputusan === "DISETUJUI" ? "MATERIAL_REQUEST_APPROVED" : input.keputusan === "PERLU_REVISI" ? "MATERIAL_REQUEST_REVISION_REQUESTED" : "MATERIAL_REQUEST_REJECTED", entitas: "material_requests", entitasId: row.id, nilaiSesudah: result }); return result;
    },
    sebelumDisetujui: async (scope, id, decidedAt) => {
        const repo = createMaterialRequestRepository(scope.tx), row = await repo.lock(scope.ctx, String(id), true), items = await repo.items(scope.ctx, row.id, row.revision);
        if (row.status !== "MENUNGGU_PERSETUJUAN" || !items.some(i => (i.jumlah_disetujui ?? 0) > 0)) throw materialInvalid("Tidak ada jumlah yang dapat disetujui.");
        await scope.tx.updateTable("material_requests").set({ status: items.some(i => i.jumlah_disetujui !== i.jumlah_diminta) ? "DISETUJUI_SEBAGIAN" : "DISETUJUI", approved_at: decidedAt ?? clock.now(), updated_at: decidedAt ?? clock.now(), updated_by: String(scope.ctx.userId) }).where("id", "=", row.id).execute();
        await publish(scope, { name: "MaterialRequestReady", aggregateType: "material_request", aggregateId: row.id, payload: { request_id: Number(row.id), pemohon_id: Number(row.pemohon_id), revision: row.revision } });
    },
    setelahDitutup: async (scope, id, status) => {
        const row = await createMaterialRequestRepository(scope.tx).lock(scope.ctx, String(id), true); if (row.status !== "MENUNGGU_PERSETUJUAN") throw materialInvalid("Permintaan tidak menunggu keputusan.");
        const actor = pelakuId(scope.ctx);
        await scope.tx.updateTable("material_requests").set({ status, updated_at: clock.now(), updated_by: actor === null ? null : String(actor) }).where("id", "=", row.id).execute();
        await audit.write(scope, { modul: "m22-materials", aksi: status === "PERLU_REVISI" ? "MATERIAL_REQUEST_REVISION_REQUESTED" : "MATERIAL_REQUEST_REJECTED", entitas: "material_requests", entitasId: row.id, nilaiSesudah: { status } });
    },
}; }
export const materialRequestApprovalSource: PenyediaRincian = { jenis: "PERMINTAAN_BAHAN", rincian: async (scope, id) => { const row = await createMaterialRequestRepository(scope.tx).lock(scope.ctx, String(id), true); return { label: `Permintaan bahan ${row.nomor}`, objek: row.keperluan, tanggal: null, deepLink: `/permintaan-bahan/${row.id}` }; } };
