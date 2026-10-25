// Logika murni peminjaman & kewajiban mobile (FR-09.x) — label, nada status, dan isian yang sama dengan web P-32…P-36.
import { CompensationDecisionBodySchema, CompensationProposalBodySchema, CompensationWaiveBodySchema, FinePayBodySchema, FineWaiveBodySchema, LoanCheckinBodySchema, LoanCheckoutBodySchema, LoanExtendBodySchema } from "@sigm4/schemas";
import type { FineDetail, LoanCheckinBody, LoanCheckoutBody, LoanDetail } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui/status";
import { isoWib, rupiah, validDate, validTime } from "../../shared/wib";

export const LOAN_LABEL = { DIPINJAM: "Dipinjam", SEBAGIAN_DIKEMBALIKAN: "Sebagian Dikembalikan", DIKEMBALIKAN: "Dikembalikan", TERLAMBAT: "Terlambat", HILANG: "Hilang" } as const;
export type LoanStatus = keyof typeof LOAN_LABEL;
/** FOUNDATIONS §1.8: Dipinjam informasi, Terlambat/Hilang galat, Dikembalikan sukses. */
export const LOAN_TONE: Readonly<Record<LoanStatus, StatusTone>> = { DIPINJAM: "info", SEBAGIAN_DIKEMBALIKAN: "info", DIKEMBALIKAN: "success", TERLAMBAT: "error", HILANG: "error" };
export const loanLabel = (status: string) => (LOAN_LABEL as Readonly<Record<string, string>>)[status] ?? status;
export const loanTone = (status: string): StatusTone => (LOAN_TONE as Readonly<Record<string, StatusTone>>)[status] ?? "pending";
export const LOAN_TABS = [{ value: "aktif", label: "Aktif" }, { value: "akan_jatuh_tempo", label: "Akan Jatuh Tempo" }, { value: "terlambat", label: "Terlambat" }, { value: "selesai", label: "Selesai" }] as const;

export const FINE_LABEL = { BELUM_DIBAYAR: "Belum Dibayar", LUNAS: "Lunas", DIBEBASKAN: "Dibebaskan", DIBEBASKAN_SEBAGIAN: "Dibebaskan Sebagian" } as const;
export type FineStatus = keyof typeof FINE_LABEL;
/** Lunas/Dibebaskan sukses; sisa tagihan peringatan (FOUNDATIONS: "Dibebaskan Sebagian" warning). */
export const FINE_TONE: Readonly<Record<FineStatus, StatusTone>> = { BELUM_DIBAYAR: "warning", LUNAS: "success", DIBEBASKAN: "success", DIBEBASKAN_SEBAGIAN: "warning" };
export const fineKind = (jenis: "KETERLAMBATAN" | "GANTI_RUGI") => jenis === "GANTI_RUGI" ? "Ganti Rugi" : "Denda Keterlambatan";

/** Rincian BR-028/BR-028b: hari × tarif = sebelum cap; penanda bila cap berlaku. */
export function fineBreakdown(f: Pick<FineDetail, "jenis" | "menunggu_penetapan" | "hari_terlambat" | "tarif_per_hari" | "jumlah_sebelum_cap" | "jumlah">): string[] {
    if (f.menunggu_penetapan) return ["Nilai perolehan tidak diketahui; menunggu penetapan nilai penggantian."];
    if (f.jenis !== "KETERLAMBATAN") return [`Ganti rugi ${rupiah(f.jumlah)}`];
    return [`${f.hari_terlambat} hari × ${rupiah(f.tarif_per_hari)} = ${rupiah(f.jumlah_sebelum_cap)}`, ...(f.jumlah !== f.jumlah_sebelum_cap ? [`Batas maksimum diterapkan: ${rupiah(f.jumlah)}`] : [])];
}

