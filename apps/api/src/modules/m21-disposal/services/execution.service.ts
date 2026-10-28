import { DisposalCandidateSchema } from "@sigm4/schemas";
import type { DisposalExecuteSchema, DisposalReinstateSchema } from "@sigm4/schemas";
import type { z } from "zod";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { executeAssetDisposal, reinstateDisposedAsset } from "../../m04-assets/index.js";
import { claimDisposalFiles } from "../../m06-documents/index.js";
import { createDisposalRepository } from "../repositories/disposal.repository.js";
import { invalid, disposalBlockers, lockAssets, wibDate } from "../access.js";
export class DisposalExecutionService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async execute(scope: TransactionScope, id: string, input: z.infer<typeof DisposalExecuteSchema>) {
        if (!scope.ctx.can("disposal.execute")) throw new ForbiddenError();
        const repo = createDisposalRepository(scope.tx), row = await repo.lock(scope.ctx, id);
        if (!["DISETUJUI", "DISETUJUI_SEBAGIAN"].includes(row.status)) throw invalid("Usulan belum disetujui atau sudah dieksekusi.");
        if (input.tanggal > wibDate(this.clock.now()) || input.tanggal < wibDate(row.disetujui_pada!)) throw invalid("Tanggal pelaksanaan harus sesudah persetujuan dan tidak mendatang (WIB).", "tanggal");
        const items = (await repo.items(scope.ctx, id)).filter(i => i.disetujui), ids = items.map(i => i.asset_id), assets = await lockAssets(scope, ids);
        if (!ids.length) throw invalid("Tidak ada aset disetujui.");
        const blockers = await disposalBlockers(scope, ids, this.clock.now(), id);
        for (const i of items) {
            const snapshot = DisposalCandidateSchema.parse(i.snapshot), a = assets.find(a => a.id === i.asset_id)!;
            if (a.dihapuskan || a.kondisi !== snapshot.kondisi || a.room_id !== snapshot.room_id || a.nilai_perolehan !== snapshot.nilai_perolehan) throw invalid(`${snapshot.kode_barang} berubah sejak pengajuan. Batalkan dan ajukan ulang dengan data terbaru.`, "items");
            if (blockers.get(i.asset_id)!.length) throw invalid(`${snapshot.kode_barang}: ${blockers.get(i.asset_id)!.join("; ")}.`, "items");
            if (!await scope.tx.selectFrom("asset_disposal_claims").select("asset_id").where("asset_id", "=", i.asset_id).where("disposal_id", "=", id).executeTakeFirst()) throw invalid("Blokir aset sudah tidak dimiliki usulan.");
            if (snapshot.kondisi === "HILANG" && !snapshot.loss_session_id) {
                if (!i.bukti_kehilangan_file_id) throw invalid("Bukti kehilangan wajib.");
                const f = await scope.tx.selectFrom("stored_files").select(["checksum", "scan_status"]).where("id", "=", i.bukti_kehilangan_file_id).executeTakeFirst();
                if (!f?.checksum || f.scan_status !== "CLEAN") throw invalid("Bukti kehilangan belum CLEAN.");
            }
        }
        const lost = row.alasan === "HILANG";
        if (lost ? input.tindak_lanjut !== "ADMINISTRATIF" : input.tindak_lanjut === "ADMINISTRATIF") throw invalid("Pelaksanaan administratif khusus aset Hilang.", "tindak_lanjut");
        if (!lost && input.foto_file_ids.length === 0) throw invalid("Minimal satu foto CLEAN wajib untuk pelaksanaan fisik.", "foto_file_ids");
        await claimDisposalFiles(scope, "DISPOSAL_EXECUTION_PHOTO", input.foto_file_ids, id, true);
        if (input.foto_file_ids.length) await scope.tx.insertInto("asset_disposal_files").values(input.foto_file_ids.map(file_id => ({ disposal_id: id, file_id: String(file_id), nama_berkas: "Bukti pelaksanaan penghapusan", jenis: "FOTO_PELAKSANAAN" }))).execute();
        for (const i of items) { await executeAssetDisposal(scope, this.clock, this.audit, i.asset_id, id, input.tanggal); await scope.tx.updateTable("asset_disposal_items").set({ executed_at: this.clock.now() }).where("id", "=", i.id).execute(); }
        await scope.tx.updateTable("asset_disposals").set({ status: "SELESAI", tindak_lanjut_fisik: input.tindak_lanjut, dilaksanakan_oleh: String(scope.ctx.userId), tanggal_pelaksanaan: input.tanggal, dilaksanakan_pada: this.clock.now(), saksi: JSON.stringify(input.saksi), catatan: input.catatan, report_status: "MENUNGGU", updated_by: String(scope.ctx.userId) }).where("id", "=", id).execute();
        await scope.tx.deleteFrom("asset_disposal_claims").where("disposal_id", "=", id).execute();
        const detail = await repo.detail(scope.ctx, id), financialItems = await repo.items(scope.ctx, id), approver = await scope.tx.selectFrom("users").select("nama").where("id", "=", row.disetujui_oleh!).executeTakeFirstOrThrow();
        // Store full server-owned values; readers/exporters mask by their permissions.
        const snapshot = { ...detail, total_nilai: row.total_nilai, items: detail.items.map(i => ({ ...i, snapshot: DisposalCandidateSchema.parse(financialItems.find(f => f.id === i.id)!.snapshot) })), penyetuju: approver.nama };
        await scope.tx.updateTable("asset_disposals").set({ report_snapshot: JSON.stringify(snapshot) }).where("id", "=", id).execute();
        await this.audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_EXECUTED", entitas: "asset_disposals", entitasId: id, nilaiSesudah: { asset_ids: ids, tanggal: input.tanggal, tindak_lanjut: input.tindak_lanjut, saksi: input.saksi } });
        await publish(scope, { name: "AssetDisposalReportRequested", aggregateType: "asset_disposal", aggregateId: id, payload: { disposal_id: Number(id) } });
    }
    async reinstate(scope: TransactionScope, assetId: string, input: z.infer<typeof DisposalReinstateSchema>) {
        if (scope.ctx.roleCode !== "R-01" || !scope.ctx.can("disposal.reinstate")) throw new ForbiddenError();
        const item = await scope.tx.selectFrom("asset_disposal_items as i").innerJoin("asset_disposals as d", "d.id", "i.disposal_id").select(["i.id", "i.disposal_id", "d.alasan"]).where("i.asset_id", "=", assetId).where("i.executed_at", "is not", null).where("i.reinstated_at", "is", null).orderBy("i.executed_at", "desc").orderBy("i.id", "desc").executeTakeFirst();
        if (!item) throw new NotFoundError("Penghapusan aktif aset tidak ditemukan.");
        await createDisposalRepository(scope.tx).lock(scope.ctx, item.disposal_id);
        const locked = await scope.tx.selectFrom("asset_disposal_items").select("reinstated_at").where("id", "=", item.id).forUpdate().executeTakeFirstOrThrow();
        if (item.alasan !== "HILANG" || locked.reinstated_at) throw invalid("Hanya aset yang dihapus karena Hilang dapat dipulihkan.");
        await reinstateDisposedAsset(scope, this.clock, this.audit, { assetId, disposalId: item.disposal_id, roomId: String(input.room_id), kondisi: input.kondisi, alasan: input.alasan });
        await scope.tx.updateTable("asset_disposal_items").set({ reinstated_at: this.clock.now(), reinstated_by: String(scope.ctx.userId), reinstatement_reason: input.alasan }).where("id", "=", item.id).execute();
        await this.audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_REINSTATED", entitas: "assets", entitasId: assetId, nilaiSesudah: { disposal_id: item.disposal_id, ...input } }); return item.disposal_id;
    }
}
