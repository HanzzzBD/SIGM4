// Aritmetika jadwal pengajuan (FR-07.2; PR-03-10, keputusan 14 log phase-03) — fungsi murni WIB.

import { describe, expect, it } from "vitest";
import type { AturanJadwal } from "../../../src/modules/m07-reservation-room/services/schedule.js";
import { alasanTidakSah, jabarkan, kedaluwarsaTentatif } from "../../../src/modules/m07-reservation-room/services/schedule.js";

const wib = (tgl: string, jam: string) => new Date(`${tgl}T${jam}:00+07:00`);
// Senin 3 Mei 2027 09.00 WIB.
const SEKARANG = wib("2027-05-03", "09:00");
const aturan: AturanJadwal = {
    sekarang: SEKARANG,
    jam: { startMinute: 6 * 60, endMinute: 18 * 60 },
    hariKerja: new Set([1, 2, 3, 4, 5, 6]),
    libur: new Map([["2027-05-13", "Kenaikan"]]),
    granularitasMenit: 30,
    jarakMinimumHari: 1,
    mendesak: false,
    horizonHari: 90,
};
const satu = (tgl: string, mulai: string, selesai: string) => ({ tanggal: tgl, mulai: wib(tgl, mulai), selesai: wib(tgl, selesai) });

describe("jabarkan — pola mingguan BR-024a A4 (keputusan 14g)", () => {
    it("tanpa pola: satu kemunculan bertanggal WIB (bukan UTC)", () => {
        // 06.00 WIB = 23.00 UTC hari sebelumnya.
        expect(jabarkan(wib("2027-05-05", "06:00"), wib("2027-05-05", "07:00"))).toEqual([satu("2027-05-05", "06:00", "07:00")]);
    });

    it("hari terpilih dari tanggal mulai sampai `sampai` inklusif, jam yang sama", () => {
        const hasil = jabarkan(wib("2027-05-03", "13:00"), wib("2027-05-03", "15:00"), { hari: [1, 3], sampai: "2027-05-12" });
        expect(hasil.map((k) => k.tanggal)).toEqual(["2027-05-03", "2027-05-05", "2027-05-10", "2027-05-12"]);
        expect(hasil[3]).toEqual(satu("2027-05-12", "13:00", "15:00"));
    });

    it("tanggal mulai di luar hari terpilih tidak ikut; `sampai` sebelum mulai → kosong", () => {
        expect(jabarkan(wib("2027-05-04", "08:00"), wib("2027-05-04", "09:00"), { hari: [1], sampai: "2027-05-17" }).map((k) => k.tanggal)).toEqual(["2027-05-10", "2027-05-17"]);
        expect(jabarkan(wib("2027-05-04", "08:00"), wib("2027-05-04", "09:00"), { hari: [2], sampai: "2027-05-03" })).toEqual([]);
    });
});

describe("alasanTidakSah — BR-018, BR-020, BR-023c, CAL-UI-02", () => {
    it("sah: hari kerja, dalam jam operasional, sejajar granularitas, ≥ H-1, ≤ horizon — termasuk tepat di batas jam", () => {
        expect(alasanTidakSah(satu("2027-05-04", "06:00", "18:00"), aturan)).toBeNull();
        // Tepat hari ini + horizon (Jumat 30 Juli = 3 Mei + 88) sah; sehari sesudahnya tidak.
        expect(alasanTidakSah(satu("2027-07-30", "08:00", "09:00"), { ...aturan, horizonHari: 88 })).toBeNull();
        expect(alasanTidakSah(satu("2027-07-31", "08:00", "09:00"), { ...aturan, horizonHari: 88 })).toBe("Melewati horizon pemesanan 88 hari.");
    });

    it("BR-018: sebelum buka, sesudah tutup, melewati tengah malam", () => {
        const pesan = "Di luar jam operasional (06:00–18:00 WIB).";
        expect(alasanTidakSah(satu("2027-05-04", "05:30", "07:00"), aturan)).toBe(pesan);
        expect(alasanTidakSah(satu("2027-05-04", "17:30", "18:30"), aturan)).toBe(pesan);
        expect(alasanTidakSah({ tanggal: "2027-05-04", mulai: wib("2027-05-04", "17:00"), selesai: wib("2027-05-05", "07:00") }, aturan)).toBe(pesan);
    });

    it("hari bukan kerja dan hari libur (FR-07.1 A5) — libur disebut namanya", () => {
        expect(alasanTidakSah(satu("2027-05-09", "08:00", "09:00"), aturan)).toBe("Bukan hari kerja sekolah.");
        expect(alasanTidakSah(satu("2027-05-13", "08:00", "09:00"), aturan)).toBe("Hari libur: Kenaikan.");
    });

    it("CAL-UI-02: mulai/selesai bukan kelipatan granularitas", () => {
        expect(alasanTidakSah(satu("2027-05-04", "08:15", "09:00"), aturan)).toBe("Jam mulai dan selesai harus kelipatan 30 menit.");
        expect(alasanTidakSah(satu("2027-05-04", "08:15", "09:00"), { ...aturan, granularitasMenit: 15 })).toBeNull();
    });

    it("BR-020 dalam hari kalender WIB (keputusan 14c): hari ini ditolak, besok pukul 06.00 sah; reservation.urgent dibebaskan", () => {
        expect(alasanTidakSah(satu("2027-05-03", "13:00", "14:00"), aturan)).toBe("Pengajuan paling lambat H-1.");
        expect(alasanTidakSah(satu("2027-05-04", "06:00", "07:00"), aturan)).toBeNull();
        expect(alasanTidakSah(satu("2027-05-04", "08:00", "09:00"), { ...aturan, jarakMinimumHari: 2 })).toBe("Pengajuan paling lambat H-2.");
        expect(alasanTidakSah(satu("2027-05-03", "13:00", "14:00"), { ...aturan, mendesak: true })).toBeNull();
    });

    it("waktu lampau ditolak bahkan bagi reservation.urgent; horizon BR-023c", () => {
        expect(alasanTidakSah(satu("2027-05-03", "08:00", "09:00"), { ...aturan, mendesak: true })).toBe("Waktu mulai sudah lewat.");
        expect(alasanTidakSah(satu("2027-08-02", "08:00", "09:00"), aturan)).toBe("Melewati horizon pemesanan 90 hari.");
    });
});

describe("kedaluwarsaTentatif — BR-023b (keputusan 14i)", () => {
    it("akhir H-1 (00.00 WIB tanggal mulai) bila lebih dulu dari TTL", () => {
        expect(kedaluwarsaTentatif(SEKARANG, 48, wib("2027-05-05", "08:00"))).toEqual(wib("2027-05-05", "00:00"));
    });

    it("TTL bila lebih dulu dari akhir H-1", () => {
        expect(kedaluwarsaTentatif(SEKARANG, 48, wib("2027-05-20", "08:00"))).toEqual(wib("2027-05-05", "09:00"));
    });

    it("pengajuan mendesak hari yang sama: akhir H-1 sudah lewat → dibatasi waktu mulai", () => {
        expect(kedaluwarsaTentatif(SEKARANG, 48, wib("2027-05-03", "13:00"))).toEqual(wib("2027-05-03", "13:00"));
    });
});
