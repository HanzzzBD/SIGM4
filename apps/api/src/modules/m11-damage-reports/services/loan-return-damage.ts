// BR-032 / SDD-EVT-02: laporan dan foto bukti pengembalian tertaut dalam transaksi check-in.
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { publish } from "../../../shared/events/index.js";
import { createDamageReportRepository } from "../repositories/damage-report.repository.js";
import { EVENT_KERUSAKAN_DILAPORKAN } from "./damage-report.service.js";

export async function reportLoanReturnDamage(scope: TransactionScope, input: { assetId: number; loanId: string; itemId: string; borrowerId: string; note: string; photos: readonly number[] }, clock: Clock, audit: AuditLogger) {
    const repo = createDamageReportRepository(scope.tx), existing = await repo.terbuka(scope.ctx, { assetId: input.assetId });
    let id: string;
    const description = `Pengembalian peminjaman #${input.loanId}, unit #${input.itemId}, peminjam #${input.borrowerId}. ${input.note}`;
    if (existing) {
        const noteId = await repo.tambahCatatan(scope.ctx, existing.id, description);
        await repo.tambahFotoCatatan(scope.ctx, noteId, input.photos);
        id = existing.id;
        await audit.write(scope, { modul: "m11-damage-reports", aksi: "DAMAGE_INFO_ADDED", entitas: "damage_reports", entitasId: id, nilaiSesudah: { loan_item_id: input.itemId, catatan: description } });
    } else {
        const nomor = await new DocumentNumberService(clock).next(scope.tx, "KRS");
        const due = await new BusinessCalendarService().endOfNthWorkingDayAfter(scope.tx, clock.now(), await repo.slaHari(scope.ctx, "TINGGI"));
        id = await repo.buat(scope.ctx, { assetId: input.assetId, nomor, deskripsi: description, urgensi: "TINGGI", batasSla: due, loanId: Number(input.loanId) });
        await repo.tambahFoto(scope.ctx, id, input.photos);
        await audit.write(scope, { modul: "m11-damage-reports", aksi: "DAMAGE_REPORTED", entitas: "damage_reports", entitasId: id, nilaiSesudah: { nomor, loan_id: input.loanId, loan_item_id: input.itemId, peminjam_id: input.borrowerId, status: "DILAPORKAN" } });
        await publish(scope, { name: EVENT_KERUSAKAN_DILAPORKAN, aggregateType: "damage_report", aggregateId: id, payload: { damage_report_id: Number(id), nomor, urgensi: "TINGGI", pelapor_id: scope.ctx.userId, objek: `Aset #${input.assetId}`, lokasi: "Pengembalian peminjaman" } });
    }
    await repo.linkLoanItem(scope.ctx, input.itemId, id);
    return id;
}
