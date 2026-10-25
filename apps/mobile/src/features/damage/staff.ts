// Tindakan petugas atas tiket kerusakan & work order mobile (FR-11.2, FR-12.1, FR-12.4; MS-59…62) — kontrak
// sama dengan web P-39/P-41/P-42/P-43 (SDD-MOB-13).
import type { AxiosInstance } from "axios";
import { z } from "zod";
import { DamageReportListResponseSchema, DamageReportVerifiedResponseSchema, DamageReportVerifySchema, WorkOrderCreateSchema, WorkOrderResponseSchema } from "@sigm4/schemas";
import type { DamageReportListQuery } from "@sigm4/schemas";

export const loadReports = async (api: AxiosInstance, q: DamageReportListQuery, signal: AbortSignal) => DamageReportListResponseSchema.parse((await api.get("/damage-reports", { params: q, signal })).data);
export const verifyReport = async (api: AxiosInstance, id: string, body: unknown) => DamageReportVerifiedResponseSchema.parse((await api.post(`/damage-reports/${id}/verify`, body)).data).data;
export const loadTechnicians = async (api: AxiosInstance, signal: AbortSignal) => z.object({ data: z.array(z.object({ id: z.string(), nama: z.string(), work_order_aktif: z.string() })) }).parse((await api.get("/work-orders/technicians", { signal })).data).data;
/** ID-01: kunci yang sama untuk isian yang sama. */
export const createWorkOrder = async (api: AxiosInstance, body: unknown, key: string) => WorkOrderResponseSchema.parse((await api.post("/work-orders", body, { headers: { "Idempotency-Key": key } })).data).data;

export const DECISIONS = [{ value: "TINDAK_LANJUT", label: "Buat work order" }, { value: "PERBAIKAN_RINGAN", label: "Perbaikan ringan" }, { value: "TOLAK", label: "Tolak" }] as const;
export type Decision = (typeof DECISIONS)[number]["value"];
export interface Assignment { technician: string; target: string; estimate: string; disableAsset: boolean }
/** FR-11.2 langkah 3–4 (keputusan 21b/c web): catatan wajib bila tiket ditutup; penugasan hanya untuk tindak lanjut; Hilang tidak dari sini (BR-012). */
export function verifyBody(input: { decision: Decision; note: string; condition: "" | "BAIK" | "RUSAK_RINGAN" | "RUSAK_BERAT"; conditionReason: string; assign: Assignment | null }): { body: unknown } | { error: string } {
    const p = DamageReportVerifySchema.safeParse({
        keputusan: input.decision, ...(input.note.trim() ? { catatan: input.note.trim() } : {}),
        ...(input.condition ? { kondisi_aset: { kondisi: input.condition, ...(input.conditionReason.trim() ? { alasan: input.conditionReason.trim() } : {}) } } : {}),
        ...(input.decision === "TINDAK_LANJUT" && input.assign ? { work_order: assignment(input.assign) } : {}),
    });
    return p.success ? { body: p.data } : { error: p.error.issues.map((i) => i.message).join(" ") };
}
const assignment = (a: Assignment) => ({ teknisi_id: Number(a.technician), target_selesai: a.target, estimasi_biaya: a.estimate.trim() === "" ? 0 : Number(a.estimate), nonaktifkan_aset: a.disableAsset });
/** FR-12.1: dari tiket, atau tepat satu aset/ruangan; teknisi, target, prioritas wajib. */
export function workOrderBody(input: { ticket: string; asset: string; room: string; description: string; priority: "RENDAH" | "SEDANG" | "TINGGI" | "KRITIS"; assign: Assignment }): { body: unknown } | { error: string } {
    if (!input.assign.technician) return { error: "Pilih teknisi." };
    const p = WorkOrderCreateSchema.safeParse({ ...assignment(input.assign), ...(input.ticket ? { damage_report_id: Number(input.ticket) } : {}), ...(!input.ticket && input.asset ? { asset_id: Number(input.asset) } : {}), ...(!input.ticket && !input.asset && input.room ? { room_id: Number(input.room) } : {}), deskripsi: input.description, prioritas: input.priority });
    return p.success ? { body: p.data } : { error: p.error.issues.map((i) => i.message).join(" ") };
}