export const EXTENSION_LABEL: Readonly<Record<string, string>> = { MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", DISETUJUI: "Disetujui", DITOLAK: "Ditolak", PERLU_REVISI: "Perlu Revisi", KEDALUWARSA: "Kedaluwarsa", DIBATALKAN: "Dibatalkan" };
export const CONDITION_LABEL: Readonly<Record<string, string>> = { BAIK: "Baik", RUSAK_RINGAN: "Rusak Ringan", RUSAK_BERAT: "Rusak Berat", TIDAK_LENGKAP: "Tidak Lengkap", HILANG: "Hilang" };
export function unitState(u: Pick<LoanDetail["unit"][number], "status_kembali" | "kondisi_akhir" | "tidak_lengkap">): { label: string; tone: StatusTone } {
    if (u.status_kembali === "BELUM_KEMBALI") return { label: "Belum kembali", tone: "info" };
    if (u.status_kembali === "HILANG") return { label: "Hilang", tone: "error" };
    const condition = u.tidak_lengkap ? "TIDAK_LENGKAP" : u.kondisi_akhir ?? "BAIK";
    return { label: `Kembali · ${CONDITION_LABEL[condition] ?? condition}`, tone: condition === "BAIK" ? "success" : "warning" };
}

/** MS-13 (FR-09.5): tanggal & jam WIB baru + alasan; harus sesudah jatuh tempo kini — batas atas diputus server (A1). */
export function extensionBody(date: string, time: string, reason: string, currentDue: string): { body: { tanggal_jatuh_tempo: string; alasan: string } } | { error: string } {
    if (!validDate(date) || !validTime(time)) return { error: "Pilih tanggal dan jam jatuh tempo baru." };
    const due = isoWib(date, time);
    if (Date.parse(due) <= Date.parse(currentDue)) return { error: "Jatuh tempo baru harus sesudah jatuh tempo saat ini." };
    const parsed = LoanExtendBodySchema.safeParse({ tanggal_jatuh_tempo: due, alasan: reason });
    return parsed.success ? { body: parsed.data } : { error: parsed.error.issues.map((i) => i.message).join(" ") };
}

export interface HandoverUnit { key: string; allocated?: string; expected?: string; code: string; resolved: { asset_id: string; kode_barang: string; kondisi: string; layak: boolean } | null; reason: string; photos: readonly number[]; condition: "BAIK" | "RUSAK_RINGAN"; note: string }
export interface DirectLoan { borrower: string; dueDate: string; dueTime: string; purpose: string; location: string; reason: string }
/**
 * MS-10 (FR-09.1, BR-027): seluruh unit terverifikasi & layak, ≥1 foto per unit, tanda tangan PNG terunggah;
 * substitusi beralasan (A1); catatan bila kondisi berbeda dari data. Bukti diunggah sebelum transaksi (keputusan paket 2).
 */
export function checkoutBody(input: { reservationId: string | null; direct: DirectLoan | null; units: readonly HandoverUnit[]; recipient: string; proxy: boolean; signature: number | null }): { body: LoanCheckoutBody } | { error: string } {
    if (input.units.some((u) => !u.resolved?.layak)) return { error: "Verifikasi seluruh unit dan pastikan unit layak dipinjam." };
    if (input.units.some((u) => u.photos.length === 0)) return { error: "Unggah minimal satu foto kondisi per unit." };
    if (input.signature === null) return { error: "Simpan tanda tangan penerima lebih dulu." };
    if (input.direct && !input.direct.borrower) return { error: "Pilih peminjam aktif." };
    const parsed = LoanCheckoutBodySchema.safeParse({
        ...(input.direct ? { langsung: { peminjam_id: Number(input.direct.borrower), tanggal_jatuh_tempo: isoWib(input.direct.dueDate, input.direct.dueTime), keperluan: input.direct.purpose, lokasi_penggunaan: input.direct.location, alasan: input.direct.reason } } : { reservation_id: Number(input.reservationId) }),
        nama_penerima: input.recipient, diwakilkan: input.proxy, signature_file_id: input.signature,
        unit: input.units.map((u) => ({ asset_id: Number(u.resolved!.asset_id), ...(u.allocated ? { allocated_asset_id: Number(u.allocated) } : {}), verification_code: u.code.trim(), kondisi_awal: u.condition, ...(u.note.trim() ? { alasan_kondisi_awal: u.note.trim() } : {}), foto_file_ids: [...u.photos], ...(u.allocated && u.allocated !== u.resolved!.asset_id ? { alasan_substitusi: u.reason } : {}) })),
    });
    return parsed.success ? { body: parsed.data } : { error: parsed.error.issues.map((i) => i.message).join(" ") };
}
/** Unit berbeda dari alokasi menuntut alasan substitusi (FR-09.1 A1); kondisi berbeda dari data menuntut catatan. */
export const needsSubstitutionReason = (u: Pick<HandoverUnit, "allocated" | "resolved">) => !!u.allocated && !!u.resolved && u.allocated !== u.resolved.asset_id;
export const needsConditionNote = (u: Pick<HandoverUnit, "resolved" | "condition">) => !!u.resolved && u.condition !== u.resolved.kondisi;

export const RETURN_CONDITIONS = [{ value: "BAIK", label: "Baik" }, { value: "RUSAK_RINGAN", label: "Rusak Ringan" }, { value: "RUSAK_BERAT", label: "Rusak Berat" }, { value: "TIDAK_LENGKAP", label: "Tidak Lengkap" }, { value: "HILANG", label: "Hilang" }] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number]["value"];
export interface ReturnRow { id: string; selected: boolean; code: string; condition: ReturnCondition; photos: readonly number[]; note: string; negligence: boolean }
/** MS-11 (FR-09.2): unit terpilih saja (pengembalian sebagian, A3); catatan wajib bila tidak Baik atau lalai. */
export function checkinBody(rows: readonly ReturnRow[]): { body: LoanCheckinBody } | { error: string } {
    const chosen = rows.filter((r) => r.selected);
    if (chosen.length === 0) return { error: "Pilih minimal satu unit yang dikembalikan." };
    const parsed = LoanCheckinBodySchema.safeParse({ unit: chosen.map((r) => ({ loan_item_id: Number(r.id), verification_code: r.code.trim(), kondisi_akhir: r.condition, foto_file_ids: [...r.photos], catatan: r.note, kelalaian: r.negligence })) });
    if (parsed.success) return { body: parsed.data };
    const issue = parsed.error.issues[0], index = Number(issue?.path[1] ?? 0) + 1, field = issue?.path.at(-1);
    return { error: `Unit ${index}: ${field === "catatan" ? "isi catatan kondisi pengembalian." : field === "verification_code" ? "masukkan atau pindai kode aset." : field === "foto_file_ids" ? "unggah minimal satu foto." : issue?.message ?? "periksa isian."}` };
}

