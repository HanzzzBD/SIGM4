// Skema Zod keputusan persetujuan (FR-10.2, RE-09, SDD-APR-17; SDD-API-01).
// Kewajiban catatan (BR-042, keputusan 69) adalah aturan bisnis → 422 di layanan,
// bukan di sini.

import { z } from "zod";

export const InstanceIdParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export { DecideBodySchema, DecideResponseSchema, ListPendingQuerySchema, ListPendingResponseSchema } from "@sigm4/schemas";
