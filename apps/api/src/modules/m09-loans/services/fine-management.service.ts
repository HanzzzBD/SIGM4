import type { FineDetail } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { createManagementRepository } from "../repositories/management.repository.js";
import { borrowerBlock, syncBorrowerBlock } from "./blocking.service.js";
import { tanggalWib } from "../../m07-reservation-room/index.js";
import { cents, money } from "./fine-calculation.js";

const invalid = (message: string) => new DomainError("VALIDATION_ERROR", message);
type FineRow = NonNullable<Awaited<ReturnType<ReturnType<typeof createManagementRepository>["fine"]>>>;
export const fineRow = (f: FineRow) => ({ id: f.id, loan_id: f.loan_id, loan_item_id: f.loan_item_id, nomor_peminjaman: f.nomor_peminjaman, kode_barang: f.kode_barang, nama_aset: f.nama_aset, peminjam: { id: f.peminjam_id, nama: f.peminjam_nama }, jenis: f.jenis, status: f.status, jumlah: f.jumlah, jumlah_dibebaskan: f.jumlah_dibebaskan, sisa: f.jumlah === null ? null : ["LUNAS", "DIBEBASKAN"].includes(f.status) ? "0.00" : money(cents(f.jumlah) - cents(f.jumlah_dibebaskan)), menunggu_penetapan: f.menunggu_penetapan, hari_terlambat: f.hari_terlambat, tarif_per_hari: f.tarif_per_hari, jumlah_sebelum_cap: f.jumlah_sebelum_cap, created_at: f.created_at.toISOString(), tanggal_bayar: f.tanggal_bayar?.toISOString() ?? null, nomor_bukti: f.nomor_bukti });
export async function fineDetail(scope: TransactionScope, id: number, clock: Clock): Promise<FineDetail> {
 const repo = createManagementRepository(scope.tx), f = await repo.fine(scope.ctx, id); if (!f) throw new NotFoundError();
 const [actions, proposals, block] = await Promise.all([repo.actions(scope.ctx, f.id), repo.proposals(scope.ctx, f.id), borrowerBlock(scope, Number(f.peminjam_id), clock)]);
 const open = ["BELUM_DIBAYAR", "DIBEBASKAN_SEBAGIAN"].includes(f.status), known = open && !f.menunggu_penetapan, permitted = (permission: string) => scope.ctx.can(permission) && (scope.ctx.scopeOf(permission) === "all" || String(scope.ctx.userId) === f.peminjam_id);
 return { ...fineRow(f), blokir: block,
  aksi: { bayar: known && permitted("fine.manage"), bebaskan: known && f.jenis === "KETERLAMBATAN" && permitted("fine.waive"), bebaskan_ganti_rugi: known && f.jenis === "GANTI_RUGI" && scope.ctx.roleCode === "R-03" && permitted("fine.waive_compensation"), usulkan_nilai: open && f.menunggu_penetapan && permitted("fine.manage") && !proposals.some((p) => p.status === "MENUNGGU"), putuskan_nilai: open && f.menunggu_penetapan && scope.ctx.roleCode === "R-03" && permitted("approval.decide") && proposals.some((p) => p.status === "MENUNGGU" && p.diusulkan_oleh !== String(scope.ctx.userId)), buka_kembali: !f.peminjam_pseudonymized_at && f.status === "LUNAS" && scope.ctx.roleCode === "R-01" && permitted("fine.manage") },
  riwayat: actions.map((a) => ({ ...a, pada: a.pada.toISOString() })), usulan: proposals.map((p) => ({ id: p.id, jumlah: p.jumlah, alasan: p.alasan, status: p.status, pengusul: p.pengusul, diusulkan_oleh: p.diusulkan_oleh, diputuskan_oleh: p.diputuskan_oleh, diusulkan_pada: p.diusulkan_pada.toISOString(), diputuskan_pada: p.diputuskan_pada?.toISOString() ?? null, catatan_keputusan: p.catatan_keputusan })) };
}
export async function changeFine(scope: TransactionScope, id: number, action: "pay" | "waive" | "waive-compensation" | "reopen", input: { alasan?: string; jumlah?: string; tanggal_bayar?: string; nomor_bukti?: string }, clock: Clock, audit: AuditLogger) {
 const permission = action === "waive" ? "fine.waive" : action === "waive-compensation" ? "fine.waive_compensation" : "fine.manage";
 if ((action === "waive-compensation" && scope.ctx.roleCode !== "R-03") || (action === "reopen" && scope.ctx.roleCode !== "R-01")) throw new ForbiddenError();
 const repo = createManagementRepository(scope.tx), f = await repo.fine(scope.ctx, id, permission, true); if (!f) throw new NotFoundError();
 if (action === "reopen") { if (f.status !== "LUNAS") throw invalid("Hanya kewajiban lunas yang dapat dibuka kembali."); if ((await repo.lockPrivacyBorrower(scope.ctx, f.peminjam_id)).pseudonymized_at) throw invalid("Kewajiban akun yang telah dipseudonimkan tidak dapat dibuka kembali."); await repo.reopen(scope.ctx, f.id, cents(f.jumlah_dibebaskan) > 0n); }
 else {
  if (!["BELUM_DIBAYAR", "DIBEBASKAN_SEBAGIAN"].includes(f.status) || f.menunggu_penetapan || f.jumlah === null) throw invalid("Kewajiban sudah diselesaikan atau menunggu penetapan nilai.");
  if ((action === "waive" && f.jenis !== "KETERLAMBATAN") || (action === "waive-compensation" && f.jenis !== "GANTI_RUGI")) throw new ForbiddenError();
  const balance = cents(f.jumlah) - cents(f.jumlah_dibebaskan);
  if (action === "pay") { const date = new Date(input.tanggal_bayar!); if (date > clock.now() || tanggalWib(date) < tanggalWib(f.created_at)) throw invalid("Tanggal pembayaran harus antara penerbitan kewajiban dan waktu saat ini."); await repo.pay(scope.ctx, f.id, date, input.nomor_bukti!); }
  else { const amount = action === "waive" ? balance : cents(input.jumlah!); if (amount <= 0n || amount > balance) throw invalid("Nominal pembebasan harus lebih dari nol dan tidak melebihi sisa tagihan."); await repo.waive(scope.ctx, f.id, money(cents(f.jumlah_dibebaskan) + amount), amount === balance, input.alasan!); }
 }
 const updated = (await repo.fine(scope.ctx, id, permission))!, label = action === "reopen" ? "FINE_REOPENED" : action === "pay" ? "FINE_PAID" : action === "waive-compensation" ? "COMPENSATION_WAIVED" : "FINE_WAIVED";
 const amount = action === "pay" ? money(cents(f.jumlah!) - cents(f.jumlah_dibebaskan)) : action === "reopen" ? null : money(cents(updated.jumlah_dibebaskan) - cents(f.jumlah_dibebaskan));
 await repo.action(scope.ctx, f.id, action === "reopen" ? "DIBUKA_KEMBALI" : label, amount, input.alasan ?? input.nomor_bukti ?? null, clock.now());
 await audit.write(scope, { modul: "m09-loans", aksi: label, entitas: "fines", entitasId: f.id, keterangan: input.alasan ?? input.nomor_bukti ?? "Perubahan kewajiban", nilaiSebelum: fineRow(f), nilaiSesudah: fineRow(updated) });
 if (action !== "reopen") await publish(scope, { name: action === "pay" ? "FinePaid" : "FineWaived", aggregateType: "fine", aggregateId: f.id, payload: { fine_id: id, peminjam_id: Number(f.peminjam_id), jumlah: amount, jumlah_dibebaskan: amount, sisa: action === "pay" ? "0.00" : fineRow(updated).sisa, alasan: input.alasan ?? null } });
 await syncBorrowerBlock(scope, Number(f.peminjam_id), clock, audit);
 return { id: f.id, status: updated.status };
}
export async function proposeCompensation(scope: TransactionScope, id: number, input: { jumlah: string; alasan: string }, clock: Clock, audit: AuditLogger) {
 const repo = createManagementRepository(scope.tx), f = await repo.fine(scope.ctx, id, "fine.manage", true); if (!f) throw new NotFoundError();
 if (!f.menunggu_penetapan || f.jenis !== "GANTI_RUGI" || !["BELUM_DIBAYAR", "DIBEBASKAN_SEBAGIAN"].includes(f.status) || (await repo.proposals(scope.ctx, f.id)).some((p) => p.status === "MENUNGGU")) throw invalid("Kewajiban tidak menunggu nilai atau masih mempunyai usulan tertunda.");
 const proposal = await repo.propose(scope.ctx, f.id, money(cents(input.jumlah)), input.alasan, clock.now());
 await repo.action(scope.ctx, f.id, "COMPENSATION_PROPOSED", proposal.jumlah, input.alasan, clock.now());
 await audit.write(scope, { modul: "m09-loans", aksi: "COMPENSATION_PROPOSED", entitas: "fines", entitasId: f.id, keterangan: input.alasan, nilaiSesudah: { proposal_id: proposal.id, jumlah: proposal.jumlah } });
 return { id: proposal.id, status: proposal.status };
}
export async function decideCompensation(scope: TransactionScope, id: number, proposalId: number, input: { keputusan: "DISETUJUI" | "DITOLAK"; catatan: string }, clock: Clock, audit: AuditLogger) {
 if (scope.ctx.roleCode !== "R-03") throw new ForbiddenError();
 const repo = createManagementRepository(scope.tx), f = await repo.fine(scope.ctx, id, "approval.decide", true); if (!f) throw new NotFoundError();
 const proposal = await repo.proposal(scope.ctx, proposalId, f.id); if (!proposal) throw new NotFoundError();
 if (proposal.diusulkan_oleh === String(scope.ctx.userId)) throw new ForbiddenError();
 if (proposal.status !== "MENUNGGU" || !f.menunggu_penetapan) throw invalid("Usulan sudah diputuskan atau kewajiban tidak lagi menunggu nilai.");
 await repo.decideProposal(scope.ctx, proposal.id, input.keputusan, input.catatan, clock.now());
 if (input.keputusan === "DISETUJUI") await repo.setAmount(scope.ctx, f.id, proposal.jumlah);
 await repo.action(scope.ctx, f.id, "COMPENSATION_DECIDED", proposal.jumlah, input.catatan, clock.now());
 await audit.write(scope, { modul: "m09-loans", aksi: "COMPENSATION_DECIDED", entitas: "fines", entitasId: f.id, keterangan: input.catatan, nilaiSebelum: { jumlah: f.jumlah }, nilaiSesudah: { proposal_id: proposal.id, keputusan: input.keputusan, jumlah: input.keputusan === "DISETUJUI" ? proposal.jumlah : null } });
 if (input.keputusan === "DISETUJUI") await publish(scope, { name: "FineIssued", aggregateType: "fine", aggregateId: f.id, payload: { fine_id: id, loan_id: Number(f.loan_id), peminjam_id: Number(f.peminjam_id), nomor: f.nomor_peminjaman, jumlah: proposal.jumlah, jenis: "GANTI_RUGI", menunggu_penetapan: false } });
 await syncBorrowerBlock(scope, Number(f.peminjam_id), clock, audit);
 return { id: proposal.id, status: input.keputusan };
}
