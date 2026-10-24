import { queryOptions } from "@tanstack/react-query";
import { LoanBorrowersResponseSchema, LoanCheckinPreviewResponseSchema, LoanDetailResponseSchema, LoanResolvedUnitResponseSchema, LoanResultResponseSchema, ReadyCheckoutResponseSchema } from "@sigm4/schemas";
import type { LoanCheckoutBody, LoanCheckinBody } from "@sigm4/schemas";
import { api } from "../../shared/api";

export const readyQuery = (page: number, reservation?: string) => queryOptions({ queryKey: ["loans", "ready", page, reservation], staleTime: 0, refetchOnWindowFocus: "always", queryFn: async ({ signal }) => ReadyCheckoutResponseSchema.parse((await api.get("/loans/ready-checkout", { params: { page, reservation_id: reservation }, signal })).data) });
export const detailQuery = (id: string) => queryOptions({ queryKey: ["loans", id], staleTime: 0, refetchOnWindowFocus: "always", queryFn: async ({ signal }) => LoanDetailResponseSchema.parse((await api.get(`/loans/${id}`, { signal })).data).data });
export const borrowersQuery = (q: string, page: number) => queryOptions({ queryKey: ["loans", "borrowers", q, page], queryFn: async ({ signal }) => LoanBorrowersResponseSchema.parse((await api.get("/loans/borrowers", { params: { q, page }, signal })).data) });
export const resolveUnit = async (code: string) => LoanResolvedUnitResponseSchema.parse((await api.get("/loans/units/resolve", { params: { code } })).data).data;
export const checkout = async (body: LoanCheckoutBody, key: string) => LoanResultResponseSchema.parse((await api.post("/loans/checkout", body, { headers: { "Idempotency-Key": key } })).data).data;
export const previewReturn = async (id: string, body: LoanCheckinBody) => LoanCheckinPreviewResponseSchema.parse((await api.post(`/loans/${id}/checkin/preview`, body)).data).data;
export const checkin = async (id: string, body: LoanCheckinBody, key: string) => LoanResultResponseSchema.parse((await api.post(`/loans/${id}/checkin`, body, { headers: { "Idempotency-Key": key } })).data).data;

/** SDD-FS-01 / BR-027: byte langsung ke storage, konfirmasi SHA-256 sebelum transaksi bisnis. */
export async function uploadEvidence(file: File, signal?: AbortSignal) {
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error("Bukti harus JPG/PNG, maksimal 2 MB.");
    const data = (await api.post("/files/presign", { jenis: "HANDOVER_PHOTO", mime: file.type, ukuran: file.size }, { ...(signal ? { signal } : {}) })).data as { data: { upload_url: string; file_id: string } };
    const response = await fetch(data.data.upload_url, { method: "PUT", headers: { "content-type": file.type }, body: file, ...(signal ? { signal } : {}) });
    if (!response.ok) throw new Error("Unggahan bukti gagal. Coba lagi sebelum melanjutkan.");
    const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    const checksum = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    await api.post("/files/confirm", { file_id: Number(data.data.file_id), checksum }, { ...(signal ? { signal } : {}) });
    return Number(data.data.file_id);
}
