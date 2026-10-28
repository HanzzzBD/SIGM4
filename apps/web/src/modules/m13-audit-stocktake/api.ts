import { queryOptions } from "@tanstack/react-query";
import { z } from "zod/mini";
import { StocktakeResponseSchema, StocktakeListSchema, StocktakeItemsSchema, StocktakeFindingsSchema, StocktakeScanResponseSchema } from "@sigm4/schemas";
import { api, ApiError } from "../../shared/api";
export const statuses = { BERJALAN: "Berjalan", MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", SELESAI: "Selesai", DIBATALKAN: "Dibatalkan" } as const;
export const results = { BELUM_DIPERIKSA: "Belum Diperiksa", DITEMUKAN: "Ditemukan", SALAH_LOKASI: "Salah Lokasi", PERBEDAAN_KONDISI: "Perbedaan Kondisi", TIDAK_DITEMUKAN: "Tidak Ditemukan", DIPINJAM: "Dipinjam" } as const;
export const conditions = { BAIK: "Baik", RUSAK_RINGAN: "Rusak Ringan", RUSAK_BERAT: "Rusak Berat", HILANG: "Hilang" } as const;
export const sessionQuery = (id: string) => queryOptions({ queryKey: ["stocktake", id], queryFn: async () => StocktakeResponseSchema.parse((await api.get(`/audit-sessions/${id}`)).data).data, refetchInterval: 5000 });
export const sessionsQuery = (page: number, status: string) => queryOptions({ queryKey: ["stocktake-list", page, status], queryFn: async () => StocktakeListSchema.parse((await api.get("/audit-sessions", { params: { page, per_page: 20, ...(status ? { status } : {}) } })).data), refetchInterval: 10000 });
export const itemsQuery = (id: string, page: number, room: string, differences = false) => queryOptions({ queryKey: ["stocktake", id, "items", page, room, differences], queryFn: async () => StocktakeItemsSchema.parse((await api.get(`/audit-sessions/${id}/results`, { params: { page, per_page: 20, ...(room ? { room_id: Number(room) } : {}), hanya_selisih: differences ? "true" : "false" } })).data), refetchInterval: 10000 });
export const findingsQuery = (id: string, page: number) => queryOptions({ queryKey: ["stocktake", id, "findings", page], queryFn: async () => StocktakeFindingsSchema.parse((await api.get(`/audit-sessions/${id}/findings`, { params: { page, per_page: 20 } })).data) });
export const optionsQuery = queryOptions({ queryKey: ["stocktake-options"], queryFn: async () => z.object({ data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })), rooms: z.array(z.object({ id: z.string(), nama: z.string(), building_id: z.string() })), buildings: z.array(z.object({ id: z.string(), nama: z.string() })), people: z.array(z.object({ id: z.string(), nama: z.string() })) }) }).parse((await api.get("/audit-sessions/options")).data).data });
/** Retain the request key for ambiguous transport failures, so retry cannot duplicate creation/approval. */
export class StocktakeAttempt {
    private pending: { signature: string; key: string } | null = null;
    async send(path: string, body: unknown, method: "post" | "put" = "post") {
        const signature = JSON.stringify({ path, body, method });
        if (this.pending && this.pending.signature !== signature) throw new Error("Hasil tindakan sebelumnya belum pasti. Ulangi tindakan dengan isian yang sama.");
        this.pending ??= { signature, key: crypto.randomUUID() };
        try { const response = await api[method](path, body, { headers: { "Idempotency-Key": this.pending.key } }); const data = path.endsWith("/scan") ? StocktakeScanResponseSchema.parse(response.data).data : StocktakeResponseSchema.parse(response.data).data; this.pending = null; return data; }
        catch (error) { if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) this.pending = null; throw error; }
    }
}
export const message = (e: unknown) => e instanceof ApiError ? [...new Set([e.message, ...e.details.map(d => d.message)])].join(" ") : e instanceof Error ? e.message : "Tindakan belum tersimpan.";
const formatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });
export const date = (value: string) => formatter.format(new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value));
export async function downloadReport(id: string) {
    const report = z.object({ data: z.object({ status: z.string(), url: z.nullable(z.string()), file_id: z.nullable(z.string()) }) }).parse((await api.get(`/audit-sessions/${id}/report`)).data).data;
    if (!report.url) throw new Error(report.status === "GAGAL" ? "Berita acara gagal dibuat. Petugas dapat meminta pembuatan ulang." : "Berita acara sedang disiapkan. Coba lagi beberapa saat.");
    const url = new URL(report.url); if (!["https:", "http:"].includes(url.protocol)) throw new Error("Tautan unduhan tidak sah.");
    window.open(url.href, "_blank", "noopener,noreferrer");
}
export async function downloadXlsx(id: string, nomor: string) {
    const response = await api.get(`/audit-sessions/${id}/export`, { responseType: "blob" });
    const url = URL.createObjectURL(response.data as Blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `${nomor}.xlsx`; anchor.click(); URL.revokeObjectURL(url);
}
