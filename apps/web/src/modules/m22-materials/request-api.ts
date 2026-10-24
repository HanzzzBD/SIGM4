import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { MaterialRequestDetailResponseSchema, MaterialRequestListResponseSchema, MaterialOperationResponseSchema } from "@sigm4/schemas";
import type { MaterialRequestQuery } from "@sigm4/schemas";
import { api, ApiError } from "../../shared/api";
import { MaterialWriteAttempt } from "./api";
export const requestStatuses = { MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", PERLU_REVISI: "Perlu Revisi", DISETUJUI: "Disetujui", DISETUJUI_SEBAGIAN: "Disetujui Sebagian", DITOLAK: "Ditolak", DISERAHKAN_SEBAGIAN: "Diserahkan Sebagian", DISERAHKAN: "Diserahkan", DIBATALKAN: "Dibatalkan", DITUTUP: "Sisa Ditutup" } as const;
export const requestDetailQuery = (id: string) => queryOptions({ queryKey: ["material-request", id], queryFn: async () => MaterialRequestDetailResponseSchema.parse((await api.get(`/material-requests/${id}`)).data).data, refetchInterval: 5000 });
export const requestListQuery = (q: MaterialRequestQuery) => queryOptions({ queryKey: ["material-requests", q], queryFn: async () => MaterialRequestListResponseSchema.parse((await api.get("/material-requests", { params: q })).data) });
export class MaterialBusinessAttempt {
    private readonly attempt = new MaterialWriteAttempt();
    async request(path: string, body: unknown, method: "post" | "put" = "post") { return this.attempt.send({ path, body, method }, async (command, key) => { const c = command as { path: string; body: unknown; method: "post" | "put" }; return MaterialRequestDetailResponseSchema.parse((await api[c.method](c.path, c.body, { headers: { "Idempotency-Key": key } })).data).data; }); }
    async operation(path: string, body: unknown) { return this.attempt.send({ path, body }, async (command, key) => { const c = command as { path: string; body: unknown }; return MaterialOperationResponseSchema.parse((await api.post(c.path, c.body, { headers: { "Idempotency-Key": key } })).data).data; }); }
}
export const materialBusinessError = (e: unknown) => e instanceof ApiError ? [e.message, ...e.details.map(d => d.message)].join(" ") : e instanceof Error ? e.message : "Tindakan belum tersimpan.";
export const todayMaterialWib = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const thresholdQuery = (id: string) => queryOptions({ queryKey: ["material-threshold", id], queryFn: async () => z.object({ data: z.object({ default_qty: z.number().nullable(), batas_khusus: z.number().nullable(), batas_efektif: z.number().nullable() }) }).parse((await api.get(`/materials/${id}/request-threshold`)).data).data });
export type ReceiptFile = { file_id: number; nama_berkas: string; checksum: string; status: string };
export async function uploadMaterialReceipt(file: File): Promise<ReceiptFile> {
    if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran dokumen maksimal 10 MB.");
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()), checksum = [...new Uint8Array(digest)].map(i => i.toString(16).padStart(2, "0")).join("");
    const p = z.object({ data: z.object({ file_id: z.string(), upload_url: z.url() }) }).parse((await api.post("/files/presign", { jenis: "MATERIAL_RECEIPT_DOCUMENT", mime: file.type, ukuran: file.size })).data).data;
    if (!["https:", "http:"].includes(new URL(p.upload_url).protocol)) throw new Error("Tautan unggah tidak sah.");
    const uploaded = await fetch(p.upload_url, { method: "PUT", credentials: "omit", body: file, headers: { "content-type": file.type } }); if (!uploaded.ok) throw new Error("Dokumen belum terunggah.");
    const status = await confirmMaterialReceipt({ file_id: Number(p.file_id), checksum }); return { file_id: Number(p.file_id), nama_berkas: file.name, checksum, status };
}
export async function confirmMaterialReceipt(f: { file_id: number; checksum: string }) { return z.object({ data: z.object({ scan_status: z.string() }) }).parse((await api.post("/files/confirm", { file_id: f.file_id, checksum: f.checksum })).data).data.scan_status; }
