// Pengelolaan opname mobile (FR-13.1, FR-13.3; MS-65, MS-66) — buat sesi, finalisasi, rekonsiliasi Aset & Bahan,
// kirim ke Pimpinan, setujui/kembalikan — kontrak sama dengan web P-48…P-50. Selalu daring (bukan pengecualian luring §4.2.1).
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { MaterialStocktakeItemsSchema, StocktakeCreateSchema, StocktakeFindingReviewSchema, StocktakeFindingsSchema, StocktakeItemsSchema, StocktakeListSchema, StocktakeReconcileSchema, StocktakeResponseSchema } from "@sigm4/schemas";
import type { StocktakeItem, StocktakeSession } from "@sigm4/schemas";

const key = (k: string) => ({ headers: { "Idempotency-Key": k } });
export const loadSessions = async (api: AxiosInstance, q: { page: number; status: string }, signal: AbortSignal) => StocktakeListSchema.parse((await api.get("/audit-sessions", { params: { page: q.page, per_page: 20, ...(q.status ? { status: q.status } : {}) }, signal })).data);
export const loadSession = async (api: AxiosInstance, id: string, signal: AbortSignal) => StocktakeResponseSchema.parse((await api.get(`/audit-sessions/${id}`, { signal })).data).data;
export const loadDifferences = async (api: AxiosInstance, id: string, page: number, signal: AbortSignal) => StocktakeItemsSchema.parse((await api.get(`/audit-sessions/${id}/results`, { params: { page, per_page: 20, hanya_selisih: "true" }, signal })).data);
export const loadFindings = async (api: AxiosInstance, id: string, page: number, signal: AbortSignal) => StocktakeFindingsSchema.parse((await api.get(`/audit-sessions/${id}/findings`, { params: { page, per_page: 20 }, signal })).data);
export const loadMaterialDifferences = async (api: AxiosInstance, id: string, page: number, signal: AbortSignal) => MaterialStocktakeItemsSchema.parse((await api.get(`/audit-sessions/${id}/material-results`, { params: { page, per_page: 20, hanya_selisih: "true" }, signal })).data);
const Options = z.object({ data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })), rooms: z.array(z.object({ id: z.string(), nama: z.string(), building_id: z.string() })), buildings: z.array(z.object({ id: z.string(), nama: z.string() })), people: z.array(z.object({ id: z.string(), nama: z.string() })) }) });
export const loadOptions = async (api: AxiosInstance, signal: AbortSignal) => Options.parse((await api.get("/audit-sessions/options", { signal })).data).data;
export const loadPhotos = async (api: AxiosInstance, id: string, signal: AbortSignal) => z.object({ data: z.array(z.object({ file_id: z.string(), item_id: z.string().nullable(), finding_id: z.string().nullable(), status: z.string(), url: z.string().nullable() })) }).parse((await api.get(`/audit-sessions/${id}/photos`, { params: { page: 1, per_page: 20 }, signal })).data).data;
/** Tulis sesi: path relatif terhadap sesi; respons sesi terbaru. */
export const sessionWrite = async (api: AxiosInstance, path: string, body: unknown, k: string, method: "post" | "put" = "post") => StocktakeResponseSchema.parse((await api[method](path, body, key(k))).data).data;
const Report = z.object({ data: z.object({ status: z.string(), url: z.string().nullable() }) });
/** Berita acara PDF dibuka lewat URL presign (keputusan 19); ekspor XLSX menyusul PR-07-31. */
export const reportUrl = async (api: AxiosInstance, id: string) => { const r = Report.parse((await api.get(`/audit-sessions/${id}/report`)).data).data; if (!r.url) throw new Error(r.status === "GAGAL" ? "Berita acara gagal dibuat. Petugas dapat meminta pembuatan ulang." : "Berita acara sedang disiapkan. Coba lagi beberapa saat."); return r.url; };

