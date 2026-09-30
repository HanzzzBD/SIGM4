// Skema Zod konfigurasi approval rule + pratinjau (FR-10.1, Lampiran D.5, RE-07,
// SDD-02 §4.5b; keputusan 77). Lapis STRUKTUR saja — makna (kondisi D.2/D.3, role,
// pengguna) divalidasi layanan agar seluruh pelanggaran kembali sekaligus (RE-08).

import { z } from "zod";
import { JENIS_PENGAJUAN } from "../services/dsl.js";

export const RuleIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const IdPengguna = z.number().int().positive();

/** Lampiran D.5 — satu langkah. */
export const LangkahAturanSchema = z
    .strictObject({
        order: z.number().int().positive(),
        approver_type: z.enum(["role", "user"]),
        approver_role: z.string().trim().min(1).optional(),
        approver_user_id: IdPengguna.optional(),
        sla_hours: z.number().int().min(1).max(720),
        on_sla_breach: z.enum(["remind", "escalate"]),
        escalate_to_user_id: IdPengguna.optional(),
    })
    .superRefine((l, ctx) => {
        if (l.approver_type === "role" && (l.approver_role === undefined || l.approver_user_id !== undefined)) {
            ctx.addIssue({ code: "custom", path: ["approver_role"], message: "Langkah berbasis role wajib `approver_role` saja." });
        }
        if (l.approver_type === "user" && (l.approver_user_id === undefined || l.approver_role !== undefined)) {
            ctx.addIssue({ code: "custom", path: ["approver_user_id"], message: "Langkah berbasis pengguna wajib `approver_user_id` saja." });
        }
        if (l.on_sla_breach === "escalate" && l.escalate_to_user_id === undefined) {
            ctx.addIssue({ code: "custom", path: ["escalate_to_user_id"], message: "Eskalasi wajib menetapkan `escalate_to_user_id`." });
        }
        if (l.on_sla_breach === "remind" && l.escalate_to_user_id !== undefined) {
            ctx.addIssue({ code: "custom", path: ["escalate_to_user_id"], message: "`escalate_to_user_id` hanya untuk `on_sla_breach = escalate`." });
        }
    });

const FallbackSchema = z
    .strictObject({ approver_type: z.enum(["role", "user"]), approver_role: z.string().trim().min(1).optional(), approver_user_id: IdPengguna.optional() })
    .refine((f) => (f.approver_type === "role" ? f.approver_role !== undefined && f.approver_user_id === undefined : f.approver_user_id !== undefined && f.approver_role === undefined), {
        message: "Fallback berbasis role wajib `approver_role` saja; berbasis pengguna wajib `approver_user_id` saja.",
    });

/** Definisi aturan utuh — body POST/PUT dan `aturan_draf` pratinjau. */
export const DefinisiAturanSchema = z
    .strictObject({
        jenis_pengajuan: z.enum(JENIS_PENGAJUAN),
        prioritas: z.number().int().min(0).max(1_000_000),
        kondisi: z.unknown().default({}),
        steps: z.array(LangkahAturanSchema).min(1).max(10),
        fallback_approver: FallbackSchema.nullable().default(null),
        // BR-039a: `auto_approve` sengaja tidak sah (SDD-02 §4.5).
        terminal_on_exhausted_escalation: z.enum(["hold_and_alert", "auto_reject"]).default("hold_and_alert"),
    })
    .refine((a) => a.steps.every((l, i) => l.order === i + 1), { path: ["steps"], message: "`order` langkah wajib 1..n berurutan tanpa celah." });

export type DefinisiAturan = z.infer<typeof DefinisiAturanSchema>;

/** UX-04: menonaktifkan aturan wajib beralasan (PR-02-34); mengaktifkan kembali tidak — pola `PATCH /users/{id}/status`. */
export const StatusAturanBodySchema = z
    .strictObject({ status_aktif: z.boolean(), alasan: z.string().trim().min(1).max(500).optional() })
    .superRefine((b, ctx) => {
        if (!b.status_aktif && b.alasan === undefined) ctx.addIssue({ code: "custom", path: ["alasan"], message: "Alasan wajib diisi saat menonaktifkan aturan." });
    });

const FaktaSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))]));

export const PreviewBodySchema = z.strictObject({
    jenis_pengajuan: z.enum(JENIS_PENGAJUAN),
    fakta: FaktaSchema.default({}),
    pemohon_id: IdPengguna.optional(),
    /** Draf ber-`id` menggantikan versi tersimpannya; tanpa `id` = aturan baru. */
    aturan_draf: z.intersection(DefinisiAturanSchema, z.object({ id: z.number().int().positive().optional() })).optional(),
});

const Target = z.object({ kode: z.string().nullable(), nama: z.string().nullable() }).nullable();
const Pengguna = z.object({ id: z.number(), nama: z.string().nullable() }).nullable();

const AturanTersimpan = z.object({
    id: z.number(),
    jenis_pengajuan: z.string(),
    prioritas: z.number(),
    status_aktif: z.boolean(),
    versi: z.number(),
    kondisi: z.unknown(),
    steps: z.array(
        z.object({
            order: z.number(),
            approver_type: z.enum(["role", "user"]),
            approver_role: z.string().optional(),
            approver_user_id: z.number().optional(),
            sla_hours: z.number(),
            on_sla_breach: z.enum(["remind", "escalate"]),
            escalate_to_user_id: z.number().optional(),
        }),
    ),
    fallback_approver: z.object({ approver_type: z.enum(["role", "user"]), approver_role: z.string().optional(), approver_user_id: z.number().optional() }).nullable(),
    terminal_on_exhausted_escalation: z.enum(["hold_and_alert", "auto_reject"]),
    created_at: z.string(),
    updated_at: z.string(),
});

export const RuleResponseSchema = z.object({ success: z.literal(true), data: AturanTersimpan, meta: z.null() });
export const RuleListResponseSchema = z.object({ success: z.literal(true), data: z.array(AturanTersimpan), meta: z.null() });

export const PreviewResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        terpilih: z.object({ rule_id: z.number().nullable(), draf: z.boolean(), bawaan: z.boolean(), prioritas: z.number().nullable(), versi: z.number().nullable() }),
        cocok: z.array(z.object({ rule_id: z.number().nullable(), draf: z.boolean(), prioritas: z.number() })),
        langkah: z.array(
            z.object({
                urutan: z.number(),
                approver: z.object({ tipe: z.enum(["role", "user"]), role: Target, user: Pengguna }),
                sla_jam: z.number(),
                on_sla_breach: z.enum(["remind", "escalate"]),
                eskalasi_ke: Pengguna,
                fallback: z.boolean(),
                akan_dilewati: z.string().nullable(),
            }),
        ),
    }),
    meta: z.null(),
});
