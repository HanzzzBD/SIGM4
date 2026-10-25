// Kontrak M-09 di klien mobile — endpoint dan skema sama dengan web (SDD-MOB-13).
import type { AxiosInstance } from "axios";
import { FineDetailResponseSchema, FineListResponseSchema, LoanDetailResponseSchema, LoanExtensionResponseSchema, LoanListResponseSchema } from "@sigm4/schemas";
import type { FineListQuery, LoanListQuery } from "@sigm4/schemas";

export const loadLoans = async (api: AxiosInstance, q: Partial<LoanListQuery>, signal: AbortSignal) => LoanListResponseSchema.parse((await api.get("/loans", { params: q, signal })).data);
export const loadLoan = async (api: AxiosInstance, id: string, signal: AbortSignal) => LoanDetailResponseSchema.parse((await api.get(`/loans/${encodeURIComponent(id)}`, { signal })).data).data;
/** FR-09.5: jadwal baru berlaku setelah disetujui; kunci idempoten per isian (ID-01). */
export const extend = async (api: AxiosInstance, id: string, body: { tanggal_jatuh_tempo: string; alasan: string }, key: string) => LoanExtensionResponseSchema.parse((await api.post(`/loans/${id}/extend`, body, { headers: { "Idempotency-Key": key } })).data).data;
export const loadFines = async (api: AxiosInstance, q: Partial<FineListQuery>, signal: AbortSignal) => FineListResponseSchema.parse((await api.get("/fines", { params: q, signal })).data);
export const loadFine = async (api: AxiosInstance, id: string, signal: AbortSignal) => FineDetailResponseSchema.parse((await api.get(`/fines/${encodeURIComponent(id)}`, { signal })).data).data;
