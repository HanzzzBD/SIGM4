import { sql } from "kysely";
import type { Kysely, Selectable } from "kysely";
import type { MaintenanceScheduleInput } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database, MaintenanceSchedulesTable, TransactionScope } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { addCalendarDays, nextWorkingDate } from "./preventive-calendar.js";
import { tanggalWib, validateWorkOrderTechnician } from "./work-order.service.js";

type Schedule = Selectable<MaintenanceSchedulesTable>;
const dateText = (column: string) => sql<string>`to_char(${sql.ref(column)}, 'YYYY-MM-DD')`;
export class MaintenanceScheduleService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly audit: AuditLogger) {}
    async options() {
        const [categories, technicians] = await Promise.all([
            this.db.selectFrom("asset_categories").select(["id", "nama", "interval_preventif_hari"]).orderBy("nama").execute(),
            this.db.selectFrom("users as u").innerJoin("roles as r", "r.id", "u.role_id").select(["u.id", "u.nama"]).where("u.status", "=", "AKTIF").where("r.kode", "=", "R-04").orderBy("u.nama").execute(),
        ]);
        return { categories, technicians };
    }
    async assetOptions(category: string, page: number) {
        const data = await this.db.selectFrom("assets").select(["id", "nama", "kode_barang"]).where("category_id", "=", category).where("dihapuskan", "=", false).orderBy("id").limit(100).offset((page - 1) * 100).execute();
        return data;
    }
    private async calendar(scope: TransactionScope) {
        const [days, holidays] = await Promise.all([
            scope.tx.selectFrom("work_days").select("hari").where("aktif", "=", true).execute(),
            scope.tx.selectFrom("holidays").select(dateText("tanggal").as("tanggal")).execute(),
        ]);
        const active = new Set(days.map(d => d.hari));
        if (!active.size) throw new DomainError("VALIDATION_ERROR", "Kalender harus memiliki hari kerja aktif.");
        return (date: string) => nextWorkingDate(date, active, new Set(holidays.map(h => h.tanggal)));
    }
    private async schedule(scope: TransactionScope, id: string) {
        const row = await scope.tx.selectFrom("maintenance_schedules").selectAll().select(dateText("tanggal_mulai").as("tanggal_mulai")).where("id", "=", id).forUpdate().executeTakeFirst();
        if (!row) throw new NotFoundError("Jadwal pemeliharaan tidak ditemukan.");
        return row;
    }
    private async validate(scope: TransactionScope, input: MaintenanceScheduleInput) {
        await validateWorkOrderTechnician(scope, input.teknisi_default_id);
        if (input.asset_id !== undefined) {
            const a = await scope.tx.selectFrom("assets").select("id").where("id", "=", String(input.asset_id)).where("dihapuskan", "=", false).executeTakeFirst();
            if (!a) throw new NotFoundError("Aset tidak ditemukan.");
        } else if (!await scope.tx.selectFrom("asset_categories").select("id").where("id", "=", String(input.category_id)).executeTakeFirst()) throw new NotFoundError("Kategori tidak ditemukan.");
    }
    private values(input: MaintenanceScheduleInput) {
        return { ...input, asset_id: input.asset_id === undefined ? null : String(input.asset_id), category_id: input.category_id === undefined ? null : String(input.category_id), teknisi_default_id: String(input.teknisi_default_id), checklist: JSON.stringify(input.checklist) };
    }
    async create(scope: TransactionScope, input: MaintenanceScheduleInput) {
        await this.validate(scope, input);
        const row = await scope.tx.insertInto("maintenance_schedules").values({ ...this.values(input), created_by: pelakuId(scope.ctx), updated_by: pelakuId(scope.ctx) }).returningAll().executeTakeFirstOrThrow();
        await this.syncAssets(scope, { ...row, tanggal_mulai: input.tanggal_mulai }, await this.calendar(scope));
        await this.audit.write(scope, { modul: "m12-maintenance", aksi: "MAINTENANCE_SCHEDULE_CREATED", entitas: "maintenance_schedules", entitasId: row.id, nilaiSesudah: input });
        return this.dto(scope, { ...row, tanggal_mulai: input.tanggal_mulai });
    }
    private async syncAssets(scope: TransactionScope, row: Schedule, working: (date: string) => string) {
        const assets = await scope.tx.selectFrom("assets").select("id").where("dihapuskan", "=", false)
            .$if(row.asset_id !== null, q => q.where("id", "=", row.asset_id!))
            .$if(row.category_id !== null, q => q.where("category_id", "=", row.category_id!)).orderBy("id").execute();
        for (const a of assets) await scope.tx.insertInto("maintenance_schedule_assets").values({ schedule_id: row.id, asset_id: a.id, jatuh_tempo: working(row.tanggal_mulai) }).onConflict(c => c.columns(["schedule_id", "asset_id"]).doNothing()).execute();
    }
    private async dto(scope: TransactionScope, row: Schedule) {
        const due = await scope.tx.selectFrom("maintenance_schedule_assets").select(sql<string | null>`to_char(min(jatuh_tempo), 'YYYY-MM-DD')`.as("date")).where("schedule_id", "=", row.id).executeTakeFirstOrThrow();
        const names = await scope.tx.selectFrom("maintenance_schedules as s").leftJoin("assets as a", "a.id", "s.asset_id").leftJoin("asset_categories as c", "c.id", "s.category_id").innerJoin("users as u", "u.id", "s.teknisi_default_id").select(["a.nama as nama_aset", "c.nama as nama_kategori", "u.nama as nama_teknisi"]).where("s.id", "=", row.id).executeTakeFirstOrThrow();
        return { ...row, ...names, checklist: row.checklist as string[], jatuh_tempo_berikutnya: due.date };
    }
    async orders(ctx: AuthContext, id: string, page: number) {
        return withTransaction(ctx, async scope => {
            await this.schedule(scope, id);
            const q = scope.tx.selectFrom("work_orders").select(["id", "nomor", "asset_id", "status", "menunggu_ketersediaan_aset", dateText("target_selesai").as("target_selesai")]).where("maintenance_schedule_id", "=", id).orderBy("id", "desc");
            return q.limit(20).offset((page - 1) * 20).execute();
        }, this.db);
    }
    async detail(ctx: AuthContext, id: string) {
        return withTransaction(ctx, async scope => {
            const row = await this.schedule(scope, id);
            return this.dto(scope, row);
        }, this.db);
    }
    async list(ctx: AuthContext, query: { page: number; per_page: number; "filter[status]"?: "AKTIF" | "NONAKTIF" | undefined; "filter[jatuh_tempo_hari]"?: number | undefined }) {
        return withTransaction(ctx, async scope => {
            let q = scope.tx.selectFrom("maintenance_schedules as s");
            if (query["filter[status]"]) q = q.where("s.status", "=", query["filter[status]"]);
            if (query["filter[jatuh_tempo_hari]"] !== undefined) q = q.where(eb => eb.exists(eb.selectFrom("maintenance_schedule_assets as a").select("a.asset_id").whereRef("a.schedule_id", "=", "s.id").where("a.jatuh_tempo", "<=", addCalendarDays(tanggalWib(this.clock.now()), query["filter[jatuh_tempo_hari]"]!))));
            const count = await q.select(eb => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
            const rows = await q.selectAll("s").select(dateText("s.tanggal_mulai").as("tanggal_mulai")).orderBy("s.id", "desc").limit(query.per_page).offset((query.page - 1) * query.per_page).execute();
            const data = [];
            for (const row of rows) data.push(await this.dto(scope, row));
            return { data, meta: { page: query.page, per_page: query.per_page, total: Number(count.n), total_pages: Math.max(1, Math.ceil(Number(count.n) / query.per_page)) } };
        }, this.db);
    }
    async update(scope: TransactionScope, id: string, input: MaintenanceScheduleInput) {
        const before = await this.schedule(scope, id);
        if (before.asset_id !== (input.asset_id === undefined ? null : String(input.asset_id)) || before.category_id !== (input.category_id === undefined ? null : String(input.category_id))) throw new DomainError("VALIDATION_ERROR", "Cakupan jadwal tidak dapat diganti; buat jadwal baru.");
        await this.validate(scope, input);
        await scope.tx.updateTable("maintenance_schedules").set({ ...this.values(input), updated_by: pelakuId(scope.ctx) }).where("id", "=", id).execute();
        const working = await this.calendar(scope);
        if (before.tanggal_mulai !== input.tanggal_mulai) await scope.tx.updateTable("maintenance_schedule_assets").set({ jatuh_tempo: working(input.tanggal_mulai) }).where("schedule_id", "=", id).where("work_order_id", "is", null).execute();
        await this.audit.write(scope, { modul: "m12-maintenance", aksi: "MAINTENANCE_SCHEDULE_UPDATED", entitas: "maintenance_schedules", entitasId: id, nilaiSebelum: before, nilaiSesudah: input });
        return this.dto(scope, await this.schedule(scope, id));
    }
    async action(scope: TransactionScope, id: string, action: "deactivate" | "skip", alasan: string) {
        const row = await this.schedule(scope, id);
        if (row.status !== "AKTIF") throw new DomainError("VALIDATION_ERROR", "Jadwal sudah nonaktif.");
        if (action === "deactivate") await scope.tx.updateTable("maintenance_schedules").set({ status: "NONAKTIF", updated_by: pelakuId(scope.ctx) }).where("id", "=", id).execute();
        else {
            const working = await this.calendar(scope);
            await this.syncAssets(scope, row, working);
            const cycles = await scope.tx.selectFrom("maintenance_schedule_assets").selectAll().select(dateText("jatuh_tempo").as("jatuh_tempo")).where("schedule_id", "=", id).forUpdate().execute();
            if (cycles.some(c => c.work_order_id !== null)) throw new DomainError("VALIDATION_ERROR", "Work order sudah terbit; selesaikan dahulu sebelum melewati siklus.");
            for (const c of cycles) {
                await scope.tx.insertInto("maintenance_schedule_skips").values({ schedule_id: id, asset_id: c.asset_id, jatuh_tempo: c.jatuh_tempo, alasan, created_by: pelakuId(scope.ctx) }).execute();
                await scope.tx.updateTable("maintenance_schedule_assets").set({ jatuh_tempo: working(addCalendarDays(c.jatuh_tempo, row.interval_hari)) }).where("schedule_id", "=", id).where("asset_id", "=", c.asset_id).execute();
            }
        }
        await this.audit.write(scope, { modul: "m12-maintenance", aksi: action === "skip" ? "MAINTENANCE_SCHEDULE_SKIPPED" : "MAINTENANCE_SCHEDULE_DEACTIVATED", entitas: "maintenance_schedules", entitasId: id, nilaiSesudah: { alasan } });
        return this.dto(scope, await this.schedule(scope, id));
    }
    async generate(ctx: AuthContext) {
        const ids = await this.db.selectFrom("maintenance_schedules as s").select("s.id").where(eb => eb.or([
            eb("s.status", "=", "AKTIF"),
            eb.exists(eb.selectFrom("work_orders as w").select("w.id").whereRef("w.maintenance_schedule_id", "=", "s.id").where("w.menunggu_ketersediaan_aset", "=", true).where("w.status", "not in", ["SELESAI", "DIBATALKAN"])),
        ])).orderBy("s.id").execute();
        let created = 0;
        for (const { id } of ids) created += await withTransaction(ctx, async scope => {
            const row = await this.schedule(scope, id);
            const working = await this.calendar(scope);
            if (row.status === "AKTIF") await this.syncAssets(scope, row, working);
            const cycles = await scope.tx.selectFrom("maintenance_schedule_assets as c").innerJoin("assets as a", "a.id", "c.asset_id").select(["c.asset_id", "c.work_order_id", dateText("c.jatuh_tempo").as("jatuh_tempo"), "a.status", "a.nama", "a.category_id"])
                .where("c.schedule_id", "=", id).where("a.dihapuskan", "=", false)
                .orderBy("c.asset_id").forUpdate("a").execute();
            let n = 0;
            for (const cycle of cycles) {
                let due = working(cycle.jatuh_tempo);
                if (cycle.work_order_id !== null) {
                    const previous = await scope.tx.selectFrom("work_orders").select(["status", "teknisi_id", "waktu_selesai", "updated_at", "menunggu_ketersediaan_aset"]).where("id", "=", cycle.work_order_id).forUpdate().skipLocked().executeTakeFirst();
                    if (!previous) continue;
                    if (!["SELESAI", "DIBATALKAN"].includes(previous.status)) {
                        if (previous.menunggu_ketersediaan_aset && cycle.status === "TERSEDIA") {
                            await scope.tx.updateTable("work_orders").set({ menunggu_ketersediaan_aset: false }).where("id", "=", cycle.work_order_id).execute();
                            await publish(scope, { name: "PreventiveAssetAvailable", aggregateType: "work_order", aggregateId: cycle.work_order_id, payload: { work_order_id: Number(cycle.work_order_id), teknisi_id: Number(previous.teknisi_id), aset: cycle.nama } });
                        }
                        continue;
                    }
                    due = working(addCalendarDays(tanggalWib(previous.waktu_selesai ?? previous.updated_at), row.interval_hari));
                    await scope.tx.updateTable("maintenance_schedule_assets").set({ jatuh_tempo: due, work_order_id: null }).where("schedule_id", "=", id).where("asset_id", "=", cycle.asset_id).execute();
                }
                if (row.status !== "AKTIF" || (row.category_id !== null && cycle.category_id !== row.category_id)) continue;
                await scope.tx.updateTable("maintenance_schedule_assets").set({ jatuh_tempo: due }).where("schedule_id", "=", id).where("asset_id", "=", cycle.asset_id).execute();
                if (due > addCalendarDays(tanggalWib(this.clock.now()), 7)) continue;
                await validateWorkOrderTechnician(scope, Number(row.teknisi_default_id));
                const order = await scope.tx.insertInto("work_orders").values({ nomor: await new DocumentNumberService(this.clock).next(scope.tx, "WO"), jenis: "PREVENTIF", asset_id: cycle.asset_id, room_id: null, damage_report_id: null, teknisi_id: row.teknisi_default_id, prioritas: "SEDANG", deskripsi: row.nama, target_selesai: due, estimasi_biaya: "0.00", nonaktifkan_aset: false, maintenance_schedule_id: id, preventive_due_date: due, checklist: JSON.stringify((row.checklist as string[]).map((label, index) => ({ id: String(index + 1), label, selesai: false }))), menunggu_ketersediaan_aset: cycle.status !== "TERSEDIA", created_by: null, updated_by: null }).returningAll().executeTakeFirstOrThrow();
                await scope.tx.updateTable("maintenance_schedule_assets").set({ jatuh_tempo: due, work_order_id: order.id }).where("schedule_id", "=", id).where("asset_id", "=", cycle.asset_id).execute();
                await this.audit.write(scope, { modul: "m12-maintenance", aksi: "WORKORDER_CREATED", entitas: "work_orders", entitasId: order.id, nilaiSesudah: { nomor: order.nomor, maintenance_schedule_id: id, target_selesai: due } });
                await publish(scope, { name: "PreventiveWorkOrderCreated", aggregateType: "work_order", aggregateId: order.id, payload: { work_order_id: Number(order.id), nomor: order.nomor, teknisi_id: Number(row.teknisi_default_id), aset: cycle.nama, tanggal: due } });
                n++;
            }
            return n;
        }, this.db);
        return { created };
    }
}
