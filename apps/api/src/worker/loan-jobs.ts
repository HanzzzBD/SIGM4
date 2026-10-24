import type { Kysely } from "kysely";
import type { Clock } from "../shared/clock/index.js";
import type { Database } from "../shared/db/index.js";
import { withTransaction } from "../shared/db/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { processLoanDay, monitoringLoanIds, syncLoanBorrowers, publishLoanRecap } from "../modules/m09-loans/index.js";
import { jalankanPekerjaanSistem } from "./system-job.js";

export const LOAN_OVERDUE_JOB = "loan-overdue";
export const LOAN_OVERDUE_CRON = "5 17 * * *";
/** FR-09.3 / JOB-03: satu transaksi per loan dan penanda harian tahan restart. */
export async function runLoanMonitoring(db: Kysely<Database>, clock: Clock) {
 const audit = new AuditLogger({ clock });
 return jalankanPekerjaanSistem({ nama: LOAN_OVERDUE_JOB, db, audit, clock }, async (ctx) => {
  const ids = await withTransaction(ctx, monitoringLoanIds, db); let overdue = 0;
  for (const id of ids) { const result = await withTransaction(ctx, (s) => processLoanDay(s, Number(id.id), clock, audit), db); if (result.overdue) overdue += 1; }
  await withTransaction(ctx, async (s) => { await syncLoanBorrowers(s, clock, audit); await publishLoanRecap(s, clock, overdue); }, db);
  return { diproses: ids.length, galat: 0, rincian: { terlambat: overdue } };
 });
}
