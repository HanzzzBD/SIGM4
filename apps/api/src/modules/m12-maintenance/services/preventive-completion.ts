import { sql } from "kysely";
import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { addCalendarDays, nextWorkingDate } from "./preventive-calendar.js";
import { tanggalWib } from "./work-order.service.js";

/** Called by verification inside its transaction. Conditional cycle update makes replay harmless. */
export async function finishPreventiveWorkOrder(scope: TransactionScope, workOrderId: string | number, completedAt: Date) {
    const order = await scope.tx.selectFrom("work_orders").select("waktu_selesai").where("id", "=", String(workOrderId)).executeTakeFirst();
    const cycle = await scope.tx.selectFrom("maintenance_schedule_assets as c").innerJoin("maintenance_schedules as s", "s.id", "c.schedule_id")
        .select(["c.schedule_id", "c.asset_id", "s.interval_hari"]).where("c.work_order_id", "=", String(workOrderId)).executeTakeFirst();
    if (!cycle) return;
    const [days, holidays] = await Promise.all([
        scope.tx.selectFrom("work_days").select("hari").where("aktif", "=", true).execute(),
        scope.tx.selectFrom("holidays").select(sql<string>`to_char(tanggal,'YYYY-MM-DD')`.as("tanggal")).execute(),
    ]);
    if (!days.length) throw new DomainError("VALIDATION_ERROR", "Kalender harus memiliki hari kerja aktif.");
    const due = nextWorkingDate(addCalendarDays(tanggalWib(order?.waktu_selesai ?? completedAt), cycle.interval_hari), new Set(days.map(d => d.hari)), new Set(holidays.map(h => h.tanggal)));
    await scope.tx.updateTable("maintenance_schedule_assets").set({ jatuh_tempo: due, work_order_id: null })
        .where("schedule_id", "=", cycle.schedule_id).where("asset_id", "=", cycle.asset_id).where("work_order_id", "=", String(workOrderId)).execute();
}
