import { createManagementRepository } from "../repositories/management.repository.js";
import { extensionRow } from "./extension.service.js";
import { estimateLoan } from "./monitoring.service.js";
import type { LoanDetail } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";
import { urlUnduhBerkas } from "../../m06-documents/index.js";
import { createLoanRepository } from "../repositories/loan.repository.js";

export async function loanDetail(scope: TransactionScope, id: number, storage: PenyimpananObjek, clock: Clock, manage = false): Promise<LoanDetail> {
    const repo = createLoanRepository(scope.tx), loan = manage ? await repo.loanReference(scope.ctx, id) : await repo.loan(scope.ctx, id);
    if (!loan) throw new NotFoundError();
    const [items, photos, fines, signature] = await Promise.all([repo.items(scope.ctx, loan.id), repo.itemPhotos(scope.ctx, loan.id), repo.fines(scope.ctx, loan.id), loan.signature_file_id === null ? undefined : repo.signature(scope.ctx, loan.signature_file_id)]);
    const photo = async (f: { file_id: string; object_key: string; scan_status: "PENDING" | "CLEAN" | "INFECTED" | "FAILED" }) => ({ file_id: f.file_id, status: f.scan_status, url: f.scan_status === "CLEAN" ? (await urlUnduhBerkas(storage, clock, f)).url : null });
    const management = createManagementRepository(scope.tx), extensions = await management.extensions(scope.ctx, loan.id), settings = await management.settings(scope.ctx);
    const mapped = await Promise.all(photos.map(async (f) => ({ ...await photo(f), item: f.loan_item_id, phase: f.tahap })));
    return {
        id: loan.id, nomor: loan.nomor, reservation_id: loan.reservation_id, nomor_reservasi: loan.nomor_reservasi,
        peminjam: { id: loan.peminjam_id, nama: loan.peminjam_nama }, petugas: { id: loan.petugas_serah_id, nama: loan.petugas_nama },
        nama_penerima: loan.nama_penerima, diwakilkan: loan.diwakilkan, bypass_approval: loan.bypass_approval, alasan_bypass: loan.alasan_bypass,
        tanggal_pinjam: loan.tanggal_pinjam.toISOString(), tanggal_jatuh_tempo: loan.tanggal_jatuh_tempo.toISOString(), tanggal_kembali: loan.tanggal_kembali?.toISOString() ?? null, status: loan.tanggal_kembali === null && loan.tanggal_jatuh_tempo < clock.now() ? "TERLAMBAT" : loan.status,
        tanggal_jatuh_tempo_asli: (loan.tanggal_jatuh_tempo_asli ?? loan.tanggal_jatuh_tempo).toISOString(), jumlah_perpanjangan: loan.jumlah_perpanjangan, perpanjangan: extensions.map(extensionRow), estimasi_denda: (await estimateLoan(scope, loan, clock)).estimasi_denda,
        signature: signature ? await photo(signature) : null, aksi: { perpanjang: scope.ctx.can("loan.extend") && (scope.ctx.scopeOf("loan.extend") === "all" || loan.peminjam_id === String(scope.ctx.userId)) && loan.tanggal_kembali === null && loan.tanggal_jatuh_tempo > clock.now() && loan.jumlah_perpanjangan < Number(settings.get("peminjaman.batas_perpanjangan")) && !extensions.some((e) => e.status === "MENUNGGU_PERSETUJUAN"), checkin: scope.ctx.can("loan.manage") && (scope.ctx.scopeOf("loan.manage") === "all" || loan.peminjam_id === String(scope.ctx.userId)) && !["DIKEMBALIKAN", "HILANG"].includes(loan.status) },
        unit: items.map((i) => ({ id: i.id, asset_id: i.asset_id, uuid: i.uuid, kode_barang: i.kode_barang, nama: i.nama, category_id: i.category_id, allocated_asset_id: i.allocated_asset_id, alasan_substitusi: i.alasan_substitusi, kondisi_awal: i.kondisi_awal, kondisi_akhir: i.kondisi_akhir, tidak_lengkap: i.tidak_lengkap, status_kembali: i.status_kembali, tanggal_kembali: i.tanggal_kembali?.toISOString() ?? null, catatan: i.catatan_pengembalian, damage_report_id: i.damage_report_id, foto_awal: mapped.filter((f) => f.item === i.id && f.phase === "AWAL").map(({ file_id, status, url }) => ({ file_id, status, url })), foto_akhir: mapped.filter((f) => f.item === i.id && f.phase === "AKHIR").map(({ file_id, status, url }) => ({ file_id, status, url })), denda: fines.filter((f) => f.loan_item_id === i.id).map((f) => ({ id: f.id, jenis: f.jenis, jumlah: f.jumlah, hari_terlambat: f.hari_terlambat, tarif_per_hari: f.tarif_per_hari, jumlah_sebelum_cap: f.jumlah_sebelum_cap, status: f.status, menunggu_penetapan: f.menunggu_penetapan })) })),
    };
}
export async function readyCheckout(scope: TransactionScope, clock: Clock, page: number, perPage: number, reservationId?: number) {
    const day = new Date(clock.now().getTime() + 7 * 3_600_000).toISOString().slice(0, 10), start = new Date(`${day}T00:00:00+07:00`), end = new Date(start.getTime() + 86_400_000);
    const repo = createLoanRepository(scope.tx), rows = await repo.ready(scope.ctx, start, end, page, perPage, reservationId, clock.now()), total = Number(rows[0]?.total ?? 0);
    return { data: await Promise.all(rows.map(async (r) => ({ id: r.id, nomor: r.nomor, peminjam: { id: r.pemohon_id, nama: r.nama }, waktu_mulai: r.waktu_mulai.toISOString(), waktu_selesai: r.waktu_selesai.toISOString(), lokasi_penggunaan: r.lokasi_penggunaan, unit: await repo.readyUnits(scope.ctx, r.id) }))), meta: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) } };
}
