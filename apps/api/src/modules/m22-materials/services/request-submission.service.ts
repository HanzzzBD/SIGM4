import type { MaterialRequestBody } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { ApprovalService, KamusFakta } from "../../m10-approval/index.js";
import { materialRequestThresholds } from "../../m20-settings/index.js";
import { materialStorageRoom } from "../../m03-locations/index.js";
import { blokirPemohon } from "../../m07-reservation-room/index.js";
import { procurementRequesterOverdue } from "../../m09-loans/index.js";
import { createMaterialRequestRepository } from "../repositories/request.repository.js";
import { materialInvalid, studentMaterialScope } from "../access.js";
export class MaterialRequestSubmissionService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger, private readonly approval: ApprovalService) {}
    async submit(scope: TransactionScope, input: MaterialRequestBody, id?: string) {
        if (!scope.ctx.can("material.request")) throw new ForbiddenError();
        const repo = createMaterialRequestRepository(scope.tx), current = id ? await repo.lock(scope.ctx, id) : null;
        if (current && (current.pemohon_id !== String(scope.ctx.userId) || current.status !== "PERLU_REVISI")) throw materialInvalid("Revisi hanya oleh pemohon pada status Perlu Revisi, sebelum penyerahan.");
        const blocking = await blokirPemohon.periksa(scope, scope.ctx.userId); if (blocking.length) throw materialInvalid(blocking.map(b => b.keterangan).join(" "), "pemohon");
        const ids = [...new Set(input.items.map(i => String(i.material_id)))].sort((a, b) => Number(a) - Number(b));
        const student = studentMaterialScope(scope.ctx);
        const materials = await scope.tx.selectFrom("materials as m").innerJoin("material_units as u", "u.id", "m.satuan_id").select(["m.id", "m.nama", "m.status", "m.satuan_id", "m.material_category_id", "m.room_id_default", "m.boleh_diminta_siswa", "u.simbol"]).where("m.id", "in", ids).orderBy("m.id").forUpdate("m").execute();
        if (materials.length !== ids.length || materials.some(m => m.status !== "AKTIF")) throw materialInvalid("Pilih jenis bahan aktif yang masih tersedia.", "items");
        // BR-091a: Siswa hanya bahan bertanda, diambil dari lokasi penyimpanan bawaannya.
        if (student && (materials.some(m => !m.boleh_diminta_siswa) || input.items.some(i => String(i.room_id) !== materials.find(m => m.id === String(i.material_id))?.room_id_default))) throw materialInvalid("Pilih bahan yang tersedia untuk siswa dari katalog.", "items");
        const thresholds = await materialRequestThresholds(scope, ids); if (!student && thresholds.default_qty === null) throw materialInvalid("Administrator harus mengisi ambang permintaan bahan sebelum pengajuan.", "konfigurasi");
        const quantities = new Map<string, number>(); for (const i of input.items) quantities.set(String(i.material_id), (quantities.get(String(i.material_id)) ?? 0) + i.jumlah);
        const thresholdSnapshot = ids.map(material_id => ({ material_id, jumlah: quantities.get(material_id)!, batas: thresholds.overrides.get(material_id) ?? thresholds.default_qty, khusus: thresholds.overrides.has(material_id) }));
        // BR-086a: permintaan Siswa tidak pernah melewati approval engine; Petugas menilainya saat penyerahan.
        const needsApproval = !student && thresholdSnapshot.some(i => i.batas !== null && i.jumlah > i.batas), revision = current ? current.revision + 1 : 1, rows = [];
        for (const i of input.items) {
            const m = materials.find(m => m.id === String(i.material_id))!;
            const room = await materialStorageRoom(scope, i.room_id);
            const balance = await scope.tx.selectFrom("material_balances").select("saldo").where("material_id", "=", m.id).where("room_id", "=", room.id).executeTakeFirst();
            if ((balance?.saldo ?? 0) < i.jumlah) throw materialInvalid(student ? `${m.nama}: stok tidak mencukupi untuk jumlah ini. Kurangi jumlah atau tanyakan ke Petugas.` : `${m.nama}: saldo tersedia di lokasi ini ${balance?.saldo ?? 0}, kurang dari ${i.jumlah}. Pilih lokasi lain atau kurangi jumlah.`, "items.jumlah");
            const location = await scope.tx.selectFrom("rooms").select("nama").where("id", "=", room.id).executeTakeFirstOrThrow();
            rows.push({ material_id: m.id, room_id: room.id, satuan_id: m.satuan_id, revision, snapshot: JSON.stringify({ nama: m.nama, satuan: m.simbol, lokasi: location.nama, category_id: m.material_category_id }), jumlah_diminta: i.jumlah, jumlah_disetujui: needsApproval ? null : i.jumlah });
        }
        const status = needsApproval ? "MENUNGGU_PERSETUJUAN" as const : "DISETUJUI" as const;
        let requestId = current?.id;
        if (current) await scope.tx.updateTable("material_requests").set({ keperluan: input.keperluan, status, revision, approval_instance_id: null, updated_at: this.clock.now(), updated_by: String(scope.ctx.userId) }).where("id", "=", current.id).execute();
        else { const r = await scope.tx.insertInto("material_requests").values({ nomor: await new DocumentNumberService(this.clock).next(scope.tx, "PMB"), pemohon_id: String(scope.ctx.userId), keperluan: input.keperluan, status, created_at: this.clock.now(), updated_at: this.clock.now(), created_by: String(scope.ctx.userId), updated_by: String(scope.ctx.userId) }).returning("id").executeTakeFirstOrThrow(); requestId = r.id; }
        await scope.tx.insertInto("material_request_items").values(rows.map(i => ({ ...i, material_request_id: requestId! }))).execute();
        let instanceId: string | null = null;
        if (needsApproval) {
            const role = await scope.tx.selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select("r.kode").where("u.id", "=", String(scope.ctx.userId)).executeTakeFirstOrThrow();
            const facts: KamusFakta = { requester_id: scope.ctx.userId, requester_role: role.kode, requester_has_overdue: await procurementRequesterOverdue(scope, scope.ctx.userId, this.clock.now()), material_qty_total: input.items.reduce((n, i) => n + i.jumlah, 0), material_category_id: [...new Set(materials.map(m => Number(m.material_category_id)))], item_count: ids.length };
            const instance = await this.approval.createInstance(scope, { jenis: "PERMINTAAN_BAHAN", referensiId: Number(requestId), pemohonId: scope.ctx.userId, fakta: facts }); instanceId = String(instance.instanceId);
            await scope.tx.updateTable("material_requests").set({ approval_instance_id: instanceId }).where("id", "=", requestId!).execute();
        }
        await scope.tx.updateTable("material_requests").set({ approved_at: needsApproval ? null : this.clock.now() }).where("id", "=", requestId!).execute();
        await scope.tx.insertInto("material_request_cycles").values({ request_id: requestId!, revision, approval_instance_id: instanceId, threshold_snapshot: JSON.stringify(thresholdSnapshot), items_snapshot: JSON.stringify(rows), created_at: this.clock.now() }).execute();
        await this.audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_REQUEST_SUBMITTED", entitas: "material_requests", entitasId: requestId!, nilaiSesudah: { revision, status, items: input.items, thresholds: thresholdSnapshot, approval_instance_id: instanceId } });
        if (!needsApproval) {
            await this.audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_REQUEST_APPROVED", entitas: "material_requests", entitasId: requestId!, nilaiSesudah: { otomatis: true, revision } });
            await publish(scope, { name: "MaterialRequestReady", aggregateType: "material_request", aggregateId: requestId!, payload: { request_id: Number(requestId), pemohon_id: scope.ctx.userId, revision } });
        }
        return requestId!;
    }
    async cancel(scope: TransactionScope, id: string, alasan: string) {
        if (!scope.ctx.can("material.request")) throw new ForbiddenError();
        const row = await createMaterialRequestRepository(scope.tx).lock(scope.ctx, id);
        if (row.pemohon_id !== String(scope.ctx.userId) && scope.ctx.roleCode !== "R-01") throw new ForbiddenError();
        if (!["MENUNGGU_PERSETUJUAN", "PERLU_REVISI", "DISETUJUI", "DISETUJUI_SEBAGIAN"].includes(row.status)) throw materialInvalid("Pembatalan hanya tersedia sebelum ada penyerahan.");
        await this.approval.tutupKarenaObjek(scope, "PERMINTAAN_BAHAN", Number(id));
        await scope.tx.updateTable("material_requests").set({ status: "DIBATALKAN", catatan_penutupan: alasan, updated_at: this.clock.now(), updated_by: String(scope.ctx.userId) }).where("id", "=", id).execute();
        await this.audit.write(scope, { modul: "m22-materials", aksi: "MATERIAL_REQUEST_CANCELLED", entitas: "material_requests", entitasId: id, nilaiSesudah: { alasan } });
    }
}
