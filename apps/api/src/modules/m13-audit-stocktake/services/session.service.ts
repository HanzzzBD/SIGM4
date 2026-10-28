import { sql } from "kysely";
import type { StocktakeCreate } from "@sigm4/schemas";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { publish } from "../../../shared/events/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { invalid, lockSession } from "../access.js";
import { createStocktakeRepository } from "../repositories/stocktake.repository.js";
import { MaterialStocktakeService } from "./material-stocktake.service.js";
export class StocktakeSessionService {
    constructor(private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async create(scope: TransactionScope, input: StocktakeCreate) {
        if(input.domain==="BAHAN")return new MaterialStocktakeService(this.clock,this.audit).create(scope,input);
        await sql`select pg_advisory_xact_lock(13,1)`.execute(scope.tx);
        const people = await scope.tx.selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select("u.id").where("u.id", "in", input.pelaksana_ids.map(String)).where("u.status", "=", "AKTIF").where("r.kode", "in", ["R-01", "R-02"]).orderBy("u.id").forUpdate("u").execute();
        if (people.length !== input.pelaksana_ids.length) throw invalid("Pelaksana harus Administrator/Petugas aktif.", "pelaksana_ids");
        const c = input.cakupan;
        const assets = await scope.tx.selectFrom("assets as a").innerJoin("rooms as r", "r.id", "a.room_id").innerJoin("areas as ar", "ar.id", "r.area_id").select(["a.id", "a.nama", "a.kode_barang", "a.uuid", "a.room_id", "a.kondisi", "a.status", "r.nama as lokasi"])
            .where("a.dihapuskan", "=", false)
            .$if(c.jenis === "GEDUNG", q => q.where("ar.building_id", "=", String(c.id)))
            .$if(c.jenis === "RUANGAN", q => q.where("a.room_id", "=", String(c.id)))
            .$if(c.jenis === "KATEGORI", q => q.where("a.category_id", "=", String(c.id)))
            .$if(c.category_id !== undefined, q => q.where("a.category_id", "=", String(c.category_id)))
            .orderBy("a.id").forUpdate("a").execute();
        if (!assets.length) throw invalid("Cakupan menghasilkan 0 aset. Pilih cakupan lain.", "cakupan");
        const occupied = await scope.tx.selectFrom("audit_active_assets").select("asset_id").where("asset_id", "in", assets.map(a => a.id)).executeTakeFirst();
        if (occupied) throw invalid("Aset dalam cakupan sudah berada pada sesi opname aktif.", "cakupan");
        const session = await scope.tx.insertInto("audit_sessions").values({ nomor: await new DocumentNumberService(this.clock).next(scope.tx, "OPN"), nama: input.nama, periode_mulai: input.periode_mulai, periode_selesai: input.periode_selesai, cakupan: JSON.stringify(c), created_by: pelakuId(scope.ctx), updated_by: pelakuId(scope.ctx) }).returning("id").executeTakeFirstOrThrow();
        await scope.tx.insertInto("audit_session_assignees").values(people.map(p => ({ session_id: session.id, user_id: p.id }))).execute();
        const physicalRooms = await scope.tx.selectFrom("rooms as r").innerJoin("areas as ar", "ar.id", "r.area_id").select(["r.id", "r.nama"]).where("r.status", "=", "AKTIF")
            .$if(c.jenis === "GEDUNG", q => q.where("ar.building_id", "=", String(c.id)))
            .$if(c.jenis === "RUANGAN", q => q.where("r.id", "=", String(c.id))).orderBy("r.id").execute();
        const rooms = new Map([...physicalRooms.map(r => [r.id, r.nama] as const), ...assets.map(a => [a.room_id, a.lokasi] as const)]);
        await scope.tx.insertInto("audit_session_rooms").values([...rooms].map(([room_id, nama]) => ({ session_id: session.id, room_id, nama }))).execute();
        for (let offset = 0; offset < assets.length; offset += 500) {
            const batch = assets.slice(offset, offset + 500);
            await scope.tx.insertInto("audit_items").values(batch.map(a => ({ session_id: session.id, asset_id: a.id, nama: a.nama, kode_barang: a.kode_barang, uuid: a.uuid, room_id_sistem: a.room_id, lokasi_sistem: a.lokasi, kondisi_sistem: a.kondisi, status_sistem: a.status }))).execute();
            await scope.tx.insertInto("audit_active_assets").values(batch.map(a => ({ session_id: session.id, asset_id: a.id }))).execute();
        }
        await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_SESSION_CREATED", entitas: "audit_sessions", entitasId: session.id, nilaiSesudah: { ...input, target: assets.length } });
        await publish(scope, { name: "AuditSessionCreated", aggregateType: "audit_session", aggregateId: session.id, payload: { session_id: Number(session.id), nama: input.nama, n: assets.length, pelaksana_ids: input.pelaksana_ids } });
        return createStocktakeRepository(scope.tx).detail(scope.ctx, session.id);
    }
    async cancel(scope: TransactionScope, id: string, alasan: string) {
        const row = await lockSession(scope, id);
        if (scope.ctx.roleCode !== "R-01") throw invalid("Hanya Administrator dapat membatalkan sesi.");
        if (["SELESAI", "DIBATALKAN"].includes(row.status)) throw invalid("Sesi sudah tertutup.");
        await scope.tx.updateTable("audit_sessions").set({ status: "DIBATALKAN", catatan_keputusan: alasan, updated_by: pelakuId(scope.ctx) }).where("id", "=", id).execute();
        await scope.tx.deleteFrom("audit_active_assets").where("session_id", "=", id).execute();
        await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_SESSION_CANCELLED", entitas: "audit_sessions", entitasId: id, nilaiSesudah: { alasan } });
    }
}
