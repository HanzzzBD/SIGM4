import type { LoanListQuery, FineListQuery } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import { publish } from "../../../shared/events/index.js";
import { tanggalWib } from "../../m07-reservation-room/index.js";
import { createManagementRepository } from "../repositories/management.repository.js";
import { createLoanRepository } from "../repositories/loan.repository.js";
import { calculateFine, cents, money } from "./fine-calculation.js";
import type { FinePolicy } from "./fine-calculation.js";
import { fineRow } from "./fine-management.service.js";

import { syncBorrowerBlock } from "./blocking.service.js";

export async function estimateLoan(scope: TransactionScope, loan: { id: string; tanggal_jatuh_tempo: Date; kebijakan_denda: unknown }, clock: Clock) {
 const policy = loan.kebijakan_denda as FinePolicy, items = (await createLoanRepository(scope.tx).items(scope.ctx, loan.id)).filter((i) => i.status_kembali === "BELUM_KEMBALI"), days = await new BusinessCalendarService().countCalendarDays(scope.tx, loan.tanggal_jatuh_tempo, clock.now(), { excludeHolidays: policy.excludeHolidays });
 return { unit_aktif: items.length, hari_terlambat: days, estimasi_denda: money(items.reduce((sum, i) => sum + cents(calculateFine(days + i.hari_terlambat_terakumulasi, i.nilai_perolehan_snapshot, policy).denda), 0n)) };
}
export const pagination = (total: number, page: number, perPage: number) => ({ page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) });
export async function listLoans(scope: TransactionScope, filter: LoanListQuery, clock: Clock) {
 const rows = await createManagementRepository(scope.tx).listLoans(scope.ctx, filter, clock.now());
 return { data: await Promise.all(rows.map(async (l) => ({ id: l.id, nomor: l.nomor, peminjam: { id: l.peminjam_id, nama: l.peminjam_nama }, tanggal_pinjam: l.tanggal_pinjam.toISOString(), tanggal_jatuh_tempo: l.tanggal_jatuh_tempo.toISOString(), status: l.tanggal_kembali === null && l.tanggal_jatuh_tempo < clock.now() ? "TERLAMBAT" : l.status, ...await estimateLoan(scope, l, clock) }))), meta: pagination(Number(rows[0]?.total ?? 0), filter.page, filter.per_page) };
}
export async function listFines(scope: TransactionScope, filter: FineListQuery) { const rows = await createManagementRepository(scope.tx).listFines(scope.ctx, filter); return { data: rows.map(fineRow), meta: pagination(Number(rows[0]?.total ?? 0), filter.page, filter.per_page) }; }
export async function processLoanDay(scope: TransactionScope, id: number, clock: Clock, audit: AuditLogger) {
 const repo = createManagementRepository(scope.tx), loan = await repo.loan(scope.ctx, id, true); if (!loan || loan.tanggal_kembali !== null) return { overdue: false };
 const now = clock.now(), day = tanggalWib(now), estimate = await estimateLoan(scope, loan, clock), payload = { loan_id: id, peminjam_id: Number(loan.peminjam_id), nomor: loan.nomor, tanggal: loan.tanggal_jatuh_tempo.toISOString(), hari: estimate.hari_terlambat, jumlah: estimate.estimasi_denda, hari_wib: day };
 const tomorrow = tanggalWib(new Date(now.getTime() + 86_400_000));
 if (tanggalWib(loan.tanggal_jatuh_tempo) === tomorrow && await repo.daily(scope.ctx, loan.id, day, "H1", loan.tanggal_jatuh_tempo)) await publish(scope, { name: "LoanDueReminder", aggregateType: "loan", aggregateId: loan.id, payload });
 if (loan.tanggal_jatuh_tempo < now && estimate.unit_aktif > 0) {
  if (loan.status !== "TERLAMBAT") { await repo.overdue(scope.ctx, loan.id); await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_OVERDUE", entitas: "loans", entitasId: loan.id, nilaiSebelum: { status: loan.status }, nilaiSesudah: { status: "TERLAMBAT" } }); }
  if (await repo.daily(scope.ctx, loan.id, day, "OVERDUE", loan.tanggal_jatuh_tempo)) await publish(scope, { name: "LoanOverdueReminder", aggregateType: "loan", aggregateId: loan.id, payload });
  return { overdue: true };
 }
 return { overdue: false };
}

export async function monitoringLoanIds(scope: TransactionScope) { return createManagementRepository(scope.tx).openIds(scope.ctx); }
export async function syncLoanBorrowers(scope: TransactionScope, clock: Clock, audit: AuditLogger) { const repo = createManagementRepository(scope.tx); for (const user of await repo.blockUsers(scope.ctx)) await syncBorrowerBlock(scope, Number(user.id), clock, audit); }
export async function publishLoanRecap(scope: TransactionScope, clock: Clock, count: number) { const day = tanggalWib(clock.now()); if (await createManagementRepository(scope.tx).recap(scope.ctx, day)) await publish(scope, { name: "LoanOverdueRecap", aggregateType: "loan_recap", aggregateId: Number(day.replaceAll("-", "")), payload: { jumlah: count, hari_wib: day } }); }
