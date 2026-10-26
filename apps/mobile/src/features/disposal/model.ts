// Penghapusan aset mobile (FR-21.x; MS-71…MS-73) — kontrak sama dengan web P-55…P-57. Selalu daring.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { DisposalCandidatesResponseSchema, DisposalCreateSchema, DisposalDetailResponseSchema, DisposalExecuteSchema, DisposalListResponseSchema } from "@sigm4/schemas";
import type { DisposalCandidate, DisposalDetail } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui";
import type { Attached } from "../../shared/upload/AttachmentField";

export const statuses = { MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", PERLU_REVISI: "Perlu Revisi", DISETUJUI: "Disetujui", DISETUJUI_SEBAGIAN: "Disetujui Sebagian", DITOLAK: "Ditolak", DIBATALKAN: "Dibatalkan", SELESAI: "Selesai" } as const;
export const statusTones: Readonly<Record<keyof typeof statuses, StatusTone>> = { MENUNGGU_PERSETUJUAN: "warning", PERLU_REVISI: "warning", DISETUJUI: "info", DISETUJUI_SEBAGIAN: "info", DITOLAK: "error", DIBATALKAN: "pending", SELESAI: "success" };
export const reasons = { RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI: "Rusak Berat Tidak Dapat Diperbaiki", HILANG: "Hilang", HABIS_UMUR_TEKNIS: "Habis Umur Teknis", LAINNYA: "Lainnya" } as const;
export const actions = { DIMUSNAHKAN: "Dimusnahkan", DIJUAL: "Dijual", DIHIBAHKAN: "Dihibahkan", SUKU_CADANG: "Disimpan sebagai Suku Cadang", ADMINISTRATIF: "Pencatatan administratif kehilangan" } as const;
export const conditions = { BAIK: "Baik", RUSAK_RINGAN: "Rusak Ringan", RUSAK_BERAT: "Rusak Berat", HILANG: "Hilang" } as const;
type Reason = keyof typeof reasons; type Action = keyof typeof actions;
const key = (k: string) => ({ headers: { "Idempotency-Key": k } });

export const loadDisposals = async (api: AxiosInstance, q: { tab: "USULAN" | "ARSIP"; page: number; q: string; status: string }, signal: AbortSignal) => DisposalListResponseSchema.parse((await api.get("/asset-disposals", { params: { tab: q.tab, page: q.page, ...(q.q.trim() ? { q: q.q.trim() } : {}), ...(q.status ? { status: q.status } : {}) }, signal })).data);
export const loadDisposal = async (api: AxiosInstance, id: string, signal: AbortSignal) => DisposalDetailResponseSchema.parse((await api.get(`/asset-disposals/${id}`, { signal })).data).data;
export const loadCandidates = async (api: AxiosInstance, q: { q?: string; page: number; asset_id?: number }, signal: AbortSignal) => DisposalCandidatesResponseSchema.parse((await api.get("/asset-disposals/candidates", { params: { ...q, per_page: 20 }, signal })).data);
export const loadDisposalOptions = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })), rooms: z.array(z.object({ id: z.string(), nama: z.string() })) }) }).parse((await api.get("/asset-disposals/options", { signal })).data).data;
/** Tulis penghapusan; path absolut (termasuk `/assets/{id}/reinstate`), respons detail terbaru. */
export const disposalWrite = async (api: AxiosInstance, path: string, body: unknown, k: string, method: "post" | "put" = "post") => DisposalDetailResponseSchema.parse((await api[method](path, body, key(k))).data).data;
/** Berita acara PDF dibuka lewat URL presign (keputusan 22, sama dengan keputusan 19). */
export const disposalReportUrl = async (api: AxiosInstance, id: string) => { const r = z.object({ data: z.object({ status: z.string(), url: z.string().nullable() }) }).parse((await api.get(`/asset-disposals/${id}/report`)).data).data; if (!r.url) throw new Error(r.status === "GAGAL" ? "Berita acara gagal dibuat. Minta pembuatan ulang." : "Berita acara sedang disiapkan. Coba lagi beberapa saat."); return r.url; };

