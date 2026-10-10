// Skema Zod keputusan persetujuan (FR-10.2, RE-09, SDD-APR-17; SDD-API-01).
// Kewajiban catatan (BR-042, keputusan 69) adalah aturan bisnis → 422 di layanan,
// bukan di sini.

import { z } from "zod";

export const InstanceIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

/** `POST /approvals/{id}/decide` — `urutan` = langkah yang dilihat approver (keputusan 69). */
export const DecideBodySchema = z.object({
    urutan: z.coerce.number().int().positive(),
    keputusan: z.enum(["DISETUJUI", "DITOLAK", "PERLU_REVISI"]),
    catatan: z.string().trim().max(2000).nullable().optional(),
});

export const DecideResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        instance_id: z.number(),
        urutan: z.number(),
        keputusan: z.enum(["DISETUJUI", "DITOLAK", "PERLU_REVISI"]),
        status: z.enum(["MENUNGGU", "DISETUJUI", "DITOLAK", "PERLU_REVISI", "DIBATALKAN"]),
        langkah_aktif: z.number().nullable(),
        atas_nama_user_id: z.number().nullable(),
    }),
    meta: z.null(),
});

export const ListPendingQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    per_page: z.coerce.number().int().positive().max(100).default(25),
});

export const ListPendingResponseSchema = z.object({
    success: z.literal(true),
    data: z.array(
        z.object({
            instance_id: z.number(),
            jenis_pengajuan: z.string(),
            referensi_id: z.number(),
            pemohon: z.object({ id: z.number(), nama: z.string().nullable() }),
            urutan: z.number(),
            sla_deadline: z.string().nullable(),
            /** Sisa SLA dalam menit kerja (CAL-01, keputusan 92d log phase-02) — P-37 urgensi. */
            sla: z.object({ sisa_menit_kerja: z.number(), terlambat: z.boolean() }).nullable(),
            created_at: z.string(),
            atas_nama_user_id: z.number().nullable(),
        }),
    ),
    meta: z.object({ page: z.number(), per_page: z.number(), total: z.number(), total_pages: z.number() }),
});
