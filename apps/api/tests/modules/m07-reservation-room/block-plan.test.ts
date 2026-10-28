// Logika murni blokade ruangan (FR-07.5; keputusan 19 log phase-03) — WIB.
import { describe, expect, it } from "vitest";
import type { KonteksValidasi } from "../../../src/modules/m07-reservation-room/services/block-plan.js";
import { galatAturanMingguan, galatBlokadeManual, jabarkanAturan } from "../../../src/modules/m07-reservation-room/services/block-plan.js";

const aturan = { hari: [1, 3], jamMulai: "07:00", jamSelesai: "08:30", berlakuMulai: "2027-09-06", berlakuSampai: "2027-09-22" };
const K: KonteksValidasi = {
    hariIni: "2027-09-06",
    sekarang: new Date("2027-09-06T02:00:00Z"),
    horizonHari: 90,
    granularitasMenit: 30,
    jamOperasional: { mulai: 6 * 60, selesai: 18 * 60 },
    hariKerja: new Set([1, 2, 3, 4, 5]),
    tahunAjaran: { mulai: "2027-07-01", akhir: "2028-06-30" },
};

describe("jabarkanAturan", () => {
    it("kemunculan per hari pola di dalam masa berlaku ∩ rentang, jam WIB → instan UTC; libur dilewati & dilaporkan (A4)", () => {
        const { kemunculan, dilewati } = jabarkanAturan(aturan, "2027-09-01", "2027-09-30", new Map([["2027-09-13", "Libur Uji"]]));
        expect(kemunculan.map((k) => k.tanggal)).toEqual(["2027-09-06", "2027-09-08", "2027-09-15", "2027-09-20", "2027-09-22"]);
        expect(kemunculan[0]).toMatchObject({ hari: 1, mulai: new Date("2027-09-06T00:00:00Z"), selesai: new Date("2027-09-06T01:30:00Z") });
        expect(dilewati).toEqual([{ tanggal: "2027-09-13", alasan: "Hari libur: Libur Uji." }]);
    });

    it("horizon memotong masa berlaku; rentang kosong bila tak beririsan", () => {
        expect(jabarkanAturan(aturan, "2027-09-07", "2027-09-14", new Map()).kemunculan.map((k) => k.tanggal)).toEqual(["2027-09-08", "2027-09-13"]);
        expect(jabarkanAturan(aturan, "2027-10-01", "2027-10-31", new Map()).kemunculan).toEqual([]);
    });
});

describe("galatAturanMingguan (keputusan 19g)", () => {
    const field = (o: Partial<typeof aturan>, k: Partial<KonteksValidasi> = {}) => galatAturanMingguan({ ...aturan, ...o }, { ...K, ...k }).map((g) => g.field);
    it("sah", () => expect(field({})).toEqual([]));
    it("jam: urutan, jam operasional (batas tepat sah), granularitas", () => {
        expect(field({ jamMulai: "09:00", jamSelesai: "08:00" })).toContain("jam_selesai");
        expect(field({ jamMulai: "05:30" })).toContain("jam_mulai");
        expect(field({ jamMulai: "06:00", jamSelesai: "18:00" })).toEqual([]);
        expect(field({ jamSelesai: "18:30" })).toContain("jam_mulai");
        expect(field({ jamMulai: "07:15" })).toContain("jam_mulai");
    });
    it("hari kerja, masa berlaku, tahun ajaran aktif", () => {
        expect(field({ hari: [6] })).toEqual(["hari"]);
        expect(field({ berlakuSampai: "2027-09-01" })).toContain("berlaku_sampai");
        expect(field({ berlakuMulai: "2027-08-01", berlakuSampai: "2027-08-31" })).toContain("berlaku_sampai"); // sudah lewat
        expect(field({ berlakuSampai: "2028-07-01" })).toEqual(["berlaku_mulai"]);
        expect(field({}, { tahunAjaran: null })).toEqual(["berlaku_mulai"]);
    });
});

describe("galatBlokadeManual (keputusan 19g)", () => {
    const f = (m: string, s: string) => galatBlokadeManual(new Date(m), new Date(s), K).map((g) => g.message);
    it("rentang bebas di luar jam operasional sah; terbalik, sudah lewat, dan melebihi horizon ditolak", () => {
        expect(f("2027-09-10T17:00:00Z", "2027-09-21T17:00:00Z")).toEqual([]);
        expect(f("2027-09-10T02:00:00Z", "2027-09-10T01:00:00Z")).toEqual(["Waktu selesai harus sesudah waktu mulai."]);
        expect(f("2027-09-01T00:00:00Z", "2027-09-05T00:00:00Z")).toEqual(["Rentang blokade sudah lewat."]);
        expect(f("2027-09-07T00:00:00Z", "2027-12-07T00:00:01Z")).toEqual(["Blokade manual paling panjang 90 hari (horizon pemesanan)."]);
    });
});
