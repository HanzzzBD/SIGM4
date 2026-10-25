// Logika murni inventaris mobile (FR-04.1…04.5, FR-06.1; MS-33…36, MS-39) — aturan sama dengan web P-15…P-21, P-26.
import { MoveAssetsBodySchema } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui/status";

export const CONDITIONS = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const;
export const STATUSES = ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"] as const;
export type Condition = (typeof CONDITIONS)[number];
export type AssetStatus = (typeof STATUSES)[number];
export const CONDITION_LABEL: Readonly<Record<Condition, string>> = { BAIK: "Baik", RUSAK_RINGAN: "Rusak Ringan", RUSAK_BERAT: "Rusak Berat", HILANG: "Hilang" };
export const STATUS_LABEL: Readonly<Record<AssetStatus, string>> = { TERSEDIA: "Tersedia", DIRESERVASI: "Direservasi", DIPINJAM: "Dipinjam", DALAM_PERBAIKAN: "Dalam Perbaikan", TIDAK_TERSEDIA: "Tidak Tersedia" };
/** Varian web C-13: kondisi & status aset → nada berikon (FOUNDATIONS §1.8). */
export const CONDITION_TONE: Readonly<Record<Condition, StatusTone>> = { BAIK: "success", RUSAK_RINGAN: "warning", RUSAK_BERAT: "error", HILANG: "error" };
export const STATUS_TONE: Readonly<Record<AssetStatus, StatusTone>> = { TERSEDIA: "success", DIRESERVASI: "warning", DIPINJAM: "info", DALAM_PERBAIKAN: "info", TIDAK_TERSEDIA: "error" };
export const SOURCES = [{ value: "PEMBELIAN", label: "Pembelian" }, { value: "HIBAH", label: "Hibah" }, { value: "BANTUAN_PEMERINTAH", label: "Bantuan Pemerintah" }, { value: "SUMBANGAN", label: "Sumbangan" }, { value: "LAINNYA", label: "Lainnya" }] as const;
export type Source = (typeof SOURCES)[number]["value"];

const text = (v: string) => v.trim() === "" ? null : v.trim();
const num = (v: string) => v.trim() === "" ? null : Number(v);
export interface AssetForm { nama: string; category: string; merek: string; model: string; seri: string; tahun: string; sumber: Source; nilai: string; room: string; kondisi: Condition; pinjam: boolean; siswa: boolean; pj: string; jumlah: string; alasan: string; refJenis: string; refId: string }
export const EMPTY_FORM: AssetForm = { nama: "", category: "", merek: "", model: "", seri: "", tahun: "", sumber: "PEMBELIAN", nilai: "", room: "", kondisi: "BAIK", pinjam: false, siswa: false, pj: "", jumlah: "1", alasan: "", refJenis: "", refId: "" };

/** Pemeriksaan klien sama dengan web (periksaUbah); keputusan akhir tetap milik server. */
export function formProblems(f: AssetForm, mode: { create: boolean; oldCondition?: string }): string[] {
    const p: string[] = [];
    if (!f.nama.trim()) p.push("Nama aset wajib diisi.");
    if (!/^\d{4}$/.test(f.tahun) || Number(f.tahun) < 1900 || Number(f.tahun) > 2100) p.push("Isi tahun empat digit, 1900–2100.");
    if (f.siswa && !f.pinjam) p.push("Boleh dipinjam siswa menuntut aset dapat dipinjam.");
    if (mode.create) {
        if (!f.category) p.push("Pilih kategori aset.");
        if (!f.room) p.push("Pilih ruangan aset.");
        if (!/^[1-9]\d*$/.test(f.jumlah)) p.push("Jumlah unit minimal 1.");
        // BR-003: nomor seri hanya sah untuk satu unit.
        if (f.seri.trim() && f.jumlah !== "1") p.push("Nomor seri hanya untuk pendaftaran satu unit.");
    } else if (mode.oldCondition !== undefined && f.kondisi !== mode.oldCondition) {
        if (!f.alasan.trim()) p.push("Alasan perubahan kondisi wajib diisi.");
        if (f.kondisi === "HILANG" && (!f.refJenis.trim() || !/^[1-9]\d*$/.test(f.refId))) p.push("Kondisi Hilang wajib merujuk sesi stock opname atau berita acara kehilangan.");
    }
    return p;
}
/** FR-04.1: `POST /assets` membentuk `jumlah_unit` unit sekaligus. */
export function createBody(f: AssetForm) {
    return { nama: f.nama.trim(), category_id: Number(f.category), merek: text(f.merek), model: text(f.model), nomor_seri: text(f.seri), tahun_perolehan: Number(f.tahun), sumber_perolehan: f.sumber, nilai_perolehan: num(f.nilai), room_id: Number(f.room), kondisi: f.kondisi, dapat_dipinjam: f.pinjam, boleh_dipinjam_siswa: f.siswa && f.pinjam, penanggung_jawab_id: f.pj ? Number(f.pj) : null, jumlah_unit: Number(f.jumlah) };
}
/** FR-04.3: satu PUT atomik; blok finansial hanya bila server mengirimnya; kondisi opsional beralasan. */
export function updateBody(f: AssetForm, old: { kondisi: string; financial: boolean }) {
    const changed = f.kondisi !== old.kondisi;
    return { nama: f.nama.trim(), merek: text(f.merek), model: text(f.model), nomor_seri: text(f.seri), tahun_perolehan: Number(f.tahun), dapat_dipinjam: f.pinjam, boleh_dipinjam_siswa: f.siswa && f.pinjam, penanggung_jawab_id: f.pj ? Number(f.pj) : null,
        ...(old.financial ? { sumber_perolehan: f.sumber, nilai_perolehan: num(f.nilai) } : {}),
        ...(changed ? { kondisi: f.kondisi, alasan: f.alasan.trim(), ...(f.kondisi === "HILANG" ? { referensi_jenis: f.refJenis.trim(), referensi_id: Number(f.refId) } : {}) } : {}) };
}

