import { DisposalPartialSchema, DisposalCandidateSchema } from "@sigm4/schemas";
import type { PenanganHasil, PenyediaRincian } from "../../m10-approval/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { publish } from "../../../shared/events/index.js";
import { createDisposalRepository } from "../repositories/disposal.repository.js";
import { invalid } from "../access.js";
export function disposalApprovalAdapter(audit: AuditLogger, clock: Clock): PenanganHasil { return {
    jenis: "PENGHAPUSAN_ASET",
    kunciObjek: async (scope, id) => { await createDisposalRepository(scope.tx).lock(scope.ctx, String(id)); },
    saatKeputusan: async (scope, id, input) => {
        if (!scope.ctx.can("disposal.view")) throw new ForbiddenError();
        const repo = createDisposalRepository(scope.tx), row = await repo.lock(scope.ctx, String(id));
        if (row.status !== "MENUNGGU_PERSETUJUAN") throw invalid("Usulan tidak menunggu persetujuan.");
        if (!input.catatan?.trim()) throw invalid("Catatan keputusan penghapusan wajib diisi.", "catatan");
        if (input.keputusan !== "DISETUJUI" && input.rincian !== undefined) throw invalid("Rincian aset hanya untuk persetujuan.", "rincian_keputusan");
        const items = await repo.items(scope.ctx, row.id);
        if (input.keputusan === "DISETUJUI") {
            const files = await scope.tx.selectFrom("asset_disposal_files as p").innerJoin("stored_files as f", "f.id", "p.file_id").select(["f.scan_status", "f.checksum"]).where("p.disposal_id", "=", row.id).execute();
            if (files.some(f => !f.checksum || f.scan_status !== "CLEAN")) throw invalid("Tunggu seluruh lampiran CLEAN sebelum persetujuan.", "lampiran");
            let choices: ReturnType<typeof DisposalPartialSchema.parse>["items"] | undefined;
            if (input.rincian !== undefined) { const parsed = DisposalPartialSchema.safeParse(input.rincian); if (!parsed.success) throw invalid("Rincian keputusan aset tidak sah.", "rincian_keputusan"); choices = parsed.data.items; }
            if (choices && (choices.length !== items.length || choices.some(c => !items.some(i => i.id === String(c.item_id))))) throw invalid("Keputusan sebagian wajib mencakup setiap aset usulan.", "rincian_keputusan");
            const selected = items.map(i => { const choice = choices?.find(c => String(c.item_id) === i.id); const approved = choice?.disetujui ?? i.disetujui !== false;
                if (i.disetujui === false && approved) throw invalid("Aset yang ditolak level sebelumnya tidak boleh ditambahkan kembali.", "rincian_keputusan");
                return { id: i.id, assetId: i.asset_id, approved, reason: choice?.keterangan || input.catatan! }; });
            if (!selected.some(i => i.approved)) throw invalid("Pilih minimal satu aset; gunakan Tolak untuk menolak seluruh usulan.", "rincian_keputusan");
            for (const i of selected) { await scope.tx.updateTable("asset_disposal_items").set({ disetujui: i.approved, keterangan: i.reason }).where("id", "=", i.id).execute(); if (!i.approved) await scope.tx.deleteFrom("asset_disposal_claims").where("asset_id", "=", i.assetId).where("disposal_id", "=", row.id).execute(); }
        }
        const snapshot = { items: (await repo.items(scope.ctx, row.id)).map(i => { const asset = DisposalCandidateSchema.parse(i.snapshot); return { item_id: Number(i.id), asset_id: Number(i.asset_id), kode_barang: asset.kode_barang, nama: asset.nama, disetujui: i.disetujui, keterangan: i.keterangan }; }), keputusan: input.keputusan };
        await audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_DECIDED", entitas: "asset_disposals", entitasId: row.id, nilaiSesudah: snapshot }); return snapshot;
    },
    sebelumDisetujui: async (scope, id, decidedAt) => {
        if (scope.ctx.roleCode !== "R-03" || !scope.ctx.can("disposal.approve")) throw new ForbiddenError();
        const repo = createDisposalRepository(scope.tx), row = await repo.lock(scope.ctx, String(id)), items = await repo.items(scope.ctx, row.id);
        if (row.status !== "MENUNGGU_PERSETUJUAN" || !items.some(i => i.disetujui)) throw invalid("Tidak ada aset yang dapat disetujui.");
        const status = items.some(i => !i.disetujui) ? "DISETUJUI_SEBAGIAN" : "DISETUJUI";
        await scope.tx.updateTable("asset_disposals").set({ status, disetujui_oleh: String(scope.ctx.userId), disetujui_pada: decidedAt ?? clock.now(), updated_by: String(scope.ctx.userId) }).where("id", "=", row.id).execute();
        await publish(scope, { name: "AssetDisposalDecided", aggregateType: "asset_disposal", aggregateId: row.id, payload: { disposal_id: Number(row.id), pengusul_id: Number(row.pengusul_id), status } });
    },
    setelahDitutup: async (scope, id, status) => {
        const row = await createDisposalRepository(scope.tx).lock(scope.ctx, String(id)); if (row.status !== "MENUNGGU_PERSETUJUAN") throw invalid("Usulan tidak lagi menunggu keputusan.");
        if (status === "DITOLAK") await scope.tx.deleteFrom("asset_disposal_claims").where("disposal_id", "=", row.id).execute();
        await scope.tx.updateTable("asset_disposals").set({ status, updated_by: pelakuId(scope.ctx) }).where("id", "=", row.id).execute();
        await audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_DECIDED", entitas: "asset_disposals", entitasId: row.id, nilaiSesudah: { status } });
        await publish(scope, { name: "AssetDisposalDecided", aggregateType: "asset_disposal", aggregateId: row.id, payload: { disposal_id: Number(row.id), pengusul_id: Number(row.pengusul_id), status } });
    },
}; }
export const disposalApprovalSource: PenyediaRincian = { jenis: "PENGHAPUSAN_ASET", rincian: async (scope, id) => { const row = await createDisposalRepository(scope.tx).lock(scope.ctx, String(id)); return { label: `Penghapusan ${row.nomor}`, objek: row.justifikasi, tanggal: null, deepLink: `/penghapusan/${row.id}` }; } };