export interface SessionForm { domain: "ASET" | "BAHAN"; name: string; start: string; end: string; scope: "SEKOLAH" | "GEDUNG" | "RUANGAN" | "KATEGORI"; target: string; category: string; people: readonly string[] }
/** MS-65 (FR-13.1): satu domain per sesi; target dibekukan saat dibuat; Bahan tanpa cakupan/kategori Aset. */
export function sessionBody(f: SessionForm): { body: unknown } | { error: string } {
    const p = StocktakeCreateSchema.safeParse({ domain: f.domain, nama: f.name, periode_mulai: f.start, periode_selesai: f.end, cakupan: { jenis: f.scope, ...(f.scope === "SEKOLAH" ? {} : f.target ? { id: Number(f.target) } : {}), ...(f.domain === "ASET" && f.category && f.scope !== "KATEGORI" ? { category_id: Number(f.category) } : {}) }, pelaksana_ids: f.people.map(Number) });
    return p.success ? { body: p.data } : { error: p.error.issues[0]?.message ?? "Lengkapi sesi." };
}
/** Prasyarat finalisasi yang terlihat klien (sama dengan web); server memeriksa ulang. */
export function finalizationBlockers(s: Pick<StocktakeSession, "target" | "lokasi" | "periode_selesai" | "domain" | "diperiksa" | "foto_tertunda">, today: string): string[] {
    const r: string[] = [];
    if (!s.target) r.push("Sesi belum memiliki target pemeriksaan.");
    const open = s.lokasi.filter((l) => !l.selesai).length;
    if (open && today <= s.periode_selesai) r.push(`${open} lokasi belum selesai.`);
    if (s.domain === "BAHAN" && s.diperiksa < s.target) r.push(`${s.target - s.diperiksa} bahan/lokasi belum dihitung.`);
    if (s.foto_tertunda) r.push(`${s.foto_tertunda} foto belum siap.`);
    return r;
}
/** Tindakan selisih aset (FR-13.3): Tidak Ditemukan → Hilang; lainnya → sesuaikan; atau tanpa penyesuaian beralasan. */
export const itemActions = (i: Pick<StocktakeItem, "hasil">) => [i.hasil === "TIDAK_DITEMUKAN" ? { value: "HILANG", label: "Tetapkan Hilang" } : { value: "SESUAIKAN", label: "Sesuaikan lokasi/kondisi" }, { value: "TANPA_PENYESUAIAN", label: "Tanpa penyesuaian" }] as const;
export function reconcileBody(i: Pick<StocktakeItem, "room_id_sekarang" | "kondisi_sekarang">, action: string, note: string): { body: unknown } | { error: string } {
    const p = StocktakeReconcileSchema.safeParse({ keterangan: note, tindakan: action, basis: { room_id: Number(i.room_id_sekarang), kondisi: i.kondisi_sekarang } });
    return p.success ? { body: p.data } : { error: "Isi keterangan selisih." };
}
export function findingBody(f: { name: string; category: string; room: string; condition: string; year: string; source: string; value: string; note: string }): { body: unknown } | { error: string } {
    const p = StocktakeFindingReviewSchema.safeParse({ keterangan: f.note, nama: f.name, category_id: Number(f.category), room_id: Number(f.room), kondisi: f.condition, tahun_perolehan: Number(f.year), sumber_perolehan: f.source, nilai_perolehan: f.value.trim() ? Number(f.value) : null });
    return p.success ? { body: p.data } : { error: p.error.issues[0]?.message ?? "Lengkapi temuan." };
}
/** Pemisahan tugas: pembuat/pelaksana tidak menyetujui sesinya; Bahan disetujui Kepala Sekolah (R-03), sama dengan web. */
export function canApprove(s: Pick<StocktakeSession, "status" | "created_by" | "pelaksana" | "domain">, user: { id: string; role_kode: string }, perms: Readonly<Record<string, string>>): "YES" | "SELF" | "NO" {
    if (s.status !== "MENUNGGU_PERSETUJUAN" || !Object.hasOwn(perms, "audit.approve") || (s.domain === "BAHAN" && user.role_kode !== "R-03")) return "NO";
    return s.created_by === user.id || s.pelaksana.some((p) => p.id === user.id) ? "SELF" : "YES";
}
export const readyToSubmit = (s: Pick<StocktakeSession, "belum_dilengkapi" | "temuan_belum_dilengkapi" | "foto_tertunda">) => s.belum_dilengkapi === 0 && s.temuan_belum_dilengkapi === 0 && s.foto_tertunda === 0;
