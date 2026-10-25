import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { StocktakeSessionSchema, StocktakeItemSchema, StocktakeNewFindingSchema } from "@sigm4/schemas";
import { createMaterialStocktakeRepository } from "./material-stocktake.repository.js";
import { dateColumn } from "../access.js";

export class StocktakeRepository extends BaseRepository {
    constructor(executor: QueryExecutor) { super(executor); }
    private visible(ctx: AuthContext) {
        const all = ["audit.view", "audit.manage", "audit.approve"].some(p => ctx.can(p) && ctx.scopeOf(p) === "all");
        return this.query(ctx).selectFrom("audit_sessions as s").$if(!all, q => q.where(eb => eb.or([eb("s.created_by", "=", String(ctx.userId)), eb.exists(eb.selectFrom("audit_session_assignees as p").select("p.user_id").whereRef("p.session_id", "=", "s.id").where("p.user_id", "=", String(ctx.userId)))])));
    }
    async detail(ctx: AuthContext, id: string) {
        const row = await this.visible(ctx).selectAll("s").select([dateColumn("s.periode_mulai").as("periode_mulai"), dateColumn("s.periode_selesai").as("periode_selesai")]).where("s.id", "=", id).executeTakeFirst();
        if (!row) throw new NotFoundError("Sesi opname tidak ditemukan.");
        const [assignees, rooms, counts, findings, photos] = await Promise.all([
            this.query(ctx).selectFrom("audit_session_assignees as p").innerJoin("users as u", "u.id", "p.user_id").select(["u.id", "u.nama"]).where("p.session_id", "=", id).orderBy("u.nama").execute(),
            this.query(ctx).selectFrom("audit_session_rooms as r").select(["r.room_id as id", "r.nama", sql<boolean>`r.completed_at is not null`.as("selesai"), sql<string>`(select count(*) from audit_items i where i.session_id=r.session_id and i.room_id_sistem=r.room_id)`.as("target"), sql<string>`(select count(*) from audit_items i where i.session_id=r.session_id and i.room_id_sistem=r.room_id and i.hasil not in ('BELUM_DIPERIKSA','TIDAK_DITEMUKAN'))`.as("diperiksa")]).where("r.session_id", "=", id).orderBy("r.nama").execute(),
            this.query(ctx).selectFrom("audit_items").select([sql<string>`count(*)`.as("target"), sql<string>`count(*) filter(where hasil not in ('BELUM_DIPERIKSA','TIDAK_DITEMUKAN'))`.as("diperiksa"), sql<string>`count(*) filter(where hasil in ('SALAH_LOKASI','PERBEDAAN_KONDISI','TIDAK_DITEMUKAN'))`.as("selisih")]).where("session_id", "=", id).executeTakeFirstOrThrow(),
            this.query(ctx).selectFrom("audit_new_findings").select([sql<string>`count(*)`.as("n"), sql<string>`count(*) filter(where pendaftaran is null)`.as("pending")]).where("session_id", "=", id).executeTakeFirstOrThrow(),
            this.query(ctx).selectFrom("audit_photos as p").innerJoin("stored_files as f", "f.id", "p.file_id").select(eb => eb.fn.countAll<string>().as("n")).where("p.session_id", "=", id).where(eb => eb.or([eb("f.checksum", "is", null), eb("f.scan_status", "!=", "CLEAN")])).executeTakeFirstOrThrow(),
        ]);
        const pending = await this.query(ctx).selectFrom("audit_items").select(eb => eb.fn.countAll<string>().as("n")).where("session_id", "=", id).where("hasil", "in", ["SALAH_LOKASI", "PERBEDAAN_KONDISI", "TIDAK_DITEMUKAN"]).where(eb => eb.or([eb("keterangan", "is", null), eb("tindakan", "is", null)])).executeTakeFirstOrThrow();
        const material=row.domain==="BAHAN"?await createMaterialStocktakeRepository(this.query(ctx)).summary(ctx,id,row.status==="SELESAI"):null;
        return StocktakeSessionSchema.parse({ ...row, finalized_at: row.finalized_at?.toISOString() ?? null, disetujui_pada: row.disetujui_pada?.toISOString() ?? null, ...Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, Number(n)])), temuan_baru: Number(findings.n), belum_dilengkapi: Number(pending.n), temuan_belum_dilengkapi: Number(findings.pending), foto_tertunda: Number(photos.n), ...(material?{target:material.target,diperiksa:material.diperiksa,selisih:material.selisih,belum_dilengkapi:material.belum_dilengkapi}:{}), pelaksana: assignees, lokasi: rooms.map(r => ({ ...r, target:material?.rooms.get(r.id)?.target??Number(r.target),diperiksa:material?.rooms.get(r.id)?.diperiksa??Number(r.diperiksa) })) });
    }
    async list(ctx: AuthContext, page: number, size: number, status?: string, mine = false) {
        const q = this.visible(ctx).$if(status !== undefined, q => q.where("s.status", "=", status as "BERJALAN"))
            .$if(mine, q => q.where(eb => eb.exists(eb.selectFrom("audit_session_assignees as p").select("p.user_id").whereRef("p.session_id", "=", "s.id").where("p.user_id", "=", String(ctx.userId)))));
        const count = await q.select(eb => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
        const rows = await q.select("s.id").orderBy("s.id", "desc").limit(size).offset((page - 1) * size).execute();
        const data = []; for (const row of rows) data.push(await this.detail(ctx, row.id));
        return { data, meta: meta(page, size, count.n) };
    }
    async items(ctx: AuthContext, id: string, page: number, size: number, room?: number, differences = false, asset?: string) {
        await this.detail(ctx, id);
        const q = this.query(ctx).selectFrom("audit_items as i").innerJoin("assets as a", "a.id", "i.asset_id").innerJoin("rooms as current_room", "current_room.id", "a.room_id").leftJoin("audit_session_rooms as physical_room", join => join.onRef("physical_room.session_id", "=", "i.session_id").onRef("physical_room.room_id", "=", "i.room_id_aktual")).where("i.session_id", "=", id)
            .$if(room !== undefined, q => q.where("i.room_id_sistem", "=", String(room)))
            .$if(asset !== undefined, q => q.where("i.asset_id", "=", asset!))
            .$if(differences, q => q.where("i.hasil", "in", ["SALAH_LOKASI", "PERBEDAAN_KONDISI", "TIDAK_DITEMUKAN"]));
        const count = await q.select(eb => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
        const rows = await q.selectAll("i").select(["a.room_id as room_id_sekarang", "a.kondisi as kondisi_sekarang", "current_room.nama as lokasi_sekarang", "physical_room.nama as lokasi_aktual", sql<string>`(select count(*) from audit_photos p join stored_files f on f.id=p.file_id where p.item_id=i.id and (f.checksum is null or f.scan_status <> 'CLEAN'))`.as("foto_tertunda")]).orderBy("i.id").limit(size).offset((page - 1) * size).execute();
        return { data: rows.map(row => StocktakeItemSchema.parse({ ...row, diperiksa_pada: row.diperiksa_pada?.toISOString() ?? null, foto_tertunda: Number(row.foto_tertunda) })), meta: meta(page, size, count.n) };
    }
    async findings(ctx: AuthContext, id: string, page: number, size: number) {
        await this.detail(ctx, id);
        const q = this.query(ctx).selectFrom("audit_new_findings as n").where("n.session_id", "=", id);
        const count = await q.select(eb => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
        const rows = await q.selectAll("n").select(sql<string>`(select count(*) from audit_photos p join stored_files f on f.id=p.file_id where p.finding_id=n.id and (f.checksum is null or f.scan_status <> 'CLEAN'))`.as("foto_tertunda")).orderBy("n.id").limit(size).offset((page - 1) * size).execute();
        return { data: rows.map(r => { const registration = r.pendaftaran as Record<string, unknown> | null; return StocktakeNewFindingSchema.parse({ ...r, pendaftaran: registration && !ctx.can("asset.view_financial") ? { ...registration, nilai_perolehan: null } : registration, foto_tertunda: Number(r.foto_tertunda) }); }), meta: meta(page, size, count.n) };
    }
}
export const meta = (page: number, size: number, total: string | number) => ({ page, per_page: size, total: Number(total), total_pages: Math.max(1, Math.ceil(Number(total) / size)) });
export const createStocktakeRepository = (executor: QueryExecutor) => defineRepository(new StocktakeRepository(executor));
