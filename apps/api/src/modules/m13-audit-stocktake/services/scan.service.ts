import { createHash } from "node:crypto";
import type { StocktakeScan, StocktakeFinding } from "@sigm4/schemas";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { attachStocktakePhotos } from "../../m06-documents/index.js";
import { invalid, lockSession, requireAssignee, requireRunning } from "../access.js";

import { MaterialStocktakeService } from "./material-stocktake.service.js";
export class StocktakeScanService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async record(scope: TransactionScope, id: string, input: StocktakeScan | StocktakeFinding) {
        const session = await lockSession(scope, id);
        if(session.domain!=="ASET")throw invalid("Pemindaian Aset hanya untuk sesi domain Aset.");
        await requireAssignee(scope, id);
        const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
        const prior = await scope.tx.selectFrom("audit_scans").selectAll().where("session_id", "=", id).where("client_scan_id", "=", input.client_scan_id).executeTakeFirst();
        if (prior) {
            if (prior.payload_hash !== hash) throw invalid("ID scan sudah dipakai untuk hasil berbeda.", "client_scan_id");
            return prior.response as { item_id: string; duplicate: boolean; hasil: string };
        }
        requireRunning(session, true);
        const location = await scope.tx.selectFrom("audit_session_rooms").select("completed_at").where("session_id", "=", id).where("room_id", "=", String(input.room_id)).executeTakeFirst();
        if (!location) throw invalid("Lokasi pemeriksaan di luar cakupan sesi.", "room_id");
        if (location.completed_at) throw invalid("Lokasi sudah selesai diperiksa.", "room_id");
        if (input.kondisi === "HILANG") throw invalid("Aset yang ditemukan tidak boleh dicatat berkondisi Hilang.", "kondisi");
        let result: { item_id: string; duplicate: boolean; hasil: string };
        if ("asset_id" in input) {
            const item = await scope.tx.selectFrom("audit_items").selectAll().where("session_id", "=", id).where("asset_id", "=", String(input.asset_id)).forUpdate().executeTakeFirst();
            if (!item) throw new NotFoundError("Aset tidak termasuk snapshot sesi. Aset terdaftar di luar cakupan tidak menjadi temuan baru.");
            if (item.diperiksa_pada) result = { item_id: item.id, duplicate: true, hasil: item.hasil };
            else {
                const wrongRoom = item.room_id_sistem !== String(input.room_id), wrongCondition = item.kondisi_sistem !== input.kondisi;
                const hasil = wrongRoom ? "SALAH_LOKASI" : wrongCondition ? "PERBEDAAN_KONDISI" : "DITEMUKAN";
                await scope.tx.updateTable("audit_items").set({ room_id_aktual: String(input.room_id), kondisi_aktual: input.kondisi, salah_lokasi: wrongRoom, beda_kondisi: wrongCondition, hasil, catatan: input.catatan, diperiksa_oleh: scope.ctx.userId, diperiksa_pada: this.clock.now() }).where("id", "=", item.id).execute();
                const files = await attachStocktakePhotos(scope, input.foto_file_ids, id);
                if (files.length) await scope.tx.insertInto("audit_photos").values(files.map(file_id => ({ session_id: id, item_id: item.id, finding_id: null, file_id }))).execute();
                result = { item_id: item.id, duplicate: false, hasil };
                await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_ITEM_SCANNED", entitas: "audit_items", entitasId: item.id, nilaiSesudah: { client_scan_id: input.client_scan_id, hasil, room_id: input.room_id, kondisi: input.kondisi } });
            }
        } else {
            if (!await scope.tx.selectFrom("asset_categories").select("id").where("id", "=", String(input.category_id)).executeTakeFirst()) throw invalid("Kategori tidak ditemukan.", "category_id");
            const finding = await scope.tx.insertInto("audit_new_findings").values({ session_id: id, deskripsi: input.deskripsi, category_id: String(input.category_id), room_id: String(input.room_id), kondisi: input.kondisi, ditemukan_oleh: String(scope.ctx.userId), ditemukan_pada: this.clock.now() }).returning("id").executeTakeFirstOrThrow();
            const files = await attachStocktakePhotos(scope, input.foto_file_ids, id);
            if (files.length) await scope.tx.insertInto("audit_photos").values(files.map(file_id => ({ session_id: id, item_id: null, finding_id: finding.id, file_id }))).execute();
            result = { item_id: finding.id, duplicate: false, hasil: "TEMUAN_BARU" };
            await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_ITEM_SCANNED", entitas: "audit_new_findings", entitasId: finding.id, nilaiSesudah: input });
        }
        await scope.tx.insertInto("audit_scans").values({ session_id: id, client_scan_id: input.client_scan_id, payload_hash: hash, response: JSON.stringify(result) }).execute();
        return result;
    }
    async completeLocation(scope: TransactionScope, id: string, room: number) {
        const session=await lockSession(scope,id);requireRunning(session,true);await requireAssignee(scope,id);
        if(session.domain==="BAHAN")await new MaterialStocktakeService(this.clock,this.audit).ready(scope,id,false,room);
        const row = await scope.tx.updateTable("audit_session_rooms").set({ completed_at: this.clock.now(), completed_by: scope.ctx.userId }).where("session_id", "=", id).where("room_id", "=", String(room)).returning("room_id").executeTakeFirst();
        if (!row) throw invalid("Lokasi tidak termasuk sesi.", "room_id");
        await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_LOCATION_COMPLETED", entitas: "audit_sessions", entitasId: id, nilaiSesudah: { room_id: room } });
    }
    async removeFailedPhoto(scope: TransactionScope, id: string, fileId: string, alasan: string) {
        requireRunning(await lockSession(scope, id));
        const photo = await scope.tx.selectFrom("audit_photos as p").innerJoin("stored_files as f", "f.id", "p.file_id").select(["p.id", "f.checksum", "f.scan_status"]).where("p.session_id", "=", id).where("p.file_id", "=", fileId).forUpdate("f").executeTakeFirst();
        if (!photo) throw new NotFoundError("Foto opname tidak ditemukan.");
        if (photo.checksum && photo.scan_status === "CLEAN") throw invalid("Foto yang telah terverifikasi tetap menjadi bukti pemeriksaan.", "file_id");
        await scope.tx.deleteFrom("audit_photos").where("id", "=", photo.id).execute();
        await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_PHOTO_WITHDRAWN", entitas: "audit_sessions", entitasId: id, nilaiSesudah: { file_id: fileId, alasan, status: photo.scan_status } });
    }
}
