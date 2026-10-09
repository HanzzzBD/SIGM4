import { queryOptions } from "@tanstack/react-query";
import { RoomAvailabilityResponseSchema } from "@sigm4/schemas";
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
