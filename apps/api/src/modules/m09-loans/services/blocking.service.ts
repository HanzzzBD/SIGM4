import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { createManagementRepository } from "../repositories/management.repository.js";
import { cents } from "./fine-calculation.js";

export async function borrowerBlock(scope: TransactionScope, user: number, clock: Clock) {
 const repo = createManagementRepository(scope.tx), threshold = await repo.threshold(scope.ctx), debt = await repo.debt(scope.ctx, user, clock.now());
 const configured = typeof threshold === "number" && Number.isSafeInteger(threshold) && threshold >= 0;
 const reasons: string[] = debt.overdue.map((l) => `Peminjaman ${l.nomor} terlambat dan belum dikembalikan.`);
 if (configured && cents(debt.total) > BigInt(threshold) * 100n) reasons.push("Sisa denda dan ganti rugi melebihi ambang pemblokiran.");
 return { aktif: reasons.length > 0, alasan: reasons, konfigurasi_lengkap: configured };
}
export function requireBlockConfiguration(configured: boolean) {
 if (!configured) throw new DomainError("VALIDATION_ERROR", "Konfigurasi blokir belum lengkap. Administrator harus mengisi ambang denda sebelum pengajuan reservasi/peminjaman baru.", { errors: [{ field: "konfigurasi", message: "Isi parameter denda.ambang_blokir." }] });
}
/** BR-030: keputusan akses dibaca langsung; state ini hanya untuk audit/transisi NT-18. */
export async function syncBorrowerBlock(scope: TransactionScope, user: number, clock: Clock, audit: AuditLogger) {
 const repo = createManagementRepository(scope.tx); await repo.lockBorrower(scope.ctx, user);
 const state = await borrowerBlock(scope, user, clock), before = await repo.block(scope.ctx, user);
 if ((before?.aktif ?? false) !== state.aktif) {
  await audit.write(scope, { modul: "m09-loans", aksi: state.aktif ? "BORROWER_BLOCKED" : "BORROWER_UNBLOCKED", entitas: "users", entitasId: user, nilaiSebelum: { aktif: before?.aktif ?? false }, nilaiSesudah: state });
  if (state.aktif) await publish(scope, { name: "BorrowerBlocked", aggregateType: "borrower", aggregateId: user, payload: { peminjam_id: user, alasan: state.alasan } });
 }
 await repo.saveBlock(scope.ctx, user, state.aktif, state.alasan, clock.now());
 return state;
}
