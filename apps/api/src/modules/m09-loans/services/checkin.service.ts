import type { LoanCheckinBody } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { SlotService } from "../../../shared/booking/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import { publish } from "../../../shared/events/index.js";
import { attachLoanEvidence } from "../../m06-documents/index.js";
import { cancelReservationsForUnavailableAsset, lockReservationForLoan, recordLoanReservationStatus } from "../../m07-reservation-room/index.js";
import { reportLoanReturnDamage } from "../../m11-damage-reports/index.js";
import { createLoanRepository } from "../repositories/loan.repository.js";
import { calculateFine, cents } from "./fine-calculation.js";
import type { FinePolicy } from "./fine-calculation.js";

import { closePendingExtensions } from "./extension.service.js";
import { syncBorrowerBlock } from "./blocking.service.js";

const invalid = (message: string) => new DomainError("VALIDATION_ERROR", message);
export async function previewLoanReturn(scope: TransactionScope, id: number, body: LoanCheckinBody, clock: Clock) {
    const repo = createLoanRepository(scope.tx), loan = await repo.loanReference(scope.ctx, id);
    if (!loan) throw new NotFoundError();
    const items = await repo.items(scope.ctx, loan.id), policy = loan.kebijakan_denda as FinePolicy;
    if (typeof policy.tariff !== "number" || typeof policy.nominalCap !== "number") throw invalid("Snapshot kebijakan denda peminjaman tidak tersedia.");
    const days = await new BusinessCalendarService().countCalendarDays(scope.tx, loan.tanggal_jatuh_tempo, clock.now(), { excludeHolidays: policy.excludeHolidays });
    return { unit: body.unit.map((u) => {
        const item = items.find((i) => i.id === String(u.loan_item_id));
        if (!item || item.status_kembali !== "BELUM_KEMBALI") throw invalid("Unit bukan bagian peminjaman ini atau sudah diproses.");
        if (![item.kode_barang, item.uuid].includes(u.verification_code)) throw invalid("Kode/QR pengembalian tidak sesuai unit.");
        const compensation = u.kondisi_akhir === "HILANG" || u.kondisi_akhir === "RUSAK_BERAT" && u.kelalaian;
        return { loan_item_id: item.id, ...calculateFine(days + item.hari_terlambat_terakumulasi, item.nilai_perolehan_snapshot, policy), ganti_rugi: compensation ? item.nilai_perolehan_snapshot : "0.00", menunggu_penetapan: compensation && item.nilai_perolehan_snapshot === null };
    }) };
}
export async function checkinLoan(scope: TransactionScope, id: number, body: LoanCheckinBody, clock: Clock, audit: AuditLogger) {
    const repo = createLoanRepository(scope.tx), reference = await repo.loanReference(scope.ctx, id);
    if (!reference) throw new NotFoundError();
    // Urutan kelompok reservasi lalu loan konsisten dengan serah terima dan pembatalan.
    await lockReservationForLoan(scope, Number(reference.reservation_id));
    const loan = await repo.loan(scope.ctx, id, true);
    if (!loan || ["DIKEMBALIKAN", "HILANG"].includes(loan.status)) throw invalid("Peminjaman sudah ditutup.");
    const preview = await previewLoanReturn(scope, id, body, clock), now = clock.now(), items = await repo.items(scope.ctx, loan.id);
    const returned = items.filter((i) => body.unit.some((u) => String(u.loan_item_id) === i.id));
    const assets = await repo.lockAssets(scope.ctx, returned.map((i) => Number(i.asset_id)));
    await closePendingExtensions(scope, loan.id, "DIBATALKAN", clock, audit);
    await attachLoanEvidence(scope, body.unit.flatMap((u) => u.foto_file_ids), id);
    await new SlotService(clock).release(scope, returned.map((i) => Number(i.slot_id)));
    for (const unit of body.unit) {
        const item = returned.find((i) => i.id === String(unit.loan_item_id))!, asset = assets.find((a) => a.id === item.asset_id)!;
        const incomplete = unit.kondisi_akhir === "TIDAK_LENGKAP", condition = unit.kondisi_akhir === "TIDAK_LENGKAP" ? "RUSAK_RINGAN" : unit.kondisi_akhir;
        await repo.returnItem(scope.ctx, item.id, condition, incomplete, unit.catatan ?? null, now);
        await repo.photos(scope.ctx, item.id, "AKHIR", unit.foto_file_ids);
        if (condition === "BAIK") {
            const reserved = await repo.confirmedNow(scope.ctx, Number(item.asset_id), now);
            await repo.setAsset(scope.ctx, asset, "BAIK", reserved ? "DIRESERVASI" : "TERSEDIA", "Pengembalian peminjaman", loan.id, now);
        } else {
            await repo.setAsset(scope.ctx, asset, condition, "TIDAK_TERSEDIA", unit.catatan!, loan.id, now);
            await cancelReservationsForUnavailableAsset(scope, Number(item.asset_id), clock, audit);
            if (condition !== "HILANG") await reportLoanReturnDamage(scope, { assetId: Number(item.asset_id), loanId: loan.id, itemId: item.id, borrowerId: loan.peminjam_id, note: unit.catatan!, photos: unit.foto_file_ids }, clock, audit);
            else await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_MARKED_LOST", entitas: "loans", entitasId: loan.id, keterangan: unit.catatan!, nilaiSesudah: { loan_item_id: item.id, asset_id: item.asset_id, peminjam_id: loan.peminjam_id } });
        }
        const calculated = preview.unit.find((i) => i.loan_item_id === item.id)!;
        const emitFine = async (kind: "KETERLAMBATAN" | "GANTI_RUGI", amount: string | null, raw: string | null, awaiting: boolean) => {
            const fine = await repo.fine(scope.ctx, { loan_item_id: item.id, loan_id: loan.id, peminjam_id: loan.peminjam_id, jenis: kind, hari_terlambat: kind === "KETERLAMBATAN" ? calculated.hari_terlambat : 0, tarif_per_hari: kind === "KETERLAMBATAN" ? calculated.tarif_per_hari : "0.00", jumlah: amount, jumlah_sebelum_cap: raw, menunggu_penetapan: awaiting, created_by: scope.ctx.userId, updated_by: scope.ctx.userId });
            await audit.write(scope, { modul: "m09-loans", aksi: "FINE_ISSUED", entitas: "fines", entitasId: fine, nilaiSesudah: { loan_item_id: item.id, jenis: kind, jumlah: amount, menunggu_penetapan: awaiting } });
            await publish(scope, { name: "FineIssued", aggregateType: "fine", aggregateId: fine, payload: { fine_id: Number(fine), loan_id: id, peminjam_id: Number(loan.peminjam_id), nomor: loan.nomor, jumlah: amount, jenis: kind, menunggu_penetapan: awaiting } });
        };
        if (calculated.hari_terlambat > 0 && cents(calculated.denda) > 0n) await emitFine("KETERLAMBATAN", calculated.denda, calculated.sebelum_cap, false);
        if (calculated.menunggu_penetapan || calculated.ganti_rugi !== null && cents(calculated.ganti_rugi) > 0n) await emitFine("GANTI_RUGI", calculated.ganti_rugi, calculated.ganti_rugi, calculated.menunggu_penetapan);
    }
    const status = await repo.closeLoan(scope.ctx, loan.id, now);
    if (status !== "SEBAGIAN_DIKEMBALIKAN") await recordLoanReservationStatus(scope, Number(loan.reservation_id), "SELESAI", audit);
    await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_CHECKIN", entitas: "loans", entitasId: loan.id, nilaiSebelum: { status: loan.status }, nilaiSesudah: { status, unit: body.unit.map((u) => ({ loan_item_id: u.loan_item_id, kondisi: u.kondisi_akhir })) } });
    await publish(scope, { name: "LoanReturned", aggregateType: "loan", aggregateId: loan.id, payload: { loan_id: id, peminjam_id: Number(loan.peminjam_id), nomor: loan.nomor, jumlah: body.unit.length, tanggal: now.toISOString(), status } });
    await syncBorrowerBlock(scope, Number(loan.peminjam_id), clock, audit);
    return { id: loan.id, nomor: loan.nomor, status };
}
