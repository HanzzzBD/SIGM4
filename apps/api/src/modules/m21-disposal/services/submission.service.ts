import { sql } from "kysely";
import type { DisposalCreate, DisposalCandidate } from "@sigm4/schemas";
import { DisposalCandidateSchema } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { publish } from "../../../shared/events/index.js";
import type { ApprovalService, KamusFakta } from "../../m10-approval/index.js";
import { claimDisposalFiles, releaseDisposalAttachments } from "../../m06-documents/index.js";
import { procurementRequesterOverdue } from "../../m09-loans/index.js";
import { createDisposalRepository } from "../repositories/disposal.repository.js";
import { invalid, lockAssets } from "../access.js";
export class DisposalSubmissionService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger, private readonly approval: ApprovalService) {}
    async save(scope: TransactionScope, body: DisposalCreate, id?: string) {
        if (!scope.ctx.can("disposal.create")) throw new ForbiddenError();
        const repo = createDisposalRepository(scope.tx), current = id ? await repo.lock(scope.ctx, id) : null;
        if (current && (current.pengusul_id !== String(scope.ctx.userId) || current.status !== "PERLU_REVISI")) throw invalid("Hanya pengusul dapat mengajukan ulang usulan Perlu Revisi.");
        if ((body.alasan === "HILANG") !== (body.tindak_lanjut_fisik === "ADMINISTRATIF")) throw invalid("Tindak lanjut administratif khusus usulan Hilang.", "tindak_lanjut_fisik");
        const ids = body.items.map(i => String(i.asset_id)).sort((a, b) => Number(a) - Number(b)), assets = await lockAssets(scope, ids);
        if (assets.length !== ids.length || assets.some(a => a.dihapuskan)) throw invalid("Aset tidak ditemukan atau sudah dihapuskan.", "items");
        const previous = current ? await repo.items(scope.ctx, current.id) : [];
        if (current && (previous.length !== ids.length || previous.some(i => !ids.includes(i.asset_id)))) throw invalid("Revisi mempertahankan daftar aset. Batalkan dan buat usulan baru jika daftar aset berubah.", "items");
        const snapshots = new Map<string, DisposalCandidate>();
        for (const input of body.items) {
            const candidate = await repo.candidate(scope.ctx, scope, String(input.asset_id), this.clock.now(), current?.id, true);
            if (candidate.penghalang.length) throw invalid(`${candidate.kode_barang}: ${candidate.penghalang.join("; ")}.`, "items");
            if (!["RUSAK_BERAT", "HILANG"].includes(candidate.kondisi) && !candidate.rekomendasi_penggantian) throw invalid(`${candidate.kode_barang} belum memenuhi syarat penghapusan.`, "items");
            if (candidate.nilai_perolehan === null) throw invalid(`Lengkapi nilai perolehan ${candidate.kode_barang} pada data aset sebelum mengajukan.`, "items");
            if (body.alasan === "HILANG" ? candidate.kondisi !== "HILANG" : candidate.kondisi === "HILANG") throw invalid("Aset Hilang diajukan terpisah dengan alasan Hilang.", "alasan");
            if (body.alasan === "RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI" && candidate.kondisi !== "RUSAK_BERAT") throw invalid("Alasan Rusak Berat memerlukan kondisi Rusak Berat.", "alasan");
            if (candidate.garansi.length && (!input.konfirmasi_garansi || !input.alasan_garansi.trim())) throw invalid(`${candidate.kode_barang} masih bergaransi. Konfirmasi dan alasan wajib.`, "items.alasan_garansi");
            if (input.loss_session_id && String(input.loss_session_id) !== candidate.loss_session_id) throw invalid("Referensi opname bukan hasil Hilang yang disetujui untuk aset ini.", "loss_session_id");
            if (input.bukti_kehilangan_file_id && !body.lampiran.some(f => f.file_id === input.bukti_kehilangan_file_id && f.jenis === "KEHILANGAN")) throw invalid("Bukti kehilangan harus berasal dari lampiran kehilangan usulan ini.", "bukti_kehilangan_file_id");
            if (candidate.kondisi === "HILANG" && !candidate.loss_session_id) {
                const proof = body.lampiran.find(f => f.file_id === input.bukti_kehilangan_file_id && f.jenis === "KEHILANGAN");
                if (!proof) throw invalid("Aset Hilang memerlukan opname disetujui atau lampiran berita acara kehilangan.", "bukti_kehilangan_file_id");
                const file = await scope.tx.selectFrom("stored_files").select("id").where("id", "=", String(proof.file_id)).where("scan_status", "=", "CLEAN").where("checksum", "is not", null).executeTakeFirst();
                if (!file) throw invalid("Berita acara kehilangan harus terkonfirmasi dan CLEAN.", "bukti_kehilangan_file_id");
            }
            const old = previous.find(p => p.asset_id === String(input.asset_id));
            if (old) { const original = DisposalCandidateSchema.parse(old.snapshot); if (original.nilai_perolehan !== candidate.nilai_perolehan || original.kondisi !== candidate.kondisi || original.room_id !== candidate.room_id) throw invalid("Data aset berubah sejak usulan. Batalkan dan ajukan usulan baru agar snapshot ditinjau ulang.", "items"); snapshots.set(candidate.id, original); }
            else snapshots.set(candidate.id, candidate);
        }
        const total = (await sql<{ total: string }>`SELECT sum(nilai_perolehan)::text AS total FROM assets WHERE id=ANY(${ids}::bigint[])`.execute(scope.tx)).rows[0]!.total;
        const requester = await scope.tx.selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select("r.kode").where("u.id", "=", String(scope.ctx.userId)).executeTakeFirstOrThrow();
        const facts: KamusFakta = { requester_id: scope.ctx.userId, requester_role: requester.kode, requester_has_overdue: await procurementRequesterOverdue(scope, scope.ctx.userId, this.clock.now()), total_value: Number(total), item_count: ids.length, asset_category_id: [...new Set([...snapshots.values()].map(s => Number(s.category_id)))], disposal_reason: body.alasan };
        const route = await this.approval.selectedSnapshot(scope, "PENGHAPUSAN_ASET", facts);
        if (!route) throw invalid("Konfigurasikan aturan aktif Penghapusan Aset yang cocok dengan nilai usulan dan berakhir pada Pimpinan.", "approval_rule");
        const last = route.langkah.at(-1)!;
        const finalRole = last.approver_role_id ? await scope.tx.selectFrom("roles").select("kode").where("id", "=", String(last.approver_role_id)).executeTakeFirst() : await scope.tx.selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select("r.kode").where("u.id", "=", String(last.approver_user_id)).executeTakeFirst();
        if (finalRole?.kode !== "R-03") throw invalid("Level terakhir aturan penghapusan wajib Pimpinan Sekolah.", "approval_rule");
        let disposalId = current?.id;
        if (!disposalId) { const row = await scope.tx.insertInto("asset_disposals").values({ nomor: await new DocumentNumberService(this.clock).next(scope.tx, "HPS"), alasan: body.alasan, justifikasi: body.justifikasi, tindak_lanjut_fisik: body.tindak_lanjut_fisik, status: "MENUNGGU_PERSETUJUAN", total_nilai: total, pengusul_id: String(scope.ctx.userId), created_by: String(scope.ctx.userId), updated_by: String(scope.ctx.userId) }).returning("id").executeTakeFirstOrThrow(); disposalId = row.id; }
        else await scope.tx.updateTable("asset_disposals").set({ alasan: body.alasan, justifikasi: body.justifikasi, tindak_lanjut_fisik: body.tindak_lanjut_fisik, status: "MENUNGGU_PERSETUJUAN", updated_by: String(scope.ctx.userId) }).where("id", "=", disposalId).execute();
        const owner = disposalId;
        await releaseDisposalAttachments(scope, owner, body.lampiran.map(f => String(f.file_id)));
        await scope.tx.deleteFrom("asset_disposal_files").where("disposal_id", "=", owner).execute();
        await claimDisposalFiles(scope, "DISPOSAL_ATTACHMENT", body.lampiran.map(f => f.file_id), owner, false);
        if (body.lampiran.length) await scope.tx.insertInto("asset_disposal_files").values(body.lampiran.map(f => ({ disposal_id: owner, file_id: String(f.file_id), nama_berkas: f.nama_berkas, jenis: f.jenis }))).execute();
        for (const input of body.items) {
            const values = { bukti_kehilangan_file_id: input.bukti_kehilangan_file_id ? String(input.bukti_kehilangan_file_id) : null, konfirmasi_garansi: input.konfirmasi_garansi, alasan_garansi: input.alasan_garansi, disetujui: null, keterangan: null };
            if (current) await scope.tx.updateTable("asset_disposal_items").set(values).where("disposal_id", "=", owner).where("asset_id", "=", String(input.asset_id)).execute();
            else await scope.tx.insertInto("asset_disposal_items").values({ ...values, disposal_id: owner, asset_id: String(input.asset_id), snapshot: JSON.stringify(snapshots.get(String(input.asset_id))!) }).execute();
            await scope.tx.insertInto("asset_disposal_claims").values({ asset_id: String(input.asset_id), disposal_id: owner }).onConflict(c => c.column("asset_id").doNothing()).execute();
        }
        const instance = await this.approval.createInstance(scope, { jenis: "PENGHAPUSAN_ASET", referensiId: Number(owner), pemohonId: scope.ctx.userId, fakta: facts });
        // Selection may have changed concurrently; validate the actual frozen rule too.
        const frozen = await scope.tx.selectFrom("approval_instances").select("rule_snapshot").where("id", "=", String(instance.instanceId)).executeTakeFirstOrThrow();
        if ((frozen.rule_snapshot as { rule_id: number; versi: number }).rule_id !== route.rule_id || (frozen.rule_snapshot as { versi: number }).versi !== route.versi) throw invalid("Aturan berubah selama pengajuan. Ulangi dengan aturan terbaru.", "approval_rule");
        await scope.tx.updateTable("asset_disposals").set({ approval_instance_id: String(instance.instanceId) }).where("id", "=", owner).execute();
        await this.audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_PROPOSED", entitas: "asset_disposals", entitasId: owner, nilaiSesudah: { nomor_instance: instance.instanceId, asset_ids: ids, total_nilai: total, alasan: body.alasan, revisi: !!current } });
        await publish(scope, { name: "AssetDisposalProposed", aggregateType: "asset_disposal", aggregateId: owner, payload: { disposal_id: Number(owner), instance_id: instance.instanceId, langkah_aktif: instance.langkahAktif, pengusul_id: scope.ctx.userId, n: ids.length } });
        return owner;
    }
    async cancel(scope: TransactionScope, id: string, alasan: string) {
        if (!scope.ctx.can("disposal.create")) throw new ForbiddenError();
        const row = await createDisposalRepository(scope.tx).lock(scope.ctx, id);
        if (row.pengusul_id !== String(scope.ctx.userId) && scope.ctx.roleCode !== "R-01") throw new ForbiddenError();
        if (["SELESAI", "DIBATALKAN", "DITOLAK"].includes(row.status)) throw invalid("Usulan sudah ditutup.");
        await this.approval.tutupKarenaObjek(scope, "PENGHAPUSAN_ASET", Number(id));
        await scope.tx.deleteFrom("asset_disposal_claims").where("disposal_id", "=", id).execute();
        await scope.tx.updateTable("asset_disposals").set({ status: "DIBATALKAN", catatan: alasan, updated_by: String(scope.ctx.userId) }).where("id", "=", id).execute();
        await this.audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_CANCELLED", entitas: "asset_disposals", entitasId: id, nilaiSesudah: { alasan } });
        await publish(scope, { name: "AssetDisposalDecided", aggregateType: "asset_disposal", aggregateId: id, payload: { disposal_id: Number(id), pengusul_id: Number(row.pengusul_id), status: "DIBATALKAN" } });
    }
}
