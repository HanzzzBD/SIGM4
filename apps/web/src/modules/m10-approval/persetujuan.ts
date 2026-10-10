// Kontrak eksekusi persetujuan di klien web (m10 §7 `GET /approvals/pending`, `POST /approvals/{id}/decide`;
// FR-10.2, RE-09, ID-01; keputusan 69 & 92d). Respons diurai Zod (SDD-FE-05) — cermin skema `apps/api`.

import { queryOptions } from "@tanstack/react-query";
import { JENIS_PENGAJUAN, LABEL_JENIS_PENGAJUAN, labelEnum } from "@sigm4/schemas";
// zod/mini: API skema yang sama dengan bundel jauh lebih kecil (NFR-P-03, SDD-11 §4.7).
import { z } from "zod/mini";
import { ApiError, api } from "../../shared/api";

const ItemPending = z.object({
    instance_id: z.number(),
    jenis_pengajuan: z.enum(JENIS_PENGAJUAN),
    referensi_id: z.number(),
    pemohon: z.object({ id: z.number(), nama: z.nullable(z.string()) }),
    urutan: z.number(),
    sla_deadline: z.nullable(z.string()),
    sla: z.nullable(z.object({ sisa_menit_kerja: z.number(), terlambat: z.boolean() })),
    created_at: z.string(),
    atas_nama_user_id: z.nullable(z.number()),
});
export type ItemPending = z.infer<typeof ItemPending>;

const PendingSchema = z.object({
    data: z.array(ItemPending),
    meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }),
});

export const KUNCI_PENDING = ["approvals", "pending"] as const;

/** FR-10.2 langkah 2: server mengurutkan tenggat SLA terdekat lalu waktu pengajuan (urgensi). */
export const pendingQuery = (page: number, perPage = 25) =>
    queryOptions({
        queryKey: [...KUNCI_PENDING, page, perPage],
        staleTime: 0,
        queryFn: async () => PendingSchema.parse((await api.get("/approvals/pending", { params: { page, per_page: perPage } })).data),
    });

export type Keputusan = "DISETUJUI" | "DITOLAK" | "PERLU_REVISI";

const DecideSchema = z.object({ data: z.object({ instance_id: z.number(), keputusan: z.enum(["DISETUJUI", "DITOLAK", "PERLU_REVISI"]), status: z.string() }) });

/** ID-01: satu kunci per niat keputusan — ketuk ganda tidak menghasilkan dua keputusan. */
export async function putuskan(instanceId: number, body: { readonly urutan: number; readonly keputusan: Keputusan; readonly catatan: string | null }, kunci: string) {
    return DecideSchema.parse((await api.post(`/approvals/${String(instanceId)}/decide`, body, { headers: { "Idempotency-Key": kunci } })).data).data;
}

/** RE-09: yang kalah menerima pemutus + waktunya lewat `details` (keputusan 69). */
export function pemutusLain(g: unknown): { readonly nama: string; readonly pada: string | null } | null {
    if (!(g instanceof ApiError) || g.kode !== "APPROVAL_ALREADY_DECIDED") return null;
    const nama = g.details.find((d) => d.field === "diputuskan_oleh")?.message;
    return { nama: nama ?? "approver lain", pada: g.details.find((d) => d.field === "diputuskan_pada")?.message ?? null };
}

/** Nomor tampil pengajuan lintas jenis — pola label NT-01 (`notification-sources.ts`). */
export const labelPengajuan = (jenis: string, referensiId: number) => `${labelEnum(LABEL_JENIS_PENGAJUAN, jenis)} #${String(referensiId)}`;

/** Sisa SLA dalam jam kerja, dibulatkan ke bawah; di bawah satu jam ditulis menit (CAL-01). */
export function teksSisaSla(sla: { readonly sisa_menit_kerja: number; readonly terlambat: boolean }): string {
    if (sla.terlambat) return "Melewati SLA";
    const jam = Math.floor(sla.sisa_menit_kerja / 60);
    return jam >= 1 ? `Sisa ${String(jam)} jam kerja` : `Sisa ${String(sla.sisa_menit_kerja)} menit kerja`;
}
