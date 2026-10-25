// Jadwal pemeliharaan preventif mobile (FR-12.2; MS-63, MS-64) — kontrak sama dengan web P-45/P-46.
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { MaintenanceReasonSchema, MaintenanceScheduleInputSchema, MaintenanceScheduleListSchema, MaintenanceScheduleResponseSchema } from "@sigm4/schemas";
import type { MaintenanceScheduleInput } from "@sigm4/schemas";

const key = (k: string) => ({ headers: { "Idempotency-Key": k } });
export const loadSchedules = async (api: AxiosInstance, q: { page: number; status: string; days: string }, signal: AbortSignal) => MaintenanceScheduleListSchema.parse((await api.get("/maintenance-schedules", { params: { page: q.page, ...(q.status ? { "filter[status]": q.status } : {}), ...(q.days ? { "filter[jatuh_tempo_hari]": Number(q.days) } : {}) }, signal })).data);
export const loadSchedule = async (api: AxiosInstance, id: string, signal: AbortSignal) => MaintenanceScheduleResponseSchema.parse((await api.get(`/maintenance-schedules/${id}`, { signal })).data).data;
export const loadScheduleOrders = async (api: AxiosInstance, id: string, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), nomor: z.string(), status: z.string(), menunggu_ketersediaan_aset: z.boolean().optional(), target_selesai: z.string() })) }).parse((await api.get(`/maintenance-schedules/${id}/work-orders`, { params: { page: 1 }, signal })).data).data;
export const loadOptions = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string(), interval_preventif_hari: z.number().nullable() })), technicians: z.array(z.object({ id: z.string(), nama: z.string() })) }) }).parse((await api.get("/maintenance-schedules/options", { signal })).data).data;
export const loadScheduleAssets = async (api: AxiosInstance, category: string, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), kode_barang: z.string() })) }).parse((await api.get("/maintenance-schedules/assets", { params: { category_id: category, page: 1 }, signal })).data).data;
export const saveSchedule = async (api: AxiosInstance, input: MaintenanceScheduleInput, k: string, id?: string) => MaintenanceScheduleResponseSchema.parse((await (id ? api.put(`/maintenance-schedules/${id}`, input, key(k)) : api.post("/maintenance-schedules", input, key(k)))).data).data;
/** FR-12.2 A2/A3: lewati satu kemunculan atau nonaktifkan, keduanya beralasan. */
export const scheduleAction = async (api: AxiosInstance, id: string, action: "skip" | "deactivate", alasan: string, k: string) => MaintenanceScheduleResponseSchema.parse((await api.post(`/maintenance-schedules/${id}/${action}`, MaintenanceReasonSchema.parse({ alasan }), key(k))).data).data;

export interface ScheduleForm { nama: string; scope: "kategori" | "aset"; category: string; asset: string; interval: string; start: string; technician: string; checklist: string }
/** Satu aset ATAU satu kategori; checklist satu butir per baris (1–100). */
export function scheduleBody(f: ScheduleForm): { body: MaintenanceScheduleInput } | { error: string } {
    const p = MaintenanceScheduleInputSchema.safeParse({ nama: f.nama, ...(f.scope === "aset" ? { asset_id: f.asset ? Number(f.asset) : undefined } : { category_id: f.category ? Number(f.category) : undefined }), interval_hari: Number(f.interval), tanggal_mulai: f.start, checklist: f.checklist.split("\n").map((s) => s.trim()).filter(Boolean), teknisi_default_id: f.technician ? Number(f.technician) : undefined });
    return p.success ? { body: p.data } : { error: p.error.issues[0]?.message ?? "Lengkapi jadwal." };
}
export const formFromSchedule = (s: { nama: string; asset_id: string | null; category_id: string | null; interval_hari: number; tanggal_mulai: string; teknisi_default_id: string; checklist: readonly string[] }): ScheduleForm => ({ nama: s.nama, scope: s.asset_id ? "aset" : "kategori", category: s.category_id ?? "", asset: s.asset_id ?? "", interval: String(s.interval_hari), start: s.tanggal_mulai, technician: s.teknisi_default_id, checklist: s.checklist.join("\n") });
/** Jatuh tempo ≤ 7 hari menjadi peringatan; lewat menjadi galat (FOUNDATIONS §1.8). */
export function dueTone(due: string | null, today: string): "error" | "warning" | "info" | "pending" {
    if (!due) return "pending";
    if (due < today) return "error";
    return Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000) <= 7 ? "warning" : "info";
}
