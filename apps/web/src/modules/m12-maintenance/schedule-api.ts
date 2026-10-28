import { queryOptions } from "@tanstack/react-query";
import { z } from "zod/mini";
import { MaintenanceScheduleListSchema, MaintenanceScheduleResponseSchema } from "@sigm4/schemas";
import type { MaintenanceScheduleInput } from "@sigm4/schemas";
import { api } from "../../shared/api";
export const scheduleListQuery = (page: number, status: string, days: string) => queryOptions({ queryKey: ["maintenance-schedules", page, status, days], queryFn: async () => MaintenanceScheduleListSchema.parse((await api.get("/maintenance-schedules", { params: { page, ...(status ? { "filter[status]": status } : {}), ...(days ? { "filter[jatuh_tempo_hari]": Number(days) } : {}) } })).data) });
export const scheduleDetailQuery = (id: string) => queryOptions({ queryKey: ["maintenance-schedules", id], queryFn: async () => MaintenanceScheduleResponseSchema.parse((await api.get(`/maintenance-schedules/${id}`)).data).data });
export const scheduleOrdersQuery = (id: string, page: number) => queryOptions({ queryKey: ["maintenance-schedules", id, "orders", page], queryFn: async () => z.object({ data: z.array(z.object({ id: z.string(), nomor: z.string(), status: z.string(), menunggu_ketersediaan_aset: z.optional(z.boolean()), target_selesai: z.string() })) }).parse((await api.get(`/maintenance-schedules/${id}/work-orders`, { params: { page } })).data).data });
export const scheduleOptionsQuery = queryOptions({ queryKey: ["maintenance-options"], queryFn: async () => z.object({ data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string(), interval_preventif_hari: z.nullable(z.number()) })), technicians: z.array(z.object({ id: z.string(), nama: z.string() })) }) }).parse((await api.get("/maintenance-schedules/options")).data).data });
export const scheduleAssetsQuery = (category: string, page: number) => queryOptions({ queryKey: ["maintenance-assets", category, page], enabled: !!category, queryFn: async () => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), kode_barang: z.string() })) }).parse((await api.get("/maintenance-schedules/assets", { params: { category_id: category, page } })).data).data });
export async function saveSchedule(input: MaintenanceScheduleInput, id?: string) {
    const config = { headers: { "Idempotency-Key": crypto.randomUUID() } };
    return MaintenanceScheduleResponseSchema.parse((await (id ? api.put(`/maintenance-schedules/${id}`, input, config) : api.post("/maintenance-schedules", input, config))).data).data;
}
export async function scheduleAction(id: string, action: "skip" | "deactivate", alasan: string) {
    return MaintenanceScheduleResponseSchema.parse((await api.post(`/maintenance-schedules/${id}/${action}`, { alasan }, { headers: { "Idempotency-Key": crypto.randomUUID() } })).data).data;
}
