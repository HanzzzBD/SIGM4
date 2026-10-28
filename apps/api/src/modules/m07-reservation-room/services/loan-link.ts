// PR-05-01: M-09 memakai permukaan ini; repository reservasi tetap privat M-07.
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { createReservationRepository } from "../repositories/reservation.repository.js";

export async function lockReservationForLoan(scope: TransactionScope, id: number) {
    const repo = createReservationRepository(scope.tx), root = await repo.akarDari(scope.ctx, id);
    if (root === undefined) throw new DomainError("VALIDATION_ERROR", "Reservasi tidak ditemukan.");
    await repo.kunciKelompok(scope.ctx, root);
    return repo.loanRecord(scope.ctx, id);
}
export async function recordLoanReservationStatus(scope: TransactionScope, id: number, status: "BERLANGSUNG" | "SELESAI", audit: AuditLogger) {
    const repo = createReservationRepository(scope.tx);
    const before = await repo.loanRecord(scope.ctx, id);
    await repo.loanStatus(scope.ctx, id, status);
    await audit.write(scope, { modul: "m07-reservation-room", aksi: "RESERVATION_UPDATED", entitas: "reservations", entitasId: id, nilaiSebelum: { status: before?.status }, nilaiSesudah: { status, parent_id: before?.parent_id, alasan: "Realisasi peminjaman" } });
}
export async function createDirectLoanReservation(scope: TransactionScope, input: { borrower: number; start: Date; end: Date; purpose: string; location: string; reason: string; assets: readonly number[] }, clock: Clock, audit: AuditLogger) {
    const nomor = await new DocumentNumberService(clock).next(scope.tx, "RSV-BR");
    const id = await createReservationRepository(scope.tx).directLoan(scope.ctx, { ...input, nomor });
    await audit.write(scope, { modul: "m07-reservation-room", aksi: "RESERVATION_CREATED", entitas: "reservations", entitasId: id, keterangan: input.reason, nilaiSesudah: { nomor, bypass_approval: true, pemohon_id: input.borrower, status: "DISETUJUI" } });
    return id;
}
