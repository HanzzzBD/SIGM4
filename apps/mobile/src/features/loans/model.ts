// Logika murni peminjaman & kewajiban mobile (FR-09.x) — label, nada status, dan isian yang sama dengan web P-32…P-36.
import { LoanExtendBodySchema } from "@sigm4/schemas";
import type { FineDetail, LoanDetail } from "@sigm4/schemas";
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
