// Kontrak M-09 di klien mobile — endpoint dan skema sama dengan web (SDD-MOB-13).
import type { AxiosInstance } from "axios";
import { CompensationProposalResponseSchema, FineDetailResponseSchema, FineListResponseSchema, FineMutationResponseSchema, LoanBorrowersResponseSchema, LoanCheckinPreviewResponseSchema, LoanDetailResponseSchema, LoanExtensionResponseSchema, LoanListResponseSchema, LoanResolvedUnitResponseSchema, LoanResultResponseSchema, ReadyCheckoutResponseSchema } from "@sigm4/schemas";
import type { FineListQuery, LoanCheckinBody, LoanCheckoutBody, LoanListQuery } from "@sigm4/schemas";

export const loadLoans = async (api: AxiosInstance, q: Partial<LoanListQuery>, signal: AbortSignal) => LoanListResponseSchema.parse((await api.get("/loans", { params: q, signal })).data);
export const loadLoan = async (api: AxiosInstance, id: string, signal: AbortSignal) => LoanDetailResponseSchema.parse((await api.get(`/loans/${encodeURIComponent(id)}`, { signal })).data).data;
/** FR-09.5: jadwal baru berlaku setelah disetujui; kunci idempoten per isian (ID-01). */
export const extend = async (api: AxiosInstance, id: string, body: { tanggal_jatuh_tempo: string; alasan: string }, key: string) => LoanExtensionResponseSchema.parse((await api.post(`/loans/${id}/extend`, body, { headers: { "Idempotency-Key": key } })).data).data;
export const loadFines = async (api: AxiosInstance, q: Partial<FineListQuery>, signal: AbortSignal) => FineListResponseSchema.parse((await api.get("/fines", { params: q, signal })).data);
export const loadFine = async (api: AxiosInstance, id: string, signal: AbortSignal) => FineDetailResponseSchema.parse((await api.get(`/fines/${encodeURIComponent(id)}`, { signal })).data).data;

/** FR-09.1 langkah 1: reservasi siap diserahkan hari ini. */
export const loadReady = async (api: AxiosInstance, page: number, signal: AbortSignal, reservation?: string) => ReadyCheckoutResponseSchema.parse((await api.get("/loans/ready-checkout", { params: { page, ...(reservation ? { reservation_id: reservation } : {}) }, signal })).data);
export const loadBorrowers = async (api: AxiosInstance, q: string, signal: AbortSignal) => LoanBorrowersResponseSchema.parse((await api.get("/loans/borrowers", { params: { q, page: 1 }, signal })).data);
/** Kode aset atau UUID dari QR label (server mencocokkan keduanya). */
export const resolveUnit = async (api: AxiosInstance, code: string) => LoanResolvedUnitResponseSchema.parse((await api.get("/loans/units/resolve", { params: { code } })).data).data;
export const checkout = async (api: AxiosInstance, body: LoanCheckoutBody, key: string) => LoanResultResponseSchema.parse((await api.post("/loans/checkout", body, { headers: { "Idempotency-Key": key } })).data).data;
/** BR-028/BR-028b: hitungan denda ditampilkan sebelum konfirmasi, tanpa efek. */
export const previewReturn = async (api: AxiosInstance, id: string, body: LoanCheckinBody) => LoanCheckinPreviewResponseSchema.parse((await api.post(`/loans/${id}/checkin/preview`, body)).data).data;
export const checkin = async (api: AxiosInstance, id: string, body: LoanCheckinBody, key: string) => LoanResultResponseSchema.parse((await api.post(`/loans/${id}/checkin`, body, { headers: { "Idempotency-Key": key } })).data).data;
export async function fineAction(api: AxiosInstance, id: string, action: string, body: unknown, key: string, proposal?: string) {
    const headers = { "Idempotency-Key": key };
    if (action === "propose") return CompensationProposalResponseSchema.parse((await api.post(`/fines/${id}/replacement-proposals`, body, { headers })).data).data;
    if (action === "approve" || action === "reject") return CompensationProposalResponseSchema.parse((await api.post(`/fines/${id}/replacement-proposals/${proposal}/decide`, body, { headers })).data).data;
    return FineMutationResponseSchema.parse((await api.patch(`/fines/${id}/${action}`, body, { headers })).data).data;
}
