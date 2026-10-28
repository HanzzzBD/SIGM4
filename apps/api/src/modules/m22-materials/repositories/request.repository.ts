import { sql } from "kysely";
import type { MaterialRequestQuery } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { allMaterialRequests } from "../access.js";
export class MaterialRequestRepository extends BaseRepository {
    constructor(executor: QueryExecutor) { super(executor); }
    private visible(ctx: AuthContext) { return this.query(ctx).selectFrom("material_requests as r").$if(!allMaterialRequests(ctx), q => q.where("r.pemohon_id", "=", String(ctx.userId))); }
    async lock(ctx: AuthContext, id: string, decision = false) {
        const query = decision ? this.query(ctx).selectFrom("material_requests as r") : this.visible(ctx);
        const row = await query.selectAll("r").where("r.id", "=", id).forUpdate().executeTakeFirst(); if (!row) throw new NotFoundError("Permintaan bahan tidak ditemukan."); return row;
    }
    async read(ctx: AuthContext, id: string, approvalContext = false) {
        const query = approvalContext ? this.query(ctx).selectFrom("material_requests as r") : this.visible(ctx);
        return query.innerJoin("users as u", "u.id", "r.pemohon_id").selectAll("r").select("u.nama as pemohon").where("r.id", "=", id).executeTakeFirst();
    }
    async items(ctx: AuthContext, id: string, revision: number) {
        return this.query(ctx).selectFrom("material_request_items as i").leftJoin("material_balances as b", join => join.onRef("b.material_id", "=", "i.material_id").onRef("b.room_id", "=", "i.room_id")).selectAll("i").select(sql<number>`coalesce(b.saldo,0)::int`.as("saldo_terkini")).where("i.material_request_id", "=", id).where("i.revision", "=", revision).orderBy("i.id").execute();
    }
    async list(ctx: AuthContext, f: MaterialRequestQuery) {
        const closed = ["DITOLAK", "DISERAHKAN", "DIBATALKAN", "DITUTUP"] as const;
        const q = this.visible(ctx).$if(f.tab === "AKTIF", b => b.where("r.status", "not in", closed)).$if(f.tab === "SELESAI", b => b.where("r.status", "in", closed)).$if(f.status !== undefined, b => b.where("r.status", "=", f.status!)).$if(f.saya === "true", b => b.where("r.pemohon_id", "=", String(ctx.userId))).$if(!!f.q, b => b.where(e => e.or([e("r.nomor", "ilike", `%${f.q!}%`), e("r.keperluan", "ilike", `%${f.q!}%`)])));
        const count = await q.select(e => e.fn.countAll<string>().as("n")).executeTakeFirstOrThrow(), rows = await q.select("r.id").orderBy("r.id", "desc").limit(f.per_page).offset((f.page - 1) * f.per_page).execute();
        return { ids: rows.map(r => r.id), meta: { page: f.page, per_page: f.per_page, total: Number(count.n), total_pages: Math.max(1, Math.ceil(Number(count.n) / f.per_page)) } };
    }
    async cycles(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("material_request_cycles").selectAll().where("request_id", "=", id).orderBy("revision").execute(); }
    async issues(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("material_issues as i").innerJoin("users as u", "u.id", "i.created_by").selectAll("i").select(["u.nama as pelaksana", sql<string>`to_char(i.tanggal_serah,'YYYY-MM-DD')`.as("tanggal_serah")]).where("i.request_id", "=", id).orderBy("i.id").execute(); }
    async issuedItems(ctx: AuthContext, id: string) { return this.query(ctx).selectFrom("material_issue_items").selectAll().where("issue_id", "=", id).orderBy("item_id").execute(); }
}
export const createMaterialRequestRepository = (db: QueryExecutor) => defineRepository(new MaterialRequestRepository(db));
