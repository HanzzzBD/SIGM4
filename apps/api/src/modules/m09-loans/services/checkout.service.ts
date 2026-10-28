import type { LoanCheckoutBody } from "@sigm4/schemas";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError } from "../../../shared/errors/index.js";
import { SlotService, daftarSlotTerpakai } from "../../../shared/booking/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { publish } from "../../../shared/events/index.js";
import { attachLoanEvidence } from "../../m06-documents/index.js";
import { blokirPemohon, lockReservationForLoan, createDirectLoanReservation, recordLoanReservationStatus, tanggalWib } from "../../m07-reservation-room/index.js";
import { createLoanRepository } from "../repositories/loan.repository.js";
import type { FinePolicy } from "./fine-calculation.js";

const invalid = (field: string, message: string) => new DomainError("VALIDATION_ERROR", message, { errors: [{ field, message }] });
export async function checkoutLoan(scope: TransactionScope, body: LoanCheckoutBody, clock: Clock, audit: AuditLogger) {
    const repo = createLoanRepository(scope.tx), now = clock.now(), settings = await repo.settings(scope.ctx);
    const tariff = settings.get("denda.tarif_per_hari"), nominal = settings.get("denda.cap_nominal"), percent = settings.get("denda.cap_persen");
    if (typeof tariff !== "number" || !Number.isSafeInteger(tariff) || tariff < 0 || typeof nominal !== "number" || !Number.isSafeInteger(nominal) || nominal < 0 || typeof percent !== "number" || percent < 1 || percent > 100) throw invalid("konfigurasi", "Konfigurasi denda belum lengkap. Administrator harus mengisi tarif denda harian dan cap nominal sebelum serah terima.");
    const policy: FinePolicy = { tariff, nominalCap: nominal, percentCap: percent, excludeHolidays: settings.get("denda.kecualikan_hari_libur") === true };
    let reservation = body.reservation_id === undefined ? undefined : await lockReservationForLoan(scope, body.reservation_id);
    if (body.langsung && !scope.ctx.can("loan.direct")) throw new ForbiddenError();
    if (!body.langsung && (reservation?.jenis !== "ASET" || reservation.status !== "DISETUJUI" || tanggalWib(reservation.waktu_mulai) > tanggalWib(now) || now.getTime() >= reservation.waktu_mulai.getTime() + 24 * 3_600_000)) throw invalid("reservation_id", "Reservasi aset harus disetujui dan siap diserahkan; pengambilan tidak boleh lebih dari 24 jam setelah waktu mulai.");
    const borrowerId = body.langsung?.peminjam_id ?? Number(reservation!.pemohon_id), borrower = await repo.borrower(scope.ctx, borrowerId);
    if (!borrower || borrower.status !== "AKTIF") throw invalid("peminjam_id", "Peminjam tidak aktif atau tidak ditemukan.");
    if (scope.ctx.scopeOf("loan.manage") !== "all" && borrowerId !== scope.ctx.userId) throw new ForbiddenError();
    const blockers = await blokirPemohon.periksa(scope, borrowerId);
    if (blockers.length) throw new DomainError("BORROWER_BLOCKED", blockers.map((b) => b.keterangan).join(" "));
    const end = body.langsung ? new Date(body.langsung.tanggal_jatuh_tempo) : reservation!.waktu_selesai;
    if (end <= now) throw invalid("tanggal_jatuh_tempo", "Jatuh tempo harus sesudah serah terima.");
    if (body.langsung) {
        const key = `reservasi.durasi_maksimum_${borrower.role.toLowerCase().replaceAll("-", "_")}_hari`;
        const days = settings.get(key) ?? settings.get("reservasi.durasi_maksimum_r_06_hari");
        if (typeof days !== "number" || end.getTime() - now.getTime() > days * 86_400_000) throw invalid("tanggal_jatuh_tempo", "Durasi peminjaman langsung melebihi batas role peminjam.");
    }
    const allocations = reservation ? await repo.reservationItems(scope.ctx, Number(reservation.id)) : [];
    const chosenAllocations = body.unit.map((u) => u.allocated_asset_id ?? u.asset_id);
    if (!body.langsung && (allocations.length !== body.unit.length || new Set(chosenAllocations).size !== chosenAllocations.length || allocations.some((a) => a.confirmed_at === null || !chosenAllocations.includes(Number(a.asset_id))))) throw invalid("unit", "Serahkan seluruh unit yang dialokasikan pada tanggal reservasi ini.");
    const assets = await repo.lockAssets(scope.ctx, [...chosenAllocations, ...body.unit.map((u) => u.asset_id)]);
    const outstanding = await repo.activeItems(scope.ctx, body.unit.map((u) => u.asset_id));
    for (const unit of body.unit) {
        const asset = assets.find((a) => a.id === String(unit.asset_id)), allocated = assets.find((a) => a.id === String(unit.allocated_asset_id ?? unit.asset_id));
        if (!asset || !allocated || asset.kode_barang !== unit.verification_code && asset.uuid !== unit.verification_code) throw invalid("verification_code", "Kode/QR tidak sesuai unit yang diserahkan.");
        if (asset.dihapuskan || !asset.dapat_dipinjam || !["BAIK", "RUSAK_RINGAN"].includes(asset.kondisi) || ["DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"].includes(asset.status) || outstanding.some((i) => i.asset_id === asset.id) || borrower.role === "R-07" && !asset.boleh_dipinjam_siswa) throw new DomainError("ASSET_NOT_AVAILABLE", "Unit tidak layak atau masih dipinjam.");
        if (asset.category_id !== allocated.category_id || asset.id !== allocated.id && !unit.alasan_substitusi?.trim()) throw invalid("alasan_substitusi", "Substitusi harus sekategori dan disertai alasan.");
        if (unit.kondisi_awal !== asset.kondisi && !unit.alasan_kondisi_awal?.trim()) throw invalid("alasan_kondisi_awal", "Perbedaan kondisi pemeriksaan fisik harus disertai catatan dan diterima penerima sebelum menandatangani.");
    }
    if (body.langsung) {
        const id = await createDirectLoanReservation(scope, { borrower: borrowerId, start: now, end, purpose: body.langsung.keperluan, location: body.langsung.lokasi_penggunaan, reason: body.langsung.alasan, assets: body.unit.map((u) => u.asset_id) }, clock, audit);
        reservation = await lockReservationForLoan(scope, Number(id));
    }
    const booking = new SlotService(clock), held = await daftarSlotTerpakai(scope.tx, "asset", chosenAllocations, { mulai: new Date(Math.min(now.getTime(), reservation!.waktu_mulai.getTime())), selesai: end });
    const assetSlots = held.filter((s) => s.reservation_id === reservation!.id && s.status === "CONFIRMED" && s.origin === "reservation");
    if (!body.langsung && (assetSlots.length !== allocations.length || allocations.some((a) => !assetSlots.some((s) => s.resource_id === a.asset_id)))) throw new DomainError("ASSET_NOT_AVAILABLE", "Slot unit yang dialokasikan tidak lagi terkonfirmasi.");
    const nomor = await new DocumentNumberService(clock).next(scope.tx, "PJM");
    const loan = await repo.createLoan(scope.ctx, { nomor, reservation_id: reservation!.id, peminjam_id: borrowerId, petugas_serah_id: scope.ctx.userId, nama_penerima: body.nama_penerima, diwakilkan: body.diwakilkan, tanggal_pinjam: now, tanggal_jatuh_tempo: end, tanggal_jatuh_tempo_asli: end, kebijakan_denda: policy, signature_file_id: body.signature_file_id, created_by: scope.ctx.userId, updated_by: scope.ctx.userId });
    await attachLoanEvidence(scope, [body.signature_file_id, ...body.unit.flatMap((u) => u.foto_file_ids)], Number(loan.id), body.signature_file_id);
    // CI-03: histori reservasi tetap RELEASED; slot realisasi loan baru aktif dalam transaksi yang sama.
    await booking.release(scope, assetSlots.map((s) => Number(s.id)));
    const slots = await booking.reserve(scope, { sumberDaya: body.unit.map((u) => ({ jenis: "asset", id: u.asset_id })), rentang: { mulai: now, selesai: end }, asal: "loan", status: "CONFIRMED", rujukan: { loanId: Number(loan.id), reservationId: Number(reservation!.id) } });
    await booking.activate(scope, slots.map((s) => Number(s.id)));
    for (const unit of body.unit) {
        const asset = assets.find((a) => a.id === String(unit.asset_id))!;
        const item = await repo.createItem(scope.ctx, { loan_id: loan.id, asset_id: asset.id, allocated_asset_id: unit.allocated_asset_id ?? unit.asset_id, alasan_substitusi: unit.alasan_substitusi ?? null, slot_id: slots.find((s) => s.resource_id === asset.id)!.id, kondisi_awal: unit.kondisi_awal, nilai_perolehan_snapshot: asset.nilai_perolehan });
        await repo.photos(scope.ctx, item, "AWAL", unit.foto_file_ids);
        await repo.setAsset(scope.ctx, asset, unit.kondisi_awal, "DIPINJAM", unit.alasan_kondisi_awal ?? "Serah terima peminjaman", loan.id, now);
        if (asset.id !== String(unit.allocated_asset_id ?? unit.asset_id)) await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_UNIT_SUBSTITUTED", entitas: "loans", entitasId: loan.id, keterangan: unit.alasan_substitusi!, nilaiSebelum: { asset_id: unit.allocated_asset_id }, nilaiSesudah: { asset_id: asset.id } });
    }
    await recordLoanReservationStatus(scope, Number(reservation!.id), "BERLANGSUNG", audit);
    await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_CHECKOUT", entitas: "loans", entitasId: loan.id, ...(body.langsung ? { keterangan: body.langsung.alasan } : {}), nilaiSesudah: { nomor, reservation_id: reservation!.id, peminjam_id: borrowerId, bypass_approval: !!body.langsung, unit: body.unit.map((u) => u.asset_id), kebijakan_denda: policy } });
    await publish(scope, { name: "LoanCheckedOut", aggregateType: "loan", aggregateId: loan.id, payload: { loan_id: Number(loan.id), peminjam_id: borrowerId, nomor, jumlah: body.unit.length, tanggal: end.toISOString() } });
    return { id: loan.id, nomor, status: "DIPINJAM" as const };
}
