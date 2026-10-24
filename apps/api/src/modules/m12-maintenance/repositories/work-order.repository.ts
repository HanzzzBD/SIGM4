import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export class WorkOrderRepository extends BaseRepository {
    constructor(executor: QueryExecutor) { super(executor); }
    async technician(ctx: AuthContext, id: number, lock = false) {
        return this.query(ctx).selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.nama"]).where("u.id", "=", String(id)).where("u.status", "=", "AKTIF").where("r.kode", "=", "R-04")
            .$if(lock, q => q.forUpdate("u")).executeTakeFirst();
    }
    async technicians(ctx: AuthContext) {
        return this.query(ctx).selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.nama", sql<string>`(select count(*) from work_orders w where w.teknisi_id=u.id and w.status in ('DITUGASKAN','DIKERJAKAN','TERTUNDA','MENUNGGU_VERIFIKASI'))`.as("work_order_aktif")])
            .where("u.status", "=", "AKTIF").where("r.kode", "=", "R-04").orderBy("u.nama").execute();
    }
    async byTicket(ctx: AuthContext, id: number) { return this.query(ctx).selectFrom("work_orders").selectAll().where("damage_report_id", "=", String(id)).executeTakeFirst(); }
    async dashboard(ctx: AuthContext, today: string) {
        const own = this.query(ctx).selectFrom("work_orders").where("teknisi_id", "=", String(ctx.userId))
            .where("status", "in", ["DITUGASKAN", "DIKERJAKAN", "TERTUNDA", "MENUNGGU_VERIFIKASI"]);
        const counts = await own.select(["status", eb => eb.fn.countAll<string>().as("jumlah")]).groupBy("status").execute();
        const overdue = await own.where("target_selesai", "<", today).select(eb => eb.fn.countAll<string>().as("jumlah")).executeTakeFirstOrThrow();
        const next = await own.select(["id", "nomor", "status", "prioritas", "deskripsi", sql<string>`to_char(target_selesai, 'YYYY-MM-DD')`.as("target_selesai")])
            .orderBy(sql`CASE prioritas WHEN 'KRITIS' THEN 4 WHEN 'TINGGI' THEN 3 WHEN 'SEDANG' THEN 2 ELSE 1 END`, "desc")
            .orderBy("target_selesai").orderBy("id").limit(5).execute();
        return { aktif: counts.reduce((sum, row) => sum + Number(row.jumlah), 0), terlambat: Number(overdue.jumlah), per_status: Object.fromEntries(counts.map(row => [row.status, Number(row.jumlah)])), berikutnya: next };
    }
    async read(ctx: AuthContext, id: number) {
        return this.query(ctx).selectFrom("work_orders").selectAll().where("id", "=", String(id))
            .$if(ctx.scopeOf("workorder.view") !== "all", q => q.where("teknisi_id", "=", String(ctx.userId))).executeTakeFirst();
    }
    async list(ctx: AuthContext, page: number, size: number, mine: boolean) {
        const q = this.query(ctx).selectFrom("work_orders").$if(mine || ctx.scopeOf("workorder.view") !== "all", q => q.where("teknisi_id", "=", String(ctx.userId)));
        const total = await q.select(eb => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
        const data = await q.selectAll().orderBy(sql`CASE prioritas WHEN 'KRITIS' THEN 4 WHEN 'TINGGI' THEN 3 WHEN 'SEDANG' THEN 2 ELSE 1 END`, "desc").orderBy("target_selesai").orderBy("id").limit(size).offset((page - 1) * size).execute();
        return { data, meta: { page, per_page: size, total: Number(total.n), total_pages: Math.max(1, Math.ceil(Number(total.n) / size)) } };
    }
}
export function createWorkOrderRepository(executor: QueryExecutor) { return defineRepository(new WorkOrderRepository(executor)); }
