import { sql } from "kysely";
import { randomUUID } from "node:crypto";
import { StocktakeFindingReviewSchema } from "@sigm4/schemas";
import type { z } from "zod";
import type { StocktakeReconcileSchema } from "@sigm4/schemas";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { AssetService, applyStocktakeAdjustment } from "../../m04-assets/index.js";
import { cancelReservationsForUnavailableAsset } from "../../m07-reservation-room/index.js";
import { invalid, lockSession, requireRunning } from "../access.js";
import { createStocktakeRepository } from "../repositories/stocktake.repository.js";

import { MaterialStocktakeService } from "./material-stocktake.service.js";
import { createMaterialStocktakeRepository } from "../repositories/material-stocktake.repository.js";
export class StocktakeReconciliationService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger) {}
    private async log(scope: TransactionScope, id: string, aksi: string, value: unknown) { await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi, entitas: "audit_sessions", entitasId: id, nilaiSesudah: value }); }
    async finalize(scope: TransactionScope, id: string) {
        const row = await lockSession(scope, id); requireRunning(row);
        if (row.finalized_at) return;
        if(row.domain==="BAHAN")await new MaterialStocktakeService(this.clock,this.audit).ready(scope,id,false);
        const incomplete = await scope.tx.selectFrom("audit_session_rooms").select("room_id").where("session_id", "=", id).where("completed_at", "is", null).executeTakeFirst();
        const today = new Date(this.clock.now().getTime() + 7 * 3600000).toISOString().slice(0, 10);
        if (incomplete && today <= row.periode_selesai) throw invalid("Selesaikan seluruh lokasi atau tunggu periode berakhir.");
        await scope.tx.updateTable("audit_items").set({ hasil: sql`CASE WHEN EXISTS(SELECT 1 FROM loan_items l WHERE l.asset_id=audit_items.asset_id AND l.status_kembali='BELUM_KEMBALI') THEN 'DIPINJAM' ELSE 'TIDAK_DITEMUKAN' END`, keterangan: null, tindakan: null }).where("session_id", "=", id).where("diperiksa_pada", "is", null).execute();
        await scope.tx.updateTable("audit_sessions").set({ finalized_at: this.clock.now(), updated_by: pelakuId(scope.ctx) }).where("id", "=", id).execute();
        await this.log(scope, id, "AUDIT_SESSION_FINALIZED", { finalized_at: this.clock.now().toISOString() });
    }
    async reconcile(scope: TransactionScope, id: string, itemId: string, input: z.infer<typeof StocktakeReconcileSchema>) {
        const session = await lockSession(scope, id); requireRunning(session);
        if(session.domain!=="ASET")throw invalid("Tindakan Aset hanya untuk sesi domain Aset.");
        if (!session.finalized_at) throw invalid("Finalisasi sesi sebelum mengisi rekonsiliasi.");
        const item = await scope.tx.selectFrom("audit_items").selectAll().where("id", "=", itemId).where("session_id", "=", id).executeTakeFirst();
        if (!item) throw new NotFoundError();
        const current = await scope.tx.selectFrom("assets").select(["room_id", "kondisi", "dihapuskan"]).where("id", "=", item.asset_id).forUpdate().executeTakeFirstOrThrow();
        if (current.dihapuskan || current.room_id !== String(input.basis.room_id) || current.kondisi !== input.basis.kondisi) throw invalid("Data aset berubah. Muat ulang dan tinjau basis rekonsiliasi terbaru.", "basis");
        if (input.tindakan === "HILANG" && item.hasil !== "TIDAK_DITEMUKAN") throw invalid("Tindakan Hilang hanya untuk aset Tidak Ditemukan.", "tindakan");
        if (item.hasil === "TIDAK_DITEMUKAN" && !["HILANG", "TANPA_PENYESUAIAN"].includes(input.tindakan)) throw invalid("Pilih Hilang atau Tanpa Penyesuaian untuk aset Tidak Ditemukan.", "tindakan");
        if (input.tindakan === "SESUAIKAN" && (!item.room_id_aktual || !item.kondisi_aktual)) throw invalid("Hasil pemeriksaan fisik belum lengkap.", "tindakan");
        await scope.tx.updateTable("audit_items").set({ keterangan: input.keterangan, tindakan: input.tindakan, basis_room_id: current.room_id, basis_kondisi: current.kondisi }).where("id", "=", itemId).execute();
        await this.log(scope, id, "AUDIT_RECONCILIATION_UPDATED", { item_id: itemId, ...input });
    }
    async reviewFinding(scope: TransactionScope, id: string, findingId: string, input: z.infer<typeof StocktakeFindingReviewSchema>) {
        const session = await lockSession(scope, id); requireRunning(session);
        if(session.domain!=="ASET")throw invalid("Tindakan Aset hanya untuk sesi domain Aset.");
        if (!session.finalized_at) throw invalid("Finalisasi sesi sebelum melengkapi temuan baru.");
        if (input.kondisi === "HILANG") throw invalid("Temuan fisik baru tidak dapat berkondisi Hilang.", "kondisi");
        if (input.nilai_perolehan !== null && !scope.ctx.can("asset.view_financial")) throw new ForbiddenError();
        const found = await scope.tx.updateTable("audit_new_findings").set({ keterangan: input.keterangan, pendaftaran: JSON.stringify(input) }).where("id", "=", findingId).where("session_id", "=", id).returning("id").executeTakeFirst();
        if (!found) throw new NotFoundError();
        await this.log(scope, id, "AUDIT_RECONCILIATION_UPDATED", { finding_id: findingId });
    }
    private async ready(scope: TransactionScope, id: string) {
        const session=await lockSession(scope,id);if(session.domain==="BAHAN"){await new MaterialStocktakeService(this.clock,this.audit).ready(scope,id);return;}
        const missing = await scope.tx.selectFrom("audit_items").select("id").where("session_id", "=", id).where("hasil", "in", ["SALAH_LOKASI", "PERBEDAAN_KONDISI", "TIDAK_DITEMUKAN"]).where(eb => eb.or([eb("keterangan", "is", null), eb("tindakan", "is", null)])).executeTakeFirst();
        if (missing) throw invalid("Lengkapi keterangan dan tindakan seluruh selisih sebelum mengirim.");
        const newFinding = await scope.tx.selectFrom("audit_new_findings").select("id").where("session_id", "=", id).where("pendaftaran", "is", null).executeTakeFirst();
        if (newFinding) throw invalid("Lengkapi data pendaftaran setiap temuan baru.");
        const pending = await scope.tx.selectFrom("audit_photos as p").innerJoin("stored_files as f", "f.id", "p.file_id").select("p.id").where("p.session_id", "=", id).where(eb => eb.or([eb("f.checksum", "is", null), eb("f.scan_status", "!=", "CLEAN")])).executeTakeFirst();
        if (pending) throw invalid("Tunggu seluruh foto selesai diunggah dan lolos pemeriksaan keamanan.");
    }
    async submit(scope: TransactionScope, id: string) {
        const session = await lockSession(scope, id); requireRunning(session);
        if (!session.finalized_at) throw invalid("Sesi belum difinalisasi.");
        await this.ready(scope, id);
        await scope.tx.updateTable("audit_sessions").set({ status: "MENUNGGU_PERSETUJUAN", updated_by: pelakuId(scope.ctx) }).where("id", "=", id).execute();
        await this.log(scope, id, "AUDIT_SESSION_SUBMITTED", {});
        await publish(scope, { name: "AuditSessionSubmitted", aggregateType: "audit_session", aggregateId: id, payload: { session_id: Number(id), nama: session.nama } });
    }
    async decide(scope: TransactionScope, id: string, decision: "SETUJU" | "TOLAK", catatan: string) {
        const session = await lockSession(scope, id);
        if(session.domain==="BAHAN"&&scope.ctx.roleCode!=="R-03")throw new ForbiddenError();
        if (session.status !== "MENUNGGU_PERSETUJUAN") throw invalid("Sesi tidak menunggu persetujuan.");
        const participant = await scope.tx.selectFrom("audit_session_assignees").select("user_id").where("session_id", "=", id).where("user_id", "=", String(scope.ctx.userId)).executeTakeFirst();
        if (session.created_by === String(scope.ctx.userId) || participant) throw new ForbiddenError();
        if (decision === "TOLAK") {
            await scope.tx.updateTable("audit_sessions").set({ status: "BERJALAN", finalized_at: null, catatan_keputusan: catatan, updated_by: pelakuId(scope.ctx) }).where("id", "=", id).execute();
            await scope.tx.updateTable("audit_session_rooms").set({ completed_at: null, completed_by: null }).where("session_id", "=", id).execute();
            await this.log(scope, id, "AUDIT_SESSION_REJECTED", { catatan });
        } else {
            await this.ready(scope, id);
            if(session.domain==="BAHAN")await new MaterialStocktakeService(this.clock,this.audit).apply(scope,id);
            const items = await scope.tx.selectFrom("audit_items").selectAll().where("session_id", "=", id).orderBy("asset_id").execute();
            const assets = items.length ? await scope.tx.selectFrom("assets").select(["id", "room_id", "kondisi", "dihapuskan"]).where("id", "in", items.map(i => i.asset_id)).orderBy("id").forUpdate().execute() : [];
            const byId = new Map(assets.map(a => [a.id, a]));
            for (const item of items) {
                if (!["HILANG", "SESUAIKAN"].includes(item.tindakan ?? "")) continue;
                const a = byId.get(item.asset_id)!;
                if (a.dihapuskan || a.room_id !== item.basis_room_id || a.kondisi !== item.basis_kondisi) throw invalid(`Aset ${item.kode_barang} berubah sejak rekonsiliasi. Kembalikan ke Petugas untuk ditinjau ulang.`, "basis");
                const borrowed = await scope.tx.selectFrom("loan_items").select("id").where("asset_id", "=", item.asset_id).where("status_kembali", "=", "BELUM_KEMBALI").executeTakeFirst();
                if (borrowed && item.tindakan === "HILANG") throw invalid(`Aset ${item.kode_barang} masih dipinjam; tidak dapat dinyatakan hilang.`);
                const condition = item.tindakan === "HILANG" ? "HILANG" : item.kondisi_aktual;
                await applyStocktakeAdjustment(scope, this.clock, this.audit, { assetId: item.asset_id, sessionId: id, roomId: item.tindakan === "SESUAIKAN" ? item.room_id_aktual : null, kondisi: condition, alasan: item.keterangan! });
                if (condition === "HILANG" || condition === "RUSAK_BERAT") await cancelReservationsForUnavailableAsset(scope, Number(item.asset_id), this.clock, this.audit, item.nama);
                if (condition === "HILANG") await publish(scope, { name: "AssetMarkedLost", aggregateType: "asset", aggregateId: item.asset_id, payload: { asset_id: Number(item.asset_id), aset: item.nama, referensi: session.nomor, session_id: Number(id) } });
                await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_ADJUSTMENT_APPLIED", entitas: "assets", entitasId: item.asset_id, nilaiSesudah: { session_id: id, tindakan: item.tindakan, kondisi: condition, room_id: item.room_id_aktual } });
            }
            const findings = await scope.tx.selectFrom("audit_new_findings").selectAll().where("session_id", "=", id).orderBy("id").execute();
            for (const finding of findings) {
                const f = StocktakeFindingReviewSchema.parse(finding.pendaftaran);
                const asset = (await new AssetService(scope.tx, this.audit, this.clock).daftarkan(scope.ctx, { nama: f.nama, categoryId: f.category_id, roomId: f.room_id, kondisi: f.kondisi, tahunPerolehan: f.tahun_perolehan, sumberPerolehan: f.sumber_perolehan, nilaiPerolehan: f.nilai_perolehan, merek: null, model: null, nomorSeri: null, dapatDipinjam: false, bolehDipinjamSiswa: false, penanggungJawabId: null, procurementId: null, jumlahUnit: 1 }, scope))[0]!;
                await scope.tx.updateTable("audit_new_findings").set({ asset_id_hasil: asset.id }).where("id", "=", finding.id).execute();
                await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_ADJUSTMENT_APPLIED", entitas: "assets", entitasId: asset.id, nilaiSesudah: { session_id: id, finding_id: finding.id } });
            }
            await scope.tx.updateTable("audit_sessions").set({ status: "SELESAI", disetujui_oleh: scope.ctx.userId, disetujui_pada: this.clock.now(), catatan_keputusan: catatan, report_status: "MENUNGGU", report_object_key: `stocktake-report/${id}/${randomUUID()}.pdf`, updated_by: pelakuId(scope.ctx) }).where("id", "=", id).execute();
            await scope.tx.deleteFrom("audit_active_assets").where("session_id", "=", id).execute();
            const repo = createStocktakeRepository(scope.tx), fullItems = [];
            for (let page = 1; ; page++) { const result = await repo.items(scope.ctx, id, page, 500); fullItems.push(...result.data); if (page >= result.meta.total_pages) break; }
            const fullFindings = [];
            for (let page = 1; ; page++) { const result = await repo.findings(scope.ctx, id, page, 500); fullFindings.push(...result.data.map(f => ({ ...f, pendaftaran: f.pendaftaran && { ...f.pendaftaran, nilai_perolehan: null } }))); if (page >= result.meta.total_pages) break; }
            const materials=[];if(session.domain==="BAHAN")for(let page=1;;page++){const result=await createMaterialStocktakeRepository(scope.tx).items(scope.ctx,id,page,500);materials.push(...result.data);if(page>=result.meta.total_pages)break;}
            const approver = await scope.tx.selectFrom("users").select("nama").where("id", "=", String(scope.ctx.userId)).executeTakeFirstOrThrow();
            await scope.tx.updateTable("audit_sessions").set({ report_snapshot: JSON.stringify({ session: await repo.detail(scope.ctx, id), approver: approver.nama, items: fullItems, findings: fullFindings,materials }) }).where("id", "=", id).execute();
            await this.log(scope, id, "AUDIT_SESSION_APPROVED", { catatan });
            await publish(scope, { name: "AuditReportRequested", aggregateType: "audit_session", aggregateId: id, payload: { session_id: Number(id) } });
        }
        const recipients = await scope.tx.selectFrom("audit_session_assignees").select("user_id").where("session_id", "=", id).execute();
        await publish(scope, { name: "AuditSessionDecided", aggregateType: "audit_session", aggregateId: id, payload: { session_id: Number(id), nama: session.nama, keputusan: decision, catatan, pelaksana_ids: recipients.map(r => Number(r.user_id)) } });
    }
}
