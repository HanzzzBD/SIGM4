import { queryOptions } from "@tanstack/react-query";
import {
    ReservationCancelledResponseSchema,
    ReservationDetailResponseSchema,
    ReservationListResponseSchema,
    ReservationUsageResponseSchema,
    RoomAvailabilityResponseSchema,
    RoomReservationCreatedResponseSchema,
    RoomReservationPreviewResponseSchema,
} from "@sigm4/schemas";
import type { HasilPenggunaan, ReservationCancelled, ReservationListQuery, ReservationUsage, RoomReservationBody, RoomReservationCreated, RoomReservationPreview } from "@sigm4/schemas";
import { api } from "../../shared/api";

export interface FilterKalender {
    readonly gedung?: string | undefined;
    readonly jenis?: string | undefined;
    readonly kapasitas?: number | undefined;
}

/** FR-07.1 — AV-04/UXP-04: tak pernah dari cache; dimuat ulang saat jendela kembali fokus. */
export const ketersediaanQuery = (dari: string, sampai: string, f: FilterKalender) =>
    queryOptions({
        queryKey: ["rooms", "availability", dari, sampai, f.gedung ?? null, f.jenis ?? null, f.kapasitas ?? null],
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: "always",
        queryFn: async () =>
            RoomAvailabilityResponseSchema.parse(
                (await api.get("/rooms/availability", { params: { dari, sampai, gedung_id: f.gedung, jenis: f.jenis, kapasitas_min: f.kapasitas } })).data,
            ).data,
    });

/** FR-07.2 / P-29 langkah 3 (keputusan 14f): pemeriksaan server yang sama dengan pengajuan, tanpa efek. */
export async function pratinjauPengajuan(body: RoomReservationBody): Promise<RoomReservationPreview> {
    return RoomReservationPreviewResponseSchema.parse((await api.post("/reservations/preview", body)).data).data;
}

/** ID-01: kunci yang sama untuk body yang sama — ketuk ganda tak pernah menghasilkan dua pengajuan. */
export async function ajukanReservasi(body: RoomReservationBody, kunci: string): Promise<RoomReservationCreated> {
    return RoomReservationCreatedResponseSchema.parse((await api.post("/reservations", body, { headers: { "Idempotency-Key": kunci } })).data).data;
}

/** P-30 (m07 §7, keputusan 17): saringan & halaman hidup di URL; respons diurai skema bersama. */
export const daftarReservasiQuery = (q: ReservationListQuery) =>
    queryOptions({
        queryKey: ["reservations", "list", q],
        queryFn: async () => ReservationListResponseSchema.parse((await api.get("/reservations", { params: q })).data),
    });

/** P-31: aksi & riwayat berubah setelah tiap tindakan — selalu dimuat ulang sesudahnya. */
export const detailReservasiQuery = (id: string) =>
    queryOptions({
        queryKey: ["reservations", "detail", id],
        queryFn: async () => ReservationDetailResponseSchema.parse((await api.get(`/reservations/${id}`)).data).data,
    });

/** FR-07.3 (BR-025): alasan wajib. Bukan ID-01 — pembatalan kedua ditolak penjaga status. */
export async function batalkanReservasi(id: string, alasan: string): Promise<ReservationCancelled> {
    return ReservationCancelledResponseSchema.parse((await api.post(`/reservations/${id}/cancel`, { alasan })).data).data;
}

/** FR-07.4 langkah 3 + A1 (keputusan 16). */
export async function catatPenggunaan(id: string, hasil: HasilPenggunaan, catatan: string | null): Promise<ReservationUsage> {
    return ReservationUsageResponseSchema.parse((await api.post(`/reservations/${id}/usage`, { hasil, catatan })).data).data;
}
