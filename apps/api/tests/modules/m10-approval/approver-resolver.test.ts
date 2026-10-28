// Pemutus sah langkah — SDD-APR-16 (keputusan 67), BR-039/RE-10, RE-12, RE-13.

import { describe, expect, it } from "vitest";
import { ALASAN_DILEWATI, resolvePemutus } from "../../../src/modules/m10-approval/services/approver-resolver.js";

const PEMOHON = 99;

describe("resolvePemutus — tanpa delegasi", () => {
    it("seluruh pemegang aktif menjadi pemutus, terurut id", () => {
        expect(resolvePemutus([7, 3], [], PEMOHON)).toEqual({
            pemutus: [
                { userId: 3, atasNamaUserId: null },
                { userId: 7, atasNamaUserId: null },
            ],
            sebabKosong: null,
        });
    });

    it("tanpa pemegang aktif -> APPROVER_NONAKTIF (RE-13)", () => {
        expect(resolvePemutus([], [], PEMOHON)).toEqual({ pemutus: [], sebabKosong: "APPROVER_NONAKTIF" });
    });

    it("BR-039: pemohon dikeluarkan; pemegang lain tetap -> langkah berjalan", () => {
        expect(resolvePemutus([PEMOHON, 5], [], PEMOHON).pemutus).toEqual([{ userId: 5, atasNamaUserId: null }]);
    });

    it("RE-10: pemohon satu-satunya pemegang -> KONFLIK_KEPENTINGAN", () => {
        expect(resolvePemutus([PEMOHON], [], PEMOHON)).toEqual({ pemutus: [], sebabKosong: "KONFLIK_KEPENTINGAN" });
    });
});

describe("resolvePemutus — delegasi (SDD-APR-16)", () => {
    it("pemegang yang mendelegasikan DIGANTIKAN penerimanya, dengan approver asli (RE-12)", () => {
        expect(resolvePemutus([4], [{ pemberiId: 4, penerimaId: 8, penerimaAktif: true }], PEMOHON)).toEqual({
            pemutus: [{ userId: 8, atasNamaUserId: 4 }],
            sebabKosong: null,
        });
    });

    it("penerima nonaktif -> delegasi diabaikan, pemberi tetap memutus", () => {
        expect(resolvePemutus([4], [{ pemberiId: 4, penerimaId: 8, penerimaAktif: false }], PEMOHON).pemutus).toEqual([{ userId: 4, atasNamaUserId: null }]);
    });

    it("delegasi pengguna yang bukan pemegang tidak berpengaruh", () => {
        expect(resolvePemutus([4], [{ pemberiId: 5, penerimaId: 8, penerimaAktif: true }], PEMOHON).pemutus).toEqual([{ userId: 4, atasNamaUserId: null }]);
    });

    it("satu lompatan: delegasi penerima tidak diikuti", () => {
        const d = [
            { pemberiId: 4, penerimaId: 8, penerimaAktif: true },
            { pemberiId: 8, penerimaId: 9, penerimaAktif: true },
        ];
        expect(resolvePemutus([4], d, PEMOHON).pemutus).toEqual([{ userId: 8, atasNamaUserId: 4 }]);
    });

    it("BR-039: penerima = pemohon -> tersaring; bila satu-satunya -> KONFLIK_KEPENTINGAN", () => {
        expect(resolvePemutus([4], [{ pemberiId: 4, penerimaId: PEMOHON, penerimaAktif: true }], PEMOHON)).toEqual({
            pemutus: [],
            sebabKosong: "KONFLIK_KEPENTINGAN",
        });
    });

    it("BR-039: pemohon yang mendelegasikan tidak dapat memutus lewat penggantinya", () => {
        expect(resolvePemutus([PEMOHON, 5], [{ pemberiId: PEMOHON, penerimaId: 8, penerimaAktif: true }], PEMOHON).pemutus).toEqual([
            { userId: 5, atasNamaUserId: null },
        ]);
    });

    it("pengguna yang pemegang langsung DAN penerima delegasi dicatat sekali, sebagai pemegang langsung", () => {
        const hasil = resolvePemutus([4, 8], [{ pemberiId: 4, penerimaId: 8, penerimaAktif: true }], PEMOHON);
        expect(hasil.pemutus).toEqual([{ userId: 8, atasNamaUserId: null }]);
        // Urutan masukan dibalik: hasil sama.
        expect(resolvePemutus([8, 4], [{ pemberiId: 4, penerimaId: 8, penerimaAktif: true }], PEMOHON).pemutus).toEqual(hasil.pemutus);
    });
});

describe("ALASAN_DILEWATI — literal PRD", () => {
    it("konflik kepentingan (BR-039) & approver nonaktif (RE-13)", () => {
        expect(ALASAN_DILEWATI).toEqual({ KONFLIK_KEPENTINGAN: "konflik kepentingan", APPROVER_NONAKTIF: "approver nonaktif" });
    });
});
