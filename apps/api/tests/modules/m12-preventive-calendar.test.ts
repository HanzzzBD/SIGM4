import { describe, expect, it } from "vitest";
import { MaintenanceScheduleInputSchema } from "@sigm4/schemas";
import { addCalendarDays, nextWorkingDate } from "../../src/modules/m12-maintenance/services/preventive-calendar.js";
describe("PR-04-07 preventive calendar", () => {
    it("moves weekends and consecutive holidays forward across month/year boundaries", () => {
        expect(nextWorkingDate("2027-12-31", new Set([1, 2, 3, 4, 5]), new Set(["2027-12-31", "2028-01-03"]))).toBe("2028-01-04");
        expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
        expect(addCalendarDays("2028-02-28", 30)).toBe("2028-03-29");
    });
    it("rejects calendars without usable work days", () => {
        expect(() => nextWorkingDate("2027-01-01", new Set(), new Set())).toThrow();
    });
    it("requires exactly one target and a nonempty checklist, accepts category interval overrides", () => {
        const input = { nama: "Servis AC", category_id: 1, interval_hari: 45, tanggal_mulai: "2027-11-22", teknisi_default_id: 2, checklist: ["Bersihkan filter"] };
        expect(MaintenanceScheduleInputSchema.parse(input).interval_hari).toBe(45);
        expect(MaintenanceScheduleInputSchema.safeParse({ ...input, asset_id: 2 }).success).toBe(false);
        expect(MaintenanceScheduleInputSchema.safeParse({ ...input, checklist: [" "] }).success).toBe(false);
    });
});
