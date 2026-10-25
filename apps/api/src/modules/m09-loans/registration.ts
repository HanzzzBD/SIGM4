import { z } from "zod";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { TransactionScope } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { AuthContext } from "../../shared/auth/index.js";
import type { EventHandlerRegistry } from "../../shared/events/index.js";
import { EVENT_SLOT_TENTATIF_KEDALUWARSA } from "../../shared/booking/index.js";
import { blokirPemohon } from "../m07-reservation-room/index.js";
import { penanganHasil, penyediaRincian } from "../m10-approval/index.js";
import { borrowerBlock, requireBlockConfiguration } from "./services/blocking.service.js";
import { extensionOutcome, closePendingExtensions } from "./services/extension.service.js";
import { createManagementRepository } from "./repositories/management.repository.js";

let blockerInstalled = false;
export function registerLoans(clock: Clock, audit: AuditLogger) {
 if (!blockerInstalled) { blokirPemohon.daftar({ nama: "m09-loans", async alasanBlokir(scope, user) { const result = await borrowerBlock(scope, user, clock); requireBlockConfiguration(result.konfigurasi_lengkap); return result.alasan.map((reason) => ({ jenis: "KEWAJIBAN_TERTUNGGAK", keterangan: reason })); } }); blockerInstalled = true; }
 if (!penanganHasil.cari("PERPANJANGAN_PEMINJAMAN")) penanganHasil.daftar(extensionOutcome(clock, audit));
 if (!penyediaRincian.cari("PERPANJANGAN_PEMINJAMAN")) penyediaRincian.daftar({ jenis: "PERPANJANGAN_PEMINJAMAN", async rincian(scope, id) { const repo = createManagementRepository(scope.tx), ext = await repo.extension(scope.ctx, id), loan = ext ? await repo.loan(scope.ctx, Number(ext.loan_id)) : undefined; return { label: `Perpanjangan ${loan?.nomor ?? id}`, objek: loan?.nomor ?? null, tanggal: ext?.jatuh_tempo_baru.toISOString() ?? null, deepLink: `/peminjaman/${ext?.loan_id ?? id}` }; } });
}
export function installLoanConsumers(registry: EventHandlerRegistry, deps: { db: () => Kysely<Database>; clock: Clock; audit: AuditLogger; ctx: () => AuthContext }) {
 registry.on(EVENT_SLOT_TENTATIF_KEDALUWARSA, async (event) => {
  const parsed = z.object({ origin: z.string(), slot_id: z.union([z.string(), z.number()]) }).safeParse(event.payload);
  if (!parsed.success || parsed.data.origin !== "loan") return;
  await withTransaction(deps.ctx(), async (scope) => {
   const repo = createManagementRepository(scope.tx), ref = await repo.extensionForSlot(scope.ctx, String(parsed.data.slot_id)); if (!ref) return;
   const ext = await repo.extension(scope.ctx, Number(ref.extension_id)); if (!ext || ext.status !== "MENUNGGU_PERSETUJUAN") return;
   await repo.loan(scope.ctx, Number(ext.loan_id), true); await closePendingExtensions(scope, ext.loan_id, "KEDALUWARSA", deps.clock, deps.audit);
  }, deps.db());
 });
}
export async function currentReminderLoan(scope: TransactionScope, id: number, due: string) { const loan = await createManagementRepository(scope.tx).loan(scope.ctx, id); return loan?.tanggal_kembali === null && loan.tanggal_jatuh_tempo.toISOString() === due; }
