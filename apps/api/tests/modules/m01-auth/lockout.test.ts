// Aritmetika penguncian akun (FR-01.1 A2, SDD-SESS-06/07, NFR-S-07, SEC-T-06). Murni: tanpa
// basis data; setiap uji gagal bila cabang yang bersangkutan dicabut dari `lockout.ts`.

import { describe, expect, it } from "vitest";
import {
    BATAS_GAGAL,
    DURASI_KUNCI_MS,
    JENDELA_MS,
    sedangTerkunci,
    terapkanKegagalan,
} from "../../../src/modules/m01-auth/services/lockout.js";
import type { StatusGagal } from "../../../src/modules/m01-auth/services/lockout.js";
import { KELAS_LIMIT } from "../../../src/shared/http/index.js";

const T0 = new Date("2026-09-19T03:00:00Z");
const menit = (n: number) => new Date(T0.getTime() + n * 60_000);
const BERSIH: StatusGagal = { hitungan: 0, awalJendela: null, terkunciSampai: null };

/** Menerapkan kegagalan pada menit-menit tertentu; mengembalikan status akhir dan hasil terakhir. */
function jalankan(pada: readonly number[], awal: StatusGagal = BERSIH) {
    let status = awal;
    let terakhir: ReturnType<typeof terapkanKegagalan> = { dihitung: false };
    for (const m of pada) {
        terakhir = terapkanKegagalan(status, menit(m));
        if (terakhir.dihitung) status = terakhir.status;
    }
    return { status, terakhir };
}

describe("konstanta", () => {
    it("batas dan jendela SAMA dengan sumbu IP (SDD-13 §4.3): 5 gagal / 15 menit; kunci 15 menit (FR-01.1 A2)", () => {
        expect(BATAS_GAGAL).toBe(5);
        expect(JENDELA_MS).toBe(15 * 60_000);
        expect(BATAS_GAGAL).toBe(KELAS_LIMIT.login.batas);
        expect(JENDELA_MS).toBe(KELAS_LIMIT.login.jendelaMs);
        expect(DURASI_KUNCI_MS).toBe(15 * 60_000);
    });
});

describe("terapkanKegagalan — jendela tetap", () => {
    it("kegagalan pertama memulai jendela pada saat itu, tanpa penguncian", () => {
        const { status, terakhir } = jalankan([0]);
        expect(status).toEqual({ hitungan: 1, awalJendela: menit(0), terkunciSampai: null });
        expect(terakhir).toMatchObject({ dihitung: true, terkunciBaru: false });
    });

    it("kegagalan ke-5 di dalam jendela mengunci 15 menit dari SAAT ITU — dan hanya kegagalan itu yang `terkunciBaru`", () => {
        const empat = jalankan([0, 1, 2, 3]);
        expect(empat.status.hitungan).toBe(4);
        expect(empat.status.terkunciSampai).toBeNull();
        const lima = terapkanKegagalan(empat.status, menit(4));
        expect(lima).toMatchObject({ dihitung: true, terkunciBaru: true });
        expect(lima.dihitung && lima.status.terkunciSampai).toEqual(menit(4 + 15));
        // Awal jendela tidak bergeser oleh kegagalan berikutnya.
        expect(lima.dihitung && lima.status.awalJendela).toEqual(menit(0));
    });

    it("kegagalan ke-5 tepat di batas jendela (14 menit 59 detik) masih menghitung; pada 15:00 jendela sudah lewat", () => {
        const dalam = terapkanKegagalan({ hitungan: 4, awalJendela: T0, terkunciSampai: null }, new Date(T0.getTime() + JENDELA_MS - 1000));
        expect(dalam).toMatchObject({ dihitung: true, terkunciBaru: true });
        const lewat = terapkanKegagalan({ hitungan: 4, awalJendela: T0, terkunciSampai: null }, new Date(T0.getTime() + JENDELA_MS));
        expect(lewat).toMatchObject({ dihitung: true, terkunciBaru: false });
        expect(lewat.dihitung && lewat.status.hitungan).toBe(1);
    });

    it("jendela yang lewat memulai hitungan BARU dari 1 pada saat itu, bukan melanjutkan yang lama", () => {
        const { status } = jalankan([0, 1, 2, 3, 20]);
        expect(status).toEqual({ hitungan: 1, awalJendela: menit(20), terkunciSampai: null });
    });

    it("empat kegagalan yang tersebar lintas jendela tidak pernah mengunci (5 gagal harus DALAM 15 menit)", () => {
        const { status, terakhir } = jalankan([0, 5, 10, 16, 21, 26, 31, 36]);
        expect(status.terkunciSampai).toBeNull();
        expect(terakhir).toMatchObject({ dihitung: true, terkunciBaru: false });
    });

    it("sisa kunci yang sudah lewat dihapus saat jendela baru dimulai", () => {
        const lama: StatusGagal = { hitungan: 5, awalJendela: menit(0), terkunciSampai: menit(15) };
        const r = terapkanKegagalan(lama, menit(40));
        expect(r).toMatchObject({ dihitung: true, terkunciBaru: false });
        expect(r.dihitung && r.status).toEqual({ hitungan: 1, awalJendela: menit(40), terkunciSampai: null });
    });
});

describe("terapkanKegagalan — selagi terkunci", () => {
    const terkunci: StatusGagal = { hitungan: 5, awalJendela: menit(0), terkunciSampai: menit(19) };

    it("TIDAK dihitung: kegagalan atas akun terkunci tidak memperpanjang kunci (bukan alat DoS berkelanjutan)", () => {
        for (const m of [5, 10, 18]) {
            expect(terapkanKegagalan(terkunci, menit(m))).toEqual({ dihitung: false });
        }
    });

    it("kunci berakhir tepat pada `terkunciSampai`: sesudahnya kegagalan dihitung lagi, mulai jendela baru", () => {
        expect(sedangTerkunci(menit(19), menit(19))).toBe(false);
        const r = terapkanKegagalan(terkunci, menit(19));
        expect(r).toMatchObject({ dihitung: true, terkunciBaru: false });
        expect(r.dihitung && r.status.hitungan).toBe(1);
    });
});

describe("sedangTerkunci", () => {
    it.each([
        [null, false],
        [menit(-1), false],
        [menit(0), false],
        [menit(1), true],
    ])("terkunciSampai=%s → %s", (sampai, harapan) => {
        expect(sedangTerkunci(sampai, T0)).toBe(harapan);
    });
});
