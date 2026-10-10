import { queryOptions } from "@tanstack/react-query";
import { RoomAvailabilityResponseSchema, RoomReservationCreatedResponseSchema, RoomReservationPreviewResponseSchema } from "@sigm4/schemas";
import type { RoomReservationBody, RoomReservationCreated, RoomReservationPreview } from "@sigm4/schemas";
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
