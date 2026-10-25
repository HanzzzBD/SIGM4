import { describe, expect, it } from "vitest";
import { calculateFine, cents, money } from "../../src/modules/m09-loans/services/fine-calculation.js";
const policy = { tariff: 1000, nominalCap: 5000, percentCap: 30, excludeHolidays: false };
describe("PR-05-03 — kewajiban per unit dengan presisi sen", () => {
    it("nilai perolehan diketahui membatasi denda dengan cap persentase", () => expect(calculateFine(10, "10000.00", policy)).toMatchObject({ sebelum_cap: "10000.00", denda: "3000.00" }));
    it("nilai tidak diketahui memakai cap nominal, nilai nol tetap nilai yang diketahui", () => { expect(calculateFine(10, null, policy).denda).toBe("5000.00"); expect(calculateFine(10, "0.00", policy).denda).toBe("0.00"); });
    it("persen desimal tidak membulatkan cap melebihi nilai maksimal", () => expect(calculateFine(10, "33.33", { ...policy, percentCap: 30.5 }).denda).toBe("10.16"));
    it("nilai melampaui presisi Number tetap tepat", () => expect(calculateFine(1000, "9999999999999999.99", { ...policy, tariff: 90071992547409 }).denda).toBe("2999999999999999.99"));
    it("tarif nol yang dikonfigurasi tidak disamakan dengan konfigurasi kosong", () => expect(calculateFine(10, null, { ...policy, tariff: 0 }).denda).toBe("0.00"));
    it("tanpa hari terlambat tidak menerbitkan nominal denda", () => expect(calculateFine(0, null, policy).denda).toBe("0.00"));
    it("konversi nominal mempertahankan dua angka desimal", () => expect(money(cents("1234567890123456.78"))).toBe("1234567890123456.78"));
    it("nominal bukan desimal rupiah ditolak", () => { expect(() => cents("1e6")).toThrow(); expect(() => cents("1.001")).toThrow(); expect(() => cents("-1")).toThrow(); });
});
