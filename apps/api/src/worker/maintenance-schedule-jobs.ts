import type { Kysely } from "kysely";
import type { Database } from "../shared/db/index.js";
import type { Clock } from "../shared/clock/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { createSystemAuthContext } from "../shared/auth/system-context.js";
import { MaintenanceScheduleService } from "../modules/m12-maintenance/index.js";
import { wibCronToUtc } from "./scheduler.js";
export const MAINTENANCE_SCHEDULE_JOB = "maintenance-schedule-generate";
export const MAINTENANCE_SCHEDULE_CRON = wibCronToUtc(0, 6);
export async function runMaintenanceSchedules(db: Kysely<Database>, clock: Clock) {
    return new MaintenanceScheduleService(db, clock, new AuditLogger({ clock })).generate(createSystemAuthContext(MAINTENANCE_SCHEDULE_JOB));
}
