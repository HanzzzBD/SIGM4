import { describe, expect, it } from "vitest";
import { REGISTERED_SCREENS } from "../src/shared/screens";
import { PAGE_TOURS, TOUR_VERSION, mainTourCopy, mainTourKey, needsTour } from "../src/features/tour/catalog";

// Tur produk berbasis role (keputusan pemilik produk 26 Oktober 2026).
const ROLES = ["R-01", "R-02", "R-03", "R-04", "R-05", "R-06", "R-07"];
/** Sama dengan CHECK `product_tour_progress.kunci_tur` di server (0075). */
const SERVER_KEY = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const sentences = (text: string) => (text.match(/[.!?](\s|$)/g) ?? []).length;

describe("katalog tur mobile", () => {
    it("setiap mini-tur menunjuk layar yang terdaftar di build", () => {
        const registered = new Set(Object.values(REGISTERED_SCREENS));
        for (const path of Object.keys(PAGE_TOURS)) expect(registered, path).toContain(path);
    });

    it("kunci diterima server dan terpisah dari tur web (awalan mobile.)", () => {
        const keys = [...ROLES.map(mainTourKey), ...Object.values(PAGE_TOURS).map((p) => p.key)];
        for (const key of keys) { expect(key).toMatch(SERVER_KEY); expect(key.startsWith("mobile.")).toBe(true); }
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("narasi mengikuti role; role kustom mendapat narasi umum", () => {
        expect(mainTourCopy("R-02", "Budi Petugas").home.text).toContain("Petugas Sarana Prasarana");
        expect(mainTourCopy("R-02", "Budi Petugas").home.title).toBe("Selamat datang, Budi!");
        expect(mainTourCopy("R-04", "T").tasks.text).toContain("work order");
        expect(mainTourCopy("R-07", "S").menu.text).toContain("Denda");
        expect(mainTourCopy("R-99", "X").home.text).toContain("untuk pengguna");
    });

    it("MOB-SCP-04: setiap teks tur paling banyak dua kalimat", () => {
        const copies = [...ROLES.flatMap((r) => Object.values(mainTourCopy(r, "Uji"))), ...Object.values(PAGE_TOURS).flatMap((p) => [p.header, p.content])];
        for (const c of copies) expect(sentences(c.text), c.text).toBeLessThanOrEqual(2);
    });
});

describe("pengenalan role otomatis", () => {
    const main = mainTourKey("R-07");
    const done = (kunci: string, versi = TOUR_VERSION) => ({ kunci, status: "SELESAI" as const, versi });

    it("belum ada catatan atau versi usang → diputar; versi terkini → tidak", () => {
        expect(needsTour([], main)).toBe(true);
        expect(needsTour([done(main, TOUR_VERSION)], main, TOUR_VERSION + 1)).toBe(true);
        expect(needsTour([done(main)], main)).toBe(false);
    });

});
