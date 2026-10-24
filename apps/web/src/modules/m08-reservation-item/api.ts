import { queryOptions } from "@tanstack/react-query";
import { AssetAvailabilityResponseSchema, RoomReservationCreatedResponseSchema, RoomReservationPreviewResponseSchema } from "@sigm4/schemas";
import type { AssetAvailabilityQuery } from "@sigm4/schemas";
import type { AssetReservationBody } from "@sigm4/schemas";
import { api } from "../../shared/api";

export const availabilityQuery = (query: AssetAvailabilityQuery) => queryOptions({
    queryKey: ["assets", "availability", query],
    queryFn: async ({ signal }) => AssetAvailabilityResponseSchema.parse((await api.get("/assets/availability", { params: query, signal })).data),
    // AV-04 / UXP-04: selalu muat ulang; jangan tampilkan data rentang sebelumnya.
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: "always", refetchOnMount: "always",
});
export const previewAssetReservation = async (body: AssetReservationBody) => RoomReservationPreviewResponseSchema.parse((await api.post("/reservations/preview", body)).data).data;
export const submitAssetReservation = async (body: AssetReservationBody, key: string) => RoomReservationCreatedResponseSchema.parse((await api.post("/reservations", body, { headers: { "Idempotency-Key": key } })).data).data;