/** Aksi kewajiban MS-53 dari flag server (`aksi`) — petugas berwenang (FR-09.4). */
export const FINE_ACTIONS = [["pay", "Tandai Lunas", "bayar"], ["waive", "Bebaskan Denda", "bebaskan"], ["waive-compensation", "Bebaskan Ganti Rugi", "bebaskan_ganti_rugi"], ["reopen", "Buka Kembali", "buka_kembali"], ["propose", "Usulkan Nilai Penggantian", "usulkan_nilai"], ["approve", "Setujui Nilai", "putuskan_nilai"], ["reject", "Tolak Nilai", "putuskan_nilai"]] as const;
export type FineAction = (typeof FINE_ACTIONS)[number][0];
export function fineActions(aksi: FineDetail["aksi"]) { return FINE_ACTIONS.filter(([, , flag]) => aksi[flag]).map(([action, label]) => ({ action, label })); }
export function fineActionBody(action: FineAction, input: { date: string; proof: string; reason: string; amount: string }): { body: unknown } | { error: string } {
    const [schema, body] = action === "pay" ? [FinePayBodySchema, { tanggal_bayar: isoWib(input.date, "00:00"), nomor_bukti: input.proof }] as const
        : action === "approve" || action === "reject" ? [CompensationDecisionBodySchema, { keputusan: action === "approve" ? "DISETUJUI" : "DITOLAK", catatan: input.reason }] as const
        : action === "waive-compensation" ? [CompensationWaiveBodySchema, { alasan: input.reason, jumlah: input.amount.trim() }] as const
        : action === "propose" ? [CompensationProposalBodySchema, { alasan: input.reason, jumlah: input.amount.trim() }] as const
        : [FineWaiveBodySchema, { alasan: input.reason }] as const;
    const parsed = schema.safeParse(body);
    return parsed.success ? { body: parsed.data } : { error: parsed.error.issues.map((i) => i.message).join(" ") };
}
