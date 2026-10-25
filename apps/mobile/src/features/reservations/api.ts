// Kontrak M-07/M-08 di klien mobile — endpoint dan skema sama dengan web (SDD-MOB-13).
import type { AxiosInstance } from "axios";
import { AssetAvailabilityResponseSchema, ReservationCancelledResponseSchema, ReservationDetailResponseSchema, ReservationListResponseSchema, ReservationUsageResponseSchema, RoomAvailabilityResponseSchema, RoomReservationCreatedResponseSchema, RoomReservationPreviewResponseSchema } from "@sigm4/schemas";
import type { AssetReservationBody, HasilPenggunaan, ReservationListQuery, RoomReservationBody } from "@sigm4/schemas";

/** FR-07.1 — AV-04: selalu dimuat ulang dari server, tidak pernah dari cache. */
export const loadRooms = async (api: AxiosInstance, dari: string, sampai: string, signal: AbortSignal, kapasitas?: number) => RoomAvailabilityResponseSchema.parse((await api.get("/rooms/availability", { params: { dari, sampai, kapasitas_min: kapasitas }, signal })).data).data;
/** FR-08.1 — ketersediaan aset berbasis rentang (AV-03). */
export const loadAssets = async (api: AxiosInstance, params: { dari: string; sampai: string; q?: string; kategori_id?: string; page?: number; per_page?: number }, signal: AbortSignal) => AssetAvailabilityResponseSchema.parse((await api.get("/assets/availability", { params: { per_page: 25, ...params }, signal })).data);
/** P-29 langkah 3: pemeriksaan server yang sama dengan pengajuan, tanpa efek. */
export const preview = async (api: AxiosInstance, body: RoomReservationBody | AssetReservationBody) => RoomReservationPreviewResponseSchema.parse((await api.post("/reservations/preview", body)).data).data;
/** ID-01: kunci yang sama untuk body yang sama — ketuk ganda tidak menghasilkan dua pengajuan. */
export const submit = async (api: AxiosInstance, body: RoomReservationBody | AssetReservationBody, key: string) => RoomReservationCreatedResponseSchema.parse((await api.post("/reservations", body, { headers: { "Idempotency-Key": key } })).data).data;
export const loadList = async (api: AxiosInstance, q: ReservationListQuery, signal: AbortSignal) => ReservationListResponseSchema.parse((await api.get("/reservations", { params: q, signal })).data);
export const loadDetail = async (api: AxiosInstance, id: string, signal?: AbortSignal) => ReservationDetailResponseSchema.parse((await api.get(`/reservations/${encodeURIComponent(id)}`, signal ? { signal } : {})).data).data;
/** FR-07.3 (BR-025): alasan wajib. */
export const cancel = async (api: AxiosInstance, id: string, alasan: string) => ReservationCancelledResponseSchema.parse((await api.post(`/reservations/${id}/cancel`, { alasan })).data).data;
/** FR-07.4 langkah 3 + A1. */
export const recordUsage = async (api: AxiosInstance, id: string, hasil: HasilPenggunaan, catatan: string | null) => ReservationUsageResponseSchema.parse((await api.post(`/reservations/${id}/usage`, { hasil, catatan })).data).data;
