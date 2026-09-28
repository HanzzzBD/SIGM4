// Kontrak event `ApprovalSlaBreached` (SDD-07 §4.3, keputusan 73d/75) — dibaca konsumen
// M-17 di PR-02-25. Uji ini gagal bila bentuk payload berubah tanpa kontraknya ikut berubah.

import { describe, expect, it } from "vitest";
import { ApprovalSlaBreachedPayloadSchema, NOTIFIKASI_TINDAKAN_SLA } from "../../../src/modules/m10-approval/index.js";

const sah = (p: unknown) => ApprovalSlaBreachedPayloadSchema.safeParse(p).success;

describe("kontrak ApprovalSlaBreached", () => {
    it("menerima ketiga tindakan dalam bentuk kanoniknya", () => {
        expect(sah({ instance_id: 1, urutan: 1, tindakan: "REMIND" })).toBe(true);
        expect(sah({ instance_id: 1, urutan: 2, tindakan: "ESCALATE", eskalasi_ke: 9 })).toBe(true);
        expect(sah({ instance_id: 1, urutan: 1, tindakan: "EXHAUSTED" })).toBe(true);
    });

    it.each([
        ["ESCALATE tanpa eskalasi_ke", { instance_id: 1, urutan: 1, tindakan: "ESCALATE" }],
        ["eskalasi_ke pada tindakan lain", { instance_id: 1, urutan: 1, tindakan: "REMIND", eskalasi_ke: 9 }],
        ["tindakan tak dikenal (mis. auto_reject — itu ApprovalDecided)", { instance_id: 1, urutan: 1, tindakan: "REJECT" }],
        ["field tambahan", { instance_id: 1, urutan: 1, tindakan: "EXHAUSTED", terminal: "hold_and_alert" }],
        ["id bukan bilangan bulat positif", { instance_id: "1", urutan: 0, tindakan: "REMIND" }],
    ])("menolak %s", (_, payload) => {
        expect(sah(payload)).toBe(false);
    });

    it("pemetaan tindakan → notifikasi PRD m10 §9", () => {
        expect(NOTIFIKASI_TINDAKAN_SLA).toEqual({ REMIND: "NT-06", ESCALATE: "NT-07", EXHAUSTED: "NT-47" });
    });
});
