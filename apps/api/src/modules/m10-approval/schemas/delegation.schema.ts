// Skema Zod delegasi approver (FR-10.2 A3, SDD-APR-16, SDD-API-01). Tanggal
// `YYYY-MM-DD` (kalender WIB, inklusif) — string ISO yang urutan leksikalnya
// sama dengan urutan waktunya, pola `calendar.schema.ts` M-20.

import { z } from "zod";

const Tanggal = z.iso.date();

/** `POST /approvals/delegate` — pemberi selalu pemanggil, tidak dikirim klien. */
export const DelegateBodySchema = z
    .object({
        penerima_id: z.coerce.number().int().positive(),
        mulai: Tanggal,
        selesai: Tanggal,
    })
    .refine((v) => v.mulai <= v.selesai, {
        path: ["selesai"],
        message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    });

export const DelegateResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        id: z.string(),
        pemberi_id: z.string(),
        penerima_id: z.string(),
        mulai: z.string(),
        selesai: z.string(),
        created_at: z.string(),
    }),
    meta: z.null(),
});