/** Aset Hilang hanya dicatat administratif; alasan lain tidak boleh memakai pencatatan administratif. */
export const actionsFor = (reason: Reason) => (Object.keys(actions) as Action[]).filter((a) => reason === "HILANG" ? a === "ADMINISTRATIF" : a !== "ADMINISTRATIF");
export interface Selected { asset: DisposalCandidate; warranty: boolean; warrantyReason: string; proof: string }
export interface DisposalForm { reason: Reason; justification: string; action: Action; items: Selected[]; files: (Attached & { jenis: "PENDUKUNG" | "KEHILANGAN" })[] }
export const selectCandidate = (a: DisposalCandidate): Selected => ({ asset: a, warranty: false, warrantyReason: "", proof: "" });
/** Prefill dari Detail Aset/WO (keputusan 23, sama dengan web P-56): Hilang → administratif + rujukan opname; WO → rekomendasi. */
export function formFromCandidate(f: DisposalForm, a: DisposalCandidate): DisposalForm {
    if (a.kondisi === "HILANG") return { ...f, items: [selectCandidate(a)], reason: "HILANG", action: "ADMINISTRATIF", justification: `Aset ${a.kode_barang} dinyatakan hilang${a.loss_session_id ? ` berdasarkan opname #${a.loss_session_id}` : ""}.` };
    return { ...f, items: [selectCandidate(a)], justification: a.work_order_id ? `Rekomendasi penggantian dari work order #${a.work_order_id} untuk ${a.nama}.` : f.justification };
}
export const formFromDetail = (d: DisposalDetail): DisposalForm => ({ reason: d.alasan, justification: d.justifikasi, action: d.tindak_lanjut_fisik, items: d.items.map((i) => ({ asset: i.snapshot, warranty: i.konfirmasi_garansi, warrantyReason: i.alasan_garansi, proof: i.bukti_kehilangan_file_id ?? "" })), files: d.lampiran.map((x) => ({ file_id: Number(x.file_id), nama_berkas: x.nama_berkas, scan_status: x.status as Attached["scan_status"], jenis: x.jenis === "KEHILANGAN" ? "KEHILANGAN" : "PENDUKUNG" })) });
/** FR-21.1: aset bergaransi butuh konfirmasi beralasan; aset Hilang tanpa opname butuh berita acara kehilangan CLEAN. */
export function disposalBody(f: DisposalForm): { body: unknown } | { error: string } {
    if (!f.items.length) return { error: "Pilih minimal satu aset kandidat." };
    const warranty = f.items.find((i) => i.asset.garansi.length > 0 && (!i.warranty || !i.warrantyReason.trim()));
    if (warranty) return { error: `${warranty.asset.kode_barang} masih bergaransi: konfirmasi dan isi alasan melanjutkan.` };
    const lost = f.items.find((i) => i.asset.kondisi === "HILANG" && !i.asset.loss_session_id && !f.files.some((x) => String(x.file_id) === i.proof && x.jenis === "KEHILANGAN" && x.scan_status === "CLEAN"));
    if (lost) return { error: `${lost.asset.kode_barang} hilang tanpa opname: pilih berita acara kehilangan yang terverifikasi.` };
    if (!actionsFor(f.reason).includes(f.action)) return { error: "Tindak lanjut tidak sesuai alasan penghapusan." };
    const p = DisposalCreateSchema.safeParse({ alasan: f.reason, justifikasi: f.justification, tindak_lanjut_fisik: f.action, lampiran: f.files.map(({ file_id, nama_berkas, jenis }) => ({ file_id, nama_berkas, jenis })),
        items: f.items.map((i) => ({ asset_id: Number(i.asset.id), loss_session_id: i.asset.loss_session_id ? Number(i.asset.loss_session_id) : null, bukti_kehilangan_file_id: i.asset.kondisi === "HILANG" && !i.asset.loss_session_id && i.proof ? Number(i.proof) : null, konfirmasi_garansi: i.warranty, alasan_garansi: i.warrantyReason })) });
    return p.success ? { body: p.data } : { error: p.error.issues[0]?.path[0] === "justifikasi" ? "Isi justifikasi penghapusan." : p.error.issues[0]?.message ?? "Lengkapi usulan." };
}
/** FR-21.3: saksi wajib; foto bukti wajib kecuali pencatatan administratif aset Hilang; seluruh foto CLEAN. */
export function executeBody(d: Pick<DisposalDetail, "alasan">, f: { date: string; action: Action; witnesses: string; photos: readonly Attached[]; note: string }): { body: unknown } | { error: string } {
    const lost = d.alasan === "HILANG";
    if (!lost && !f.photos.length) return { error: "Lampirkan minimal satu foto bukti pelaksanaan." };
    if (f.photos.some((x) => x.scan_status !== "CLEAN")) return { error: "Tunggu seluruh foto selesai diperiksa." };
    const p = DisposalExecuteSchema.safeParse({ tanggal: f.date, tindak_lanjut: f.action, saksi: f.witnesses.split("\n").map((v) => v.trim()).filter(Boolean), foto_file_ids: f.photos.map((x) => x.file_id), catatan: f.note });
    return p.success ? { body: p.data } : { error: p.error.issues[0]?.path[0] === "saksi" ? "Isi 1–10 nama saksi, satu per baris." : "Lengkapi data pelaksanaan." };
}
type Who = { id: string; role_kode: string }; type Perms = Readonly<Record<string, string>>;
export const canRevise = (d: Pick<DisposalDetail, "status" | "pengusul_id">, u: Who, p: Perms) => d.status === "PERLU_REVISI" && Object.hasOwn(p, "disposal.create") && d.pengusul_id === u.id;
/** Pengusul atau Admin (R-01) membatalkan usulan yang belum selesai. */
export const canCancel = (d: Pick<DisposalDetail, "status" | "pengusul_id">, u: Who, p: Perms) => !["SELESAI", "DITOLAK", "DIBATALKAN"].includes(d.status) && Object.hasOwn(p, "disposal.create") && (d.pengusul_id === u.id || u.role_kode === "R-01");
export const canExecute = (d: Pick<DisposalDetail, "status">, p: Perms) => (d.status === "DISETUJUI" || d.status === "DISETUJUI_SEBAGIAN") && Object.hasOwn(p, "disposal.execute");
/** Pemulihan hanya untuk aset Hilang yang sudah dihapuskan, oleh Admin (R-01) ber-izin. */
export const canReinstate = (d: Pick<DisposalDetail, "alasan">, i: Pick<DisposalDetail["items"][number], "executed_at" | "dihapuskan" | "reinstated_at">, u: Who, p: Perms) => d.alasan === "HILANG" && !!i.executed_at && i.dihapuskan && !i.reinstated_at && Object.hasOwn(p, "disposal.reinstate") && u.role_kode === "R-01";
