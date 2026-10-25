import type { LoanExtension } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { SlotService, daftarSlotTerpakai } from "../../../shared/booking/index.js";
import { BusinessCalendarService } from "../../../shared/calendar/index.js";
import { ApprovalService } from "../../m10-approval/index.js";
import type { PenanganHasil } from "../../m10-approval/index.js";
import { createManagementRepository } from "../repositories/management.repository.js";
import { createLoanRepository } from "../repositories/loan.repository.js";
import type { FinePolicy } from "./fine-calculation.js";
import { syncBorrowerBlock } from "./blocking.service.js";

const invalid = (message: string) => new DomainError("VALIDATION_ERROR", message);
type ExtensionRow = NonNullable<Awaited<ReturnType<ReturnType<typeof createManagementRepository>["extension"]>>>;
export const extensionRow = (e: ExtensionRow): LoanExtension => ({ id: e.id, status: e.status, jatuh_tempo_lama: e.jatuh_tempo_lama.toISOString(), jatuh_tempo_baru: e.jatuh_tempo_baru.toISOString(), alasan: e.alasan, approval_instance_id: e.approval_instance_id, diputuskan_pada: e.diputuskan_pada?.toISOString() ?? null });

function validateLimits(loan: { jumlah_perpanjangan: number; role: string; tanggal_pinjam: Date }, settings: ReadonlyMap<string, unknown>, end: Date) {
 const limit = settings.get("peminjaman.batas_perpanjangan");
 if (typeof limit !== "number" || loan.jumlah_perpanjangan >= limit) throw invalid("Batas perpanjangan tercapai.");
 const max = settings.get(`reservasi.durasi_maksimum_${loan.role.toLowerCase().replaceAll("-", "_")}_hari`) ?? settings.get("reservasi.durasi_maksimum_r_06_hari");
 if (typeof max !== "number" || end.getTime() - loan.tanggal_pinjam.getTime() > max * 86_400_000) throw invalid("Durasi total melebihi batas role peminjam.");
}

