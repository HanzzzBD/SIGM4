import { describe, expect, it } from "vitest";
import { dueTone, formFromSchedule, scheduleBody } from "../src/features/workorders/schedules.js";

const form = { nama: "Servis AC", scope: "kategori" as const, category: "3", asset: "", interval: "90", start: "2026-11-03", technician: "7", checklist: " Bersihkan filter \n\nCek freon " };

describe("MS-63/64 jadwal pemeliharaan (FR-12.2)", () => {
    it("targets exactly one category or asset and keeps non-empty checklist lines", () => {
        expect(scheduleBody(form)).toEqual({ body: { nama: "Servis AC", category_id: 3, interval_hari: 90, tanggal_mulai: "2026-11-03", checklist: ["Bersihkan filter", "Cek freon"], teknisi_default_id: 7 } });
        expect(scheduleBody({ ...form, scope: "aset", asset: "12" })).toMatchObject({ body: { asset_id: 12 } });
        expect(scheduleBody({ ...form, scope: "aset", asset: "12" })).not.toMatchObject({ body: { category_id: 3 } });
        expect(scheduleBody({ ...form, scope: "aset" })).toHaveProperty("error");
        expect(scheduleBody({ ...form, checklist: "  " })).toHaveProperty("error");
        expect(scheduleBody({ ...form, interval: "0" })).toHaveProperty("error");
        expect(scheduleBody({ ...form, technician: "" })).toHaveProperty("error");
    });
    it("round-trips an existing schedule into the form", () => {
        expect(formFromSchedule({ nama: "x", asset_id: "4", category_id: null, interval_hari: 30, tanggal_mulai: "2026-01-01", teknisi_default_id: "2", checklist: ["a", "b"] })).toEqual({ nama: "x", scope: "aset", category: "", asset: "4", interval: "30", start: "2026-01-01", technician: "2", checklist: "a\nb" });
    });
    it("warns within seven days and flags overdue schedules", () => {
        expect(dueTone("2026-11-01", "2026-11-03")).toBe("error");
        expect(dueTone("2026-11-10", "2026-11-03")).toBe("warning");
        expect(dueTone("2026-11-11", "2026-11-03")).toBe("info");
        expect(dueTone(null, "2026-11-03")).toBe("pending");
    });
});
