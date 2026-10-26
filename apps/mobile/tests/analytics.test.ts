import { describe, expect, it } from "vitest";
import { chartValues, decimalDelta, decimalDisplay, displayValue, drilldown, filterQuery, summaryDelta } from "../src/features/analytics/model.js";
import { formatOf, safeFileName } from "../src/shared/export/format.js";

const money = { tipe: "DECIMAL" as const, sensitivitas: "ASSET_FINANCIAL" as const };
describe("MS-74/75 analitik (FR-16.x)", () => {
    it("formats exact decimals and computes the comparison delta beyond JS precision", () => {
        expect(decimalDisplay("12345678901234567890.50")).toBe("12.345.678.901.234.567.890,50");
        expect(decimalDisplay("-1500")).toBe("-1.500");
        expect(decimalDelta("1000.5", "999.75")).toBe("0.75");
        expect(decimalDelta("10", "12.5")).toBe("-2.5");
        expect(displayValue("2500000.00", money)).toBe("Rp2.500.000,00");
        expect(displayValue(12, { tipe: "NUMBER", sensitivitas: "PUBLIC", satuan: "jam" })).toBe("12 jam");
        expect(displayValue(null, money)).toBe("Belum tersedia");
        expect(displayValue(true, { tipe: "BOOLEAN", sensitivitas: "PUBLIC" })).toBe("Ya");
        expect(summaryDelta(10, 7, { tipe: "NUMBER" })).toBe(3);
        expect(summaryDelta("5.5", "2", { tipe: "DECIMAL" })).toBe("3.5");
        expect(summaryDelta("5.5", null, { tipe: "DECIMAL" })).toBeNull();
    });
    it("links rows to mobile detail screens only with the matching permission", () => {
        const all = () => true, none = () => false;
        expect(drilldown("rekapitulasi-aset", { grup: "17" }, all)).toBe("/aset/17");
        expect(drilldown("rekapitulasi-aset", { grup: "17" }, none)).toBeUndefined();
        expect(drilldown("pemanfaatan-fasilitas", { objek_id: "4", jenis: "RUANGAN" }, (p) => p === "location.view")).toBe("/lokasi/ruangan/4");
        expect(drilldown("pemanfaatan-fasilitas", { objek_id: "4", jenis: "RUANGAN" }, (p) => p === "asset.view")).toBeUndefined();
        expect(drilldown("tren-kerusakan", { grup: "3" }, all)).toBeUndefined();
    });
    it("pairs dates, keeps only supported filters and charts at most 20 safe values", () => {
        const d = { start: "2026-01-01", end: "2026-03-31", room: "5", category: "2", unit: "", role: "R-04", compare: true };
        expect(filterQuery(d, ["room_id", "requester_role"])).toEqual({ query: { bandingkan: "true", tanggal_mulai: "2026-01-01", tanggal_selesai: "2026-03-31", room_id: 5, requester_role: "R-04" } });
        expect(filterQuery({ ...d, end: "" }, [])).toHaveProperty("error");
        expect(filterQuery({ ...d, start: "2026-04-01" }, [])).toHaveProperty("error");
        expect(filterQuery({ ...d, start: "", end: "" }, [])).toEqual({ query: { bandingkan: "true" } });
        expect(chartValues([{ n: 3 }, { n: "-4.5" }, { n: "99999999999999999999" }, { n: null }], "n")).toEqual([3, 4.5, 0, 0]);
        expect(chartValues(Array.from({ length: 30 }, () => ({ n: 1 })), "n")).toHaveLength(20);
    });
});

describe("ekspor ke perangkat (keputusan 24)", () => {
    it("names files safely with the right extension", () => {
        expect(safeFileName("berita acara/OPN 01.pdf", "pdf")).toBe("berita-acara-OPN-01.pdf");
        expect(safeFileName("***", "xlsx")).toBe("ekspor.xlsx");
        expect(safeFileName("x".repeat(200), "xlsx")).toHaveLength(125);
        expect(formatOf("Laporan.PDF")).toBe("pdf");
        expect(formatOf("data.xlsx")).toBe("xlsx");
    });
});