export async function requestExtension(scope: TransactionScope, id: number, input: { tanggal_jatuh_tempo: string; alasan: string }, clock: Clock, audit: AuditLogger) {
 const repo = createManagementRepository(scope.tx), loan = await repo.loan(scope.ctx, id, true);
 if (!loan || (scope.ctx.scopeOf("loan.extend") !== "all" && loan.peminjam_id !== String(scope.ctx.userId))) throw new NotFoundError();
 const now = clock.now(), end = new Date(input.tanggal_jatuh_tempo), settings = await repo.settings(scope.ctx);
 if (loan.tanggal_kembali !== null || now >= loan.tanggal_jatuh_tempo || end <= loan.tanggal_jatuh_tempo) throw invalid("Perpanjangan hanya dapat diajukan sebelum jatuh tempo dan harus menambah durasi.");
 validateLimits(loan, settings, end);
 if ((await repo.extensions(scope.ctx, loan.id)).some((e) => e.status === "MENUNGGU_PERSETUJUAN")) throw invalid("Masih ada pengajuan menunggu persetujuan.");
 const items = (await createLoanRepository(scope.tx).items(scope.ctx, loan.id)).filter((i) => i.status_kembali === "BELUM_KEMBALI");
 if (!items.length) throw invalid("Seluruh unit peminjaman sudah dikembalikan.");
 const conflicts = await daftarSlotTerpakai(scope.tx, "asset", items.map((i) => Number(i.asset_id)), { mulai: loan.tanggal_jatuh_tempo, selesai: end });
 if (conflicts.length) throw new DomainError("RESERVATION_CONFLICT", "Unit sudah dipesan pada periode tambahan.", { errors: [{ field: "tanggal_jatuh_tempo", message: `Jatuh tempo maksimum: ${conflicts.reduce((a, b) => a.mulai < b.mulai ? a : b).mulai.toISOString()}` }] });
 const ttl = settings.get("reservasi.ttl_tentative_jam"); if (typeof ttl !== "number") throw invalid("Konfigurasi masa berlaku pengajuan belum lengkap.");
 const expiry = new Date(Math.min(end.getTime(), now.getTime() + ttl * 3_600_000));
 const ext = await repo.createExtension(scope.ctx, loan.id, loan.peminjam_id, loan.tanggal_jatuh_tempo, end, input.alasan, expiry);
 const held = await new SlotService(clock).reserve(scope, { sumberDaya: items.map((i) => ({ jenis: "asset", id: Number(i.asset_id) })), rentang: { mulai: loan.tanggal_jatuh_tempo, selesai: end }, asal: "loan", status: "TENTATIVE", kedaluwarsa: expiry, rujukan: { loanId: id } });
 await repo.holds(scope.ctx, ext.id, items.map((i) => ({ item: i.id, slot: held.find((s) => s.resource_id === i.asset_id)!.id })));
 const approval = await new ApprovalService(scope.tx, audit, clock).createInstance(scope, { jenis: "PERPANJANGAN_PEMINJAMAN", referensiId: Number(ext.id), pemohonId: Number(loan.peminjam_id), fakta: { requester_role: loan.role, requester_id: Number(loan.peminjam_id), requester_has_overdue: (await repo.debt(scope.ctx, Number(loan.peminjam_id), now)).overdue.length > 0, duration_days: Math.ceil((end.getTime() - loan.tanggal_pinjam.getTime()) / 86_400_000) } });
 await repo.setInstance(scope.ctx, ext.id, approval.instanceId);
 await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_EXTENSION_REQUESTED", entitas: "loan_extensions", entitasId: ext.id, keterangan: input.alasan, nilaiSesudah: { loan_id: id, jatuh_tempo_lama: ext.jatuh_tempo_lama, jatuh_tempo_baru: end, approval_instance_id: approval.instanceId } });
 return extensionRow((await repo.extension(scope.ctx, Number(ext.id)))!);
}
async function lockExtension(scope: TransactionScope, id: number) {
 const repo = createManagementRepository(scope.tx), reference = await repo.extension(scope.ctx, id); if (!reference) throw new NotFoundError();
 const loan = await repo.loan(scope.ctx, Number(reference.loan_id), true), ext = await repo.extension(scope.ctx, id);
 if (!loan || !ext || ext.status !== "MENUNGGU_PERSETUJUAN") throw new DomainError("APPROVAL_ALREADY_DECIDED", "Perpanjangan sudah ditutup atau diputuskan.");
 return { loan, ext, repo };
}
export function extensionOutcome(clock: Clock, audit: AuditLogger): PenanganHasil {
 return { jenis: "PERPANJANGAN_PEMINJAMAN", kunciObjek: async (scope, id) => { await lockExtension(scope, id); },
  async sebelumDisetujui(scope, id) {
   const { loan, ext, repo } = await lockExtension(scope, id), now = clock.now(), slots = new SlotService(clock);
   if (ext.kedaluwarsa_pada <= now || loan.tanggal_kembali !== null || ext.jatuh_tempo_baru <= now || ext.jatuh_tempo_lama.getTime() !== loan.tanggal_jatuh_tempo.getTime()) throw invalid("Peminjaman sudah selesai atau jadwal perpanjangan sudah lewat/berubah.");
   validateLimits(loan, await repo.settings(scope.ctx), ext.jatuh_tempo_baru);
   const holds = await repo.extensionItems(scope.ctx, ext.id), active = holds.filter((i) => i.status_kembali === "BELUM_KEMBALI");
   const booked = await daftarSlotTerpakai(scope.tx, "asset", active.map((i) => Number(i.asset_id)), { mulai: ext.jatuh_tempo_lama, selesai: ext.jatuh_tempo_baru });
   if (!active.length || active.some((i) => !booked.some((s) => s.id === i.slot_id && s.status === "TENTATIVE")) || booked.some((s) => !holds.some((h) => h.slot_id === s.id))) throw new DomainError("RESERVATION_CONFLICT", "Slot tambahan tidak lagi tersedia atau pengajuan telah kedaluwarsa.");
   await createLoanRepository(scope.tx).lockAssets(scope.ctx, active.map((i) => Number(i.asset_id)));
   const days = await new BusinessCalendarService().countCalendarDays(scope.tx, loan.tanggal_jatuh_tempo, now, { excludeHolidays: (loan.kebijakan_denda as FinePolicy).excludeHolidays });
   await repo.accrueDays(scope.ctx, active.map((i) => i.item_id), days);
   await slots.release(scope, holds.map((i) => Number(i.slot_id))); await slots.extendActive(scope, active.map((i) => Number(i.active_slot_id)), ext.jatuh_tempo_baru);
   await repo.extendLoan(scope.ctx, loan.id, ext.jatuh_tempo_baru); await repo.extensionStatus(scope.ctx, ext.id, "DISETUJUI", now);
   await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_EXTENDED", entitas: "loans", entitasId: loan.id, keterangan: ext.alasan, nilaiSebelum: { tanggal_jatuh_tempo: loan.tanggal_jatuh_tempo }, nilaiSesudah: { tanggal_jatuh_tempo: ext.jatuh_tempo_baru, extension_id: ext.id, hari_terlambat_disimpan: days } });
   await syncBorrowerBlock(scope, Number(loan.peminjam_id), clock, audit);
  },
  async setelahDitutup(scope, id, status) { const { ext, repo } = await lockExtension(scope, id); await new SlotService(clock).release(scope, (await repo.extensionItems(scope.ctx, ext.id)).map((i) => Number(i.slot_id))); await repo.extensionStatus(scope.ctx, ext.id, status, clock.now()); await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_EXTENSION_CLOSED", entitas: "loan_extensions", entitasId: ext.id, nilaiSesudah: { status } }); },
 };
}
/** Dipanggil check-in di bawah kunci loan; hold dan instance ditutup pada transaksi yang sama. */
export async function closePendingExtensions(scope: TransactionScope, loanId: string, status: "DIBATALKAN" | "KEDALUWARSA", clock: Clock, audit: AuditLogger) {
 const repo = createManagementRepository(scope.tx), pending = (await repo.extensions(scope.ctx, loanId)).filter((e) => e.status === "MENUNGGU_PERSETUJUAN");
 for (const ext of pending) {
  await new ApprovalService(scope.tx, audit, clock).tutupKarenaObjek(scope, "PERPANJANGAN_PEMINJAMAN", Number(ext.id));
  await new SlotService(clock).release(scope, (await repo.extensionItems(scope.ctx, ext.id)).map((i) => Number(i.slot_id)));
  await repo.extensionStatus(scope.ctx, ext.id, status, clock.now());
  await audit.write(scope, { modul: "m09-loans", aksi: "LOAN_EXTENSION_CLOSED", entitas: "loan_extensions", entitasId: ext.id, keterangan: status === "DIBATALKAN" ? "Unit dikembalikan sebelum keputusan perpanjangan." : "TTL slot tambahan berakhir.", nilaiSesudah: { status } });
 }
}
