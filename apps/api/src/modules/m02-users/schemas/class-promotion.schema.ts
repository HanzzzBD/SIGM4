// Skema Zod kenaikan kelas massal (SL-02, SDD-API-01, SDD-API-11).

import { z } from "zod";
import { BATAS_ITEM_KENAIKAN } from "../services/class-promotion.service.js";

const IdSchema = z.coerce.number().int().positive();

/** `NAIK` menetapkan kelas pada tahun ajaran itu; `LULUS` menandainya lulus. */
const ItemSchema = z.discriminatedUnion("tindakan", [
    z.object({ user_id: IdSchema, tindakan: z.literal("NAIK"), kelas_id: IdSchema }),
    z.object({ user_id: IdSchema, tindakan: z.literal("LULUS") }),
]);

export const ClassPromotionBodySchema = z.object({
    academic_year_id: IdSchema,
    items: z.array(ItemSchema).min(1).max(BATAS_ITEM_KENAIKAN),
});

const OutcomeSchema = z.object({
    user_id: z.number(),
    tindakan: z.enum(["NAIK", "LULUS"]),
    status: z.enum(["SUKSES", "GAGAL"]),
    pesan: z.string().nullable(),
    /** SL-04: kewajiban yang akan memblokir penonaktifan lulusan; kosong bila tidak ada. */
    kewajiban: z.array(z.object({ jenis: z.string(), keterangan: z.string() })),
});

export const ClassPromotionResponseSchema = z.object({
    success: z.literal(true),
    data: z.object({
        total: z.number(),
        sukses: z.number(),
        gagal: z.number(),
        baris: z.array(OutcomeSchema),
    }),
    meta: z.null(),
});
