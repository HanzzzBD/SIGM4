import { queryOptions } from "@tanstack/react-query";
import {
    BlockDeactivatedResponseSchema,
    ReservationCancelledResponseSchema,
    ReservationDetailResponseSchema,
    ReservationListResponseSchema,
    ReservationUsageResponseSchema,
    RoomAvailabilityResponseSchema,
    RoomBlockCreatedResponseSchema,
    RoomBlockListResponseSchema,
    RoomBlockPreviewResponseSchema,
    RoomReservationCreatedResponseSchema,
    RoomReservationPreviewResponseSchema,
} from "@sigm4/schemas";
import type {
    BlockDeactivated,
    HasilPenggunaan,
    ReservationCancelled,
    ReservationListQuery,
    ReservationUsage,
    RoomBlockCreated,
    RoomBlockInput,
    RoomBlockPreview,
    RoomReservationBody,
    RoomReservationCreated,
    RoomReservationPreview,
} from "@sigm4/schemas";
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

/** FR-07.5 (PR-03-13, keputusan 19): jadwal tetap & blokade manual sebuah ruangan. */
export const daftarBlokadeQuery = (roomId: string) =>
    queryOptions({
        queryKey: ["rooms", roomId, "blocks"],
        queryFn: async () => RoomBlockListResponseSchema.parse((await api.get(`/rooms/${roomId}/blocks`)).data).data,
    });

/** A1/A4: kemunculan, libur dilewati, dan bentrok — tanpa efek (pola keputusan 14f). */
export async function pratinjauBlokade(roomId: string, isian: RoomBlockInput): Promise<RoomBlockPreview> {
    return RoomBlockPreviewResponseSchema.parse((await api.post(`/rooms/${roomId}/blocks/preview`, isian)).data).data;
}

/** A1 (keputusan 19c): `batalkan` = keputusan eksplisit membatalkan reservasi yang bentrok (beralasan, NT-08). */
export async function buatBlokade(roomId: string, isian: RoomBlockInput, batalkan?: { readonly alasan: string }): Promise<RoomBlockCreated> {
    return RoomBlockCreatedResponseSchema.parse((await api.post(`/rooms/${roomId}/blocks`, batalkan === undefined ? isian : { ...isian, batalkan_bentrok: batalkan })).data).data;
}

/** A3 (keputusan 19f): hanya penonaktifan; slot mendatang dilepas. */
export async function nonaktifkanBlokade(jenis: "JADWAL_TETAP" | "BLOKADE_MANUAL", id: string): Promise<BlockDeactivated> {
    const path = jenis === "JADWAL_TETAP" ? `/room-fixed-schedules/${id}/status` : `/room-manual-blocks/${id}/status`;
    return BlockDeactivatedResponseSchema.parse((await api.patch(path, { status: "NONAKTIF" })).data).data;
}
