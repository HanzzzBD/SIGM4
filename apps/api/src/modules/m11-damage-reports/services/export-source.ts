import type { DamageReportListQuerySchema } from "@sigm4/schemas";
import type { z } from "zod";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { createDamageReportRepository } from "../repositories/damage-report.repository.js";
const midnight = (s: string, n = 0) => new Date(Date.parse(`${s}T00:00:00+07:00`) + n * 86400000);
/** P-39 canonical scope (including assigned technician) + export own intersection. */
export async function damageExportRows(scope: TransactionScope, q: z.output<typeof DamageReportListQuerySchema>, limit: number, clock: Clock) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000) throw new Error("Batas ekspor tidak sah.");
    return (await createDamageReportRepository(scope.tx).daftar(scope.ctx, { q: q.q, status: q.status, urgensi: q.urgensi,
        buildingId: q.building_id, roomId: q.room_id, categoryId: q.category_id,
        pelaporId: q.pelapor === "saya" ? scope.ctx.userId : q.pelapor,
        dari: q.dari === undefined ? undefined : midnight(q.dari), sampai: q.sampai === undefined ? undefined : midnight(q.sampai, 1),
        melampauiSla: q.melampaui_sla, urut: q.urut, page: 1, perPage: limit + 1, sekarang: clock.now() }, true)).baris;
}
