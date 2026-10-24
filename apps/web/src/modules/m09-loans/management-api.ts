import { queryOptions } from "@tanstack/react-query";
import { LoanExtensionContextResponseSchema, FineDetailResponseSchema, FineListResponseSchema, LoanListResponseSchema, LoanExtensionResponseSchema, FineMutationResponseSchema, CompensationProposalResponseSchema, LoanFilterOptionsResponseSchema } from "@sigm4/schemas";
import type { LoanListQuery, FineListQuery } from "@sigm4/schemas";
import { api } from "../../shared/api";

export const loanListQuery = (filter: LoanListQuery) => queryOptions({ queryKey: ["loans", "list", filter], staleTime: 0, queryFn: async ({ signal }) => LoanListResponseSchema.parse((await api.get("/loans", { params: filter, signal })).data) });
export const fineListQuery = (filter: FineListQuery) => queryOptions({ queryKey: ["fines", "list", filter], staleTime: 0, queryFn: async ({ signal }) => FineListResponseSchema.parse((await api.get("/fines", { params: filter, signal })).data) });
export const fineDetailQuery = (id: string) => queryOptions({ queryKey: ["fines", id], staleTime: 0, queryFn: async ({ signal }) => FineDetailResponseSchema.parse((await api.get(`/fines/${id}`, { signal })).data).data });
export const loanFilterQuery = (kind: "loans" | "fines") => queryOptions({ queryKey: [kind, "filters"], queryFn: async ({ signal }) => LoanFilterOptionsResponseSchema.parse((await api.get(`/${kind}/filter-options`, { signal })).data).data });
export const extend = async (id: string, body: unknown, key: string) => LoanExtensionResponseSchema.parse((await api.post(`/loans/${id}/extend`, body, { headers: { "Idempotency-Key": key } })).data).data;
export const mutateFine = async (id: string, action: string, body: unknown, key: string) => FineMutationResponseSchema.parse((await api.patch(`/fines/${id}/${action}`, body, { headers: { "Idempotency-Key": key } })).data).data;
export const proposeReplacement = async (id: string, body: unknown, key: string) => CompensationProposalResponseSchema.parse((await api.post(`/fines/${id}/replacement-proposals`, body, { headers: { "Idempotency-Key": key } })).data).data;
export const decideReplacement = async (id: string, proposal: string, body: unknown, key: string) => CompensationProposalResponseSchema.parse((await api.post(`/fines/${id}/replacement-proposals/${proposal}/decide`, body, { headers: { "Idempotency-Key": key } })).data).data;
export async function downloadLoanExport(kind: "loans" | "fines", filter: LoanListQuery | FineListQuery, format: "xlsx" | "pdf") { const response = await api.get(`/${kind}/export`, { params: { ...filter, format }, responseType: "blob" }), url = URL.createObjectURL(response.data as Blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = `${kind === "loans" ? "peminjaman" : "kewajiban"}.${format}`; anchor.click(); URL.revokeObjectURL(url); }

export const extensionContextQuery = (id: number) => queryOptions({ queryKey: ["loans", "extension-context", id], staleTime: 0, queryFn: async ({ signal }) => LoanExtensionContextResponseSchema.parse((await api.get(`/loan-extensions/${id}`, { signal })).data).data });
