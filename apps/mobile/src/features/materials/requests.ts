// Permintaan bahan mobile (FR-22.4; MS-55…58) — kontrak dan aturan sama dengan web P-84…P-87. Mencabut UXD-17:
// bahan tidak lagi hanya untuk opname di ponsel (UXD-19).
import type { AxiosInstance } from "axios";
import { MaterialDetailResponseSchema, MaterialListResponseSchema, MaterialOptionsResponseSchema, MaterialRequestBodySchema, MaterialRequestDetailResponseSchema, MaterialRequestListResponseSchema } from "@sigm4/schemas";
import type { MaterialRequestBody, MaterialRequestDetail } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui/status";

export const REQUEST_LABEL = { MENUNGGU_PERSETUJUAN: "Menunggu Persetujuan", PERLU_REVISI: "Perlu Revisi", DISETUJUI: "Disetujui", DISETUJUI_SEBAGIAN: "Disetujui Sebagian", DITOLAK: "Ditolak", DISERAHKAN_SEBAGIAN: "Diserahkan Sebagian", DISERAHKAN: "Diserahkan", DIBATALKAN: "Dibatalkan", DITUTUP: "Sisa Ditutup" } as const;
export type RequestStatus = keyof typeof REQUEST_LABEL;
export const REQUEST_TONE: Readonly<Record<RequestStatus, StatusTone>> = { MENUNGGU_PERSETUJUAN: "warning", PERLU_REVISI: "warning", DISETUJUI: "success", DISETUJUI_SEBAGIAN: "success", DITOLAK: "error", DISERAHKAN_SEBAGIAN: "info", DISERAHKAN: "success", DIBATALKAN: "pending", DITUTUP: "pending" };

export const loadCatalog = async (api: AxiosInstance, q: { q?: string; category_id?: string; page: number }, signal: AbortSignal) => MaterialListResponseSchema.parse((await api.get("/materials", { params: { ...q, status: "AKTIF", bersaldo: "true", per_page: 20 }, signal })).data);
export const loadOptions = async (api: AxiosInstance, signal: AbortSignal) => MaterialOptionsResponseSchema.parse((await api.get("/materials/options", { signal })).data).data;
export const loadMaterial = async (api: AxiosInstance, id: string, signal?: AbortSignal) => MaterialDetailResponseSchema.parse((await api.get(`/materials/${encodeURIComponent(id)}`, signal ? { signal } : {})).data).data;
export const loadRequests = async (api: AxiosInstance, q: { tab: "AKTIF" | "SELESAI" | "SEMUA"; page: number; saya?: boolean }, signal: AbortSignal) => MaterialRequestListResponseSchema.parse((await api.get("/material-requests", { params: { tab: q.tab, page: q.page, per_page: 20, ...(q.saya ? { saya: "true" } : {}) }, signal })).data);
export const loadRequest = async (api: AxiosInstance, id: string, signal?: AbortSignal) => MaterialRequestDetailResponseSchema.parse((await api.get(`/material-requests/${encodeURIComponent(id)}`, signal ? { signal } : {})).data).data;
/** Ajukan baru (POST) atau revisi siklus berikutnya (PUT) — Idempotency-Key per isian (ID-01). */
export const saveRequest = async (api: AxiosInstance, body: MaterialRequestBody, key: string, revise?: string) => MaterialRequestDetailResponseSchema.parse((await api[revise ? "put" : "post"](revise ? `/material-requests/${revise}` : "/material-requests", body, { headers: { "Idempotency-Key": key } })).data).data;
export const cancelRequest = async (api: AxiosInstance, id: string, alasan: string, key: string) => MaterialRequestDetailResponseSchema.parse((await api.post(`/material-requests/${id}/cancel`, { alasan }, { headers: { "Idempotency-Key": key } })).data).data;

export interface RequestRow { key: string; material: string; room: string; quantity: string }
/** BR-086: jumlah bulat dalam satuan master; satu jenis bahan + lokasi hanya sekali; ambang approval dievaluasi server. */
export function requestBody(purpose: string, rows: readonly RequestRow[]): { body: MaterialRequestBody } | { error: string } {
    if (rows.some((r) => !r.material || !r.room)) return { error: "Pilih bahan dan lokasi bersaldo pada setiap baris." };
    const parsed = MaterialRequestBodySchema.safeParse({ keperluan: purpose, items: rows.map((r) => ({ material_id: Number(r.material), room_id: Number(r.room), jumlah: Number(r.quantity) })) });
    return parsed.success ? { body: parsed.data } : { error: parsed.error.issues[0]?.message ?? "Lengkapi permintaan." };
}
/** Saldo terkini tidak ditahan oleh permintaan; peringatkan bila jumlah melebihi saldo lokasi. */
export const exceedsBalance = (quantity: string, balance: number | undefined) => balance !== undefined && Number(quantity) > balance;
/** Batalkan: pemohon sendiri (atau Administrator) pada status yang belum diserahkan — sama dengan web P-87. */
export function canCancel(d: Pick<MaterialRequestDetail, "status" | "pemohon_id">, user: { id: string; role_kode: string }, permissions: Readonly<Record<string, string>>): boolean {
    return Object.hasOwn(permissions, "material.request") && (d.pemohon_id === user.id || user.role_kode === "R-01") && ["MENUNGGU_PERSETUJUAN", "PERLU_REVISI", "DISETUJUI", "DISETUJUI_SEBAGIAN"].includes(d.status);
}
export const rowsFromRequest = (d: MaterialRequestDetail): RequestRow[] => d.items.map((i) => ({ key: i.id, material: i.material_id, room: i.room_id, quantity: String(i.jumlah_diminta) }));
