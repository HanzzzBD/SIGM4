import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
const system = (ctx: AuthContext) => { if (!isSystemAuthContext(ctx)) throw new ForbiddenError(); };
class ExportRepository extends BaseRepository {
    constructor(db: QueryExecutor) { super(db); }
    async create(ctx: AuthContext, input: { jenis: string; judul: string; format: "XLSX" | "PDF"; filter: unknown; accessHash: string; key: string; now: Date }) {
        if (isSystemAuthContext(ctx)) throw new ForbiddenError();
        return this.query(ctx).insertInto("report_exports").values({ requester_id: ctx.userId, jenis: input.jenis, judul: input.judul, format: input.format, filter: JSON.stringify(input.filter), access_hash: input.accessHash,
            scope_hash: null, object_key: input.key, file_id: null, jumlah_baris: null, pesan_galat: null, selesai_pada: null, berlaku_sampai: null, created_at: input.now, updated_at: input.now, object_removed_at: null }).returningAll().executeTakeFirstOrThrow();
    }
    async get(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("report_exports").selectAll().where("id", "=", id).$if(!isSystemAuthContext(ctx), q => q.where("requester_id", "=", String(ctx.userId))).executeTakeFirst(); }
    async list(ctx: AuthContext, jenis?: string) { if (isSystemAuthContext(ctx)) throw new ForbiddenError(); return this.query(ctx).selectFrom("report_exports").selectAll().where("requester_id", "=", String(ctx.userId)).$if(jenis !== undefined, q => q.where("jenis", "=", jenis!)).orderBy("created_at", "desc").orderBy("id", "desc").limit(25).execute(); }
    async lock(ctx: AuthContext, id: string) { system(ctx); await sql`select pg_advisory_lock(hashtextextended(${id},60608))`.execute(this.query(ctx)); }
    async unlock(ctx: AuthContext, id: string) { system(ctx); await sql`select pg_advisory_unlock(hashtextextended(${id},60608))`.execute(this.query(ctx)); }
    async start(ctx: AuthContext, id: string, now: Date) { system(ctx); const r = await this.query(ctx).updateTable("report_exports").set({ status: "BERJALAN", updated_at: now }).where("id", "=", id).where("status", "in", ["MENUNGGU", "BERJALAN"]).executeTakeFirst(); return r.numUpdatedRows > 0n; }
    async finish(ctx: AuthContext, id: string, input: { fileId: string; n: number; hash: string; now: Date }) {
        system(ctx); const r = await this.query(ctx).updateTable("report_exports").set({ status: "SIAP", file_id: input.fileId, jumlah_baris: input.n, scope_hash: input.hash, selesai_pada: input.now, berlaku_sampai: new Date(input.now.getTime() + 86400000), updated_at: input.now }).where("id", "=", id).where("status", "=", "BERJALAN").executeTakeFirst();
        if (r.numUpdatedRows !== 1n) throw new ForbiddenError();
    }
    async cancelChangedAccess(ctx: AuthContext, hash: string, now: Date) {
        if (isSystemAuthContext(ctx)) throw new ForbiddenError();
        await this.query(ctx).updateTable("report_exports").set({ status: "DIBATALKAN", jumlah_baris: null, pesan_galat: "Izin berubah. Buat ekspor ulang.", selesai_pada: now, updated_at: now }).where("requester_id", "=", String(ctx.userId)).where("access_hash", "!=", hash).where("status", "in", ["MENUNGGU", "BERJALAN", "SIAP"]).execute();
    }
    async fail(ctx: AuthContext, id: string, status: "GAGAL" | "DIBATALKAN", message: string, now: Date) {
        await this.query(ctx).updateTable("report_exports").set({ status, jumlah_baris: null, pesan_galat: message, selesai_pada: now, updated_at: now }).where("id", "=", id).$if(!isSystemAuthContext(ctx), q => q.where("requester_id", "=", String(ctx.userId))).where("status", "in", ["MENUNGGU", "BERJALAN", "SIAP"]).execute();
    }
    async cleanupCandidates(ctx: AuthContext, now: Date) { system(ctx); return this.query(ctx).selectFrom("report_exports").selectAll().where("object_removed_at", "is", null).where(e => e.or([e("status", "in", ["GAGAL", "DIBATALKAN", "KEDALUWARSA"]), e.and([e("status", "=", "SIAP"), e("berlaku_sampai", "<=", now)])])).orderBy("id").limit(100).execute(); }
    async cleaned(ctx: AuthContext, id: string, now: Date) { system(ctx); await this.query(ctx).updateTable("report_exports").set({ status: sql`case when status='SIAP' then 'KEDALUWARSA' else status end`, file_id: null, object_removed_at: now, updated_at: now }).where("id", "=", id).execute(); }
}
export const exportRepository = (db: QueryExecutor) => defineRepository(new ExportRepository(db));
