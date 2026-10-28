import { queryOptions } from "@tanstack/react-query";
import { z } from "zod/mini";
import { DisposalListResponseSchema, DisposalDetailResponseSchema, DisposalCandidatesResponseSchema } from "@sigm4/schemas";
import type { DisposalQuerySchema } from "@sigm4/schemas";
import { api, ApiError } from "../../shared/api";
import type { z as Zod } from "zod";
export type DisposalFilters = Zod.infer<typeof DisposalQuerySchema>;
export const statuses = { MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", PERLU_REVISI: "Perlu Revisi", DISETUJUI: "Disetujui", DISETUJUI_SEBAGIAN: "Disetujui Sebagian", DITOLAK: "Ditolak", DIBATALKAN: "Dibatalkan", SELESAI: "Selesai" } as const;
export const reasons = { RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI: "Rusak Berat Tidak Dapat Diperbaiki", HILANG: "Hilang", HABIS_UMUR_TEKNIS: "Habis Umur Teknis", LAINNYA: "Lainnya" } as const;
export const actions = { DIMUSNAHKAN: "Dimusnahkan", DIJUAL: "Dijual", DIHIBAHKAN: "Dihibahkan", SUKU_CADANG: "Disimpan sebagai Suku Cadang", ADMINISTRATIF: "Pencatatan administratif kehilangan" } as const;
export const conditions = { BAIK: "Baik", RUSAK_RINGAN: "Rusak Ringan", RUSAK_BERAT: "Rusak Berat", HILANG: "Hilang" } as const;
const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });
export const money = (v: string | null) => v === null ? "Tidak tersedia" : rupiah.format(Number(v));
export const detailQuery = (id: string) => queryOptions({ queryKey: ["disposal", id], queryFn: async () => DisposalDetailResponseSchema.parse((await api.get(`/asset-disposals/${id}`)).data).data, refetchInterval: 5000 });
export const listQuery = (q: DisposalFilters) => queryOptions({ queryKey: ["disposals", q], queryFn: async () => DisposalListResponseSchema.parse((await api.get("/asset-disposals", { params: q })).data) });
export const candidateQuery = (q: { q?: string | undefined; page: number; per_page?: number; asset_id?: number }) => queryOptions({ queryKey: ["disposal-candidates", q], queryFn: async () => DisposalCandidatesResponseSchema.parse((await api.get("/asset-disposals/candidates", { params: { ...q, per_page: q.per_page ?? 20 } })).data) });
export const optionsQuery = queryOptions({ queryKey: ["disposal-options"], queryFn: async () => z.object({ data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })), rooms: z.array(z.object({ id: z.string(), nama: z.string() })) }) }).parse((await api.get("/asset-disposals/options")).data).data });
export class DisposalAttempt {
    private pending: { signature: string; key: string } | null = null;
    async send(path: string, body: unknown, method: "post" | "put" = "post") {
        const signature = JSON.stringify({ path, body, method }); if (this.pending && this.pending.signature !== signature) throw new Error("Hasil tindakan sebelumnya belum pasti. Ulangi dengan isian yang sama.");
        this.pending ??= { signature, key: crypto.randomUUID() }; try { const result = DisposalDetailResponseSchema.parse((await api[method](path, body, { headers: { "Idempotency-Key": this.pending.key } })).data).data; this.pending = null; return result; }
        catch (e) { if (e instanceof ApiError && e.status >= 400 && e.status < 500 && ![408, 429].includes(e.status)) this.pending = null; throw e; }
    }
}
export const message = (e: unknown) => e instanceof ApiError ? [e.message, ...e.details.map(d => d.message)].join(" ") : e instanceof Error ? e.message : "Tindakan belum tersimpan.";
export async function uploadDisposalFile(file: File, kind: "DISPOSAL_ATTACHMENT" | "DISPOSAL_EXECUTION_PHOTO") {
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()), checksum = [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, "0")).join("");
    const order = z.object({ data: z.object({ file_id: z.string(), upload_url: z.url() }) }).parse((await api.post("/files/presign", { jenis: kind, mime: file.type, ukuran: file.size })).data).data;
    if (!["http:", "https:"].includes(new URL(order.upload_url).protocol)) throw new Error("Tautan unggah tidak sah.");
    const response = await fetch(order.upload_url, { method: "PUT", credentials: "omit", headers: { "content-type": file.type }, body: file }); if (!response.ok) throw new Error("Berkas belum terunggah.");
    const confirmed = z.object({ data: z.object({ scan_status: z.string() }) }).parse((await api.post("/files/confirm", { file_id: Number(order.file_id), checksum })).data).data;
    return { file_id: Number(order.file_id), nama_berkas: file.name, checksum, status: confirmed.scan_status };
}
export async function refreshDisposalFile(file: { file_id: number; checksum: string }) { return z.object({ data: z.object({ scan_status: z.string() }) }).parse((await api.post("/files/confirm", { file_id: file.file_id, checksum: file.checksum })).data).data.scan_status; }
export async function downloadDisposal(id: string) {
    const result = z.object({ data: z.object({ status: z.string(), url: z.nullable(z.string()) }) }).parse((await api.get(`/asset-disposals/${id}/report`)).data).data;
    if (!result.url) throw new Error(result.status === "GAGAL" ? "Berita acara gagal dibuat. Minta pembuatan ulang." : "Berita acara sedang disiapkan.");
    const url = new URL(result.url); if (!["http:", "https:"].includes(url.protocol)) throw new Error("Tautan unduhan tidak sah."); window.open(url.href, "_blank", "noopener,noreferrer");
}
export async function exportDisposal(q: DisposalFilters, format: "xlsx" | "pdf") { const r = await api.get(`/asset-disposals/export/${format}`, { params: { ...q, tab: "ARSIP" }, responseType: "blob" }), url = URL.createObjectURL(r.data as Blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `arsip-penghapusan-${q.tahun ?? "semua"}.${format}`; anchor.click(); URL.revokeObjectURL(url); }
