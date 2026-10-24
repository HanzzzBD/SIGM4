// Skema Zod endpoint dashboard (FR-15.1; SDD-14 §4.3a, keputusan 82; SDD-API-01).

import { z } from "zod";

const RENTANG = ["7_hari", "30_hari", "semester", "tahun_ajaran"] as const;

export const CardIdParamSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/) });

/** 19.1: rentang bawaan 30 hari; `segarkan=true` = tombol muat ulang (melewati cache). */
export const CardQuerySchema = z.strictObject({
    rentang: z.enum(RENTANG).default("30_hari"),
    segarkan: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
});

export { DashboardManifestResponseSchema as ManifestResponseSchema, DashboardCardResponseSchema as CardResponseSchema } from "@sigm4/schemas";