/** FR-04.4: 1–50 aset, ruangan tujuan, tanggal, alasan; penanggung jawab baru opsional. */
export function moveBody(input: { assets: readonly string[]; room: string; date: string; reason: string; pj: string }): { body: ReturnType<typeof MoveAssetsBodySchema.parse> } | { error: string } {
    if (input.assets.length === 0) return { error: "Pilih minimal satu aset." };
    if (input.assets.length > 50) return { error: "Mutasi paling banyak 50 aset sekaligus." };
    const parsed = MoveAssetsBodySchema.safeParse({ asset_ids: input.assets.map(Number), room_tujuan_id: Number(input.room), tanggal_mutasi: input.date, alasan: input.reason, ...(input.pj ? { penanggung_jawab_baru_id: Number(input.pj) } : {}) });
    return parsed.success ? { body: parsed.data } : { error: input.room ? parsed.error.issues.map((i) => i.message).join(" ") : "Pilih ruangan tujuan." };
}

export const DOC_TYPES = [{ value: "FAKTUR", label: "Faktur" }, { value: "GARANSI", label: "Garansi" }, { value: "SERTIFIKAT", label: "Sertifikat" }, { value: "MANUAL", label: "Manual" }, { value: "BERITA_ACARA", label: "Berita Acara" }, { value: "LAINNYA", label: "Lainnya" }] as const;
export type DocType = (typeof DOC_TYPES)[number]["value"];
/** Penanda garansi (FR-06.1): ≤30 hari peringatan; dihitung dengan tanggal WIB hari ini. */
export function warranty(d: { jenis: string; garansi_mulai?: string | null; garansi_selesai?: string | null }, today: string): { label: string; tone: StatusTone } | null {
    if (d.jenis !== "GARANSI" || !d.garansi_mulai || !d.garansi_selesai) return null;
    if (today < d.garansi_mulai) return { label: "Garansi belum dimulai", tone: "pending" };
    if (today > d.garansi_selesai) return { label: "Garansi berakhir", tone: "pending" };
    const days = Math.round((Date.parse(d.garansi_selesai) - Date.parse(today)) / 86_400_000);
    return days <= 30 ? { label: days === 0 ? "Garansi berakhir hari ini" : `Berakhir dalam ${days} hari`, tone: "warning" } : { label: "Garansi aktif", tone: "success" };
}

/** Isian Ubah Aset dari detail; blok finansial hanya bila server mengirimnya (BR-073). */
export function formFromAsset(d: { nama: string; kategori: { id: string }; merek: string | null; model: string | null; nomor_seri: string | null; tahun_perolehan: number; lokasi: { room_id: string }; kondisi: Condition; dapat_dipinjam: boolean; boleh_dipinjam_siswa: boolean; penanggung_jawab: { id: string } | null; sumber_perolehan?: Source | undefined; nilai_perolehan?: string | null | undefined }): AssetForm {
    return { ...EMPTY_FORM, nama: d.nama, category: d.kategori.id, merek: d.merek ?? "", model: d.model ?? "", seri: d.nomor_seri ?? "", tahun: String(d.tahun_perolehan), sumber: d.sumber_perolehan ?? "PEMBELIAN", nilai: d.nilai_perolehan ? String(Number(d.nilai_perolehan)) : "", room: d.lokasi.room_id, kondisi: d.kondisi, pinjam: d.dapat_dipinjam, siswa: d.boleh_dipinjam_siswa, pj: d.penanggung_jawab?.id ?? "" };
}
