// Kontrak event `ApprovalSlaBreached` (SDD-07 §4.3; keputusan 73d, 75). Satu sumber bagi
// penerbit (`SlaTracker`, memvalidasi sebelum publish) dan konsumen M-17 (`PR-02-25`).

import { z } from "zod";

const Dasar = { instance_id: z.number().int().positive(), urutan: z.number().int().positive() };

export const ApprovalSlaBreachedPayloadSchema = z.discriminatedUnion("tindakan", [
    z.strictObject({ ...Dasar, tindakan: z.literal("REMIND") }),
    z.strictObject({ ...Dasar, tindakan: z.literal("ESCALATE"), eskalasi_ke: z.number().int().positive() }),
    z.strictObject({ ...Dasar, tindakan: z.literal("EXHAUSTED") }),
]);

export type ApprovalSlaBreachedPayload = z.infer<typeof ApprovalSlaBreachedPayloadSchema>;

/** PRD m10 §9: tindakan → kode notifikasi. `auto_reject` bukan tindakan ini (→ `ApprovalDecided`, NT-03). */
export const NOTIFIKASI_TINDAKAN_SLA = { REMIND: "NT-06", ESCALATE: "NT-07", EXHAUSTED: "NT-47" } as const satisfies Record<
    ApprovalSlaBreachedPayload["tindakan"],
    string
>;
