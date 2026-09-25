// Uji berkas atas pembacaan sumber kebenaran RBAC (PR-00-16) — tanpa basis data.
//
// Uji integrasi tests/integration/rbac-seed.test.ts membandingkan hasil seed
// dengan harapan yang diturunkan helpers/lampiran-c.ts. Bila pembacaan itu
// keliru — mis. melewatkan baris 🔒 atau mengurai anotasi scope sebagai ALL —
// pembandingannya ikut keliru tanpa memerah. Karena itu pembacaannya dipatok di sini.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AKAR } from "./helpers/bab113.js";
import {
    bacaLampiranC,
    bacaRoleBab5,
    bacaTafsir,
    matriksBawaan,
    uraiPemilik,
} from "./helpers/lampiran-c.js";

const katalog = bacaLampiranC();
const tafsir = bacaTafsir();

/** Daftar `CORE_PERMISSIONS` pada SDD-03 §4.7 — pembanding kedua bagi 🔒. */
function intiSdd03(): string[] {
    const teks = readFileSync(
        new URL("docs/SDD/03-authorization.md", AKAR),
        "utf8",
    );
    const blok = teks
        .split("const CORE_PERMISSIONS = new Set([")[1]
        ?.split("]);")[0];
    if (blok === undefined)
        throw new Error("CORE_PERMISSIONS tidak ditemukan pada SDD-03 §4.7");
    return [...blok.matchAll(/'([^']+)'/g)].map((m) => m[1] ?? "").sort();
}

describe("Lampiran C.2", () => {
    it("memuat 79 kode unik (phase-00 §7, SDD-05 §4.6)", () => {
        expect(katalog).toHaveLength(79);
        expect(new Set(katalog.map((p) => p.kode)).size).toBe(79);
    });

    it("permission 🔒 identik dengan CORE_PERMISSIONS SDD-03 §4.7", () => {
        const inti = katalog
            .filter((p) => p.inti)
            .map((p) => p.kode)
            .sort();
        expect(inti).toEqual(intiSdd03());
        expect(inti).toHaveLength(11);
    });

    it("aksi = bagian sesudah titik; deskripsi tersimpan tanpa backtick", () => {
        const waive = katalog.find((p) => p.kode === "fine.waive");
        expect(waive).toMatchObject({
            modul: "Denda",
            aksi: "waive",
            deskripsi: "Membebaskan denda berjenis Keterlambatan",
            inti: false,
        });
    });
});

describe("Bab 5", () => {
    it("tujuh role bawaan R-01 … R-07", () => {
        const roles = bacaRoleBab5();
        expect(roles.map((r) => r.kode)).toEqual([
            "R-01",
            "R-02",
            "R-03",
            "R-04",
            "R-05",
            "R-06",
            "R-07",
        ]);
        expect(roles[0]?.nama).toBe("Administrator");
    });
});

describe("tafsir SDD-03 §4.8", () => {
    it("nama singkat memetakan ketujuh role Bab 5, masing-masing sekali", () => {
        expect([...tafsir.namaSingkat.values()].sort()).toEqual(
            bacaRoleBab5().map((r) => r.kode),
        );
    });

    it("setiap kode yang ditafsirkan ada di Lampiran C", () => {
        const kode = new Set(katalog.map((p) => p.kode));
        expect([...tafsir.baris.keys()].filter((k) => !kode.has(k))).toEqual(
            [],
        );
        expect(tafsir.baris.size).toBeGreaterThan(0);
    });

    it("anotasi Lampiran C diurai menjadi scope", () => {
        const hasil = uraiPemilik(
            "Admin, Petugas(view), Teknisi(`assigned`), Guru(`own`), Siswa(`restricted`)",
            tafsir.namaSingkat,
        );
        expect(Object.fromEntries(hasil)).toEqual({
            "R-01": "ALL",
            "R-02": "ALL",
            "R-04": "ASSIGNED",
            "R-05": "OWN",
            "R-07": "RESTRICTED",
        });
    });

    it("deskriptor non-role tanpa tafsir melempar, bukan menjadi tanpa pemilik", () => {
        expect(() => uraiPemilik("Semua role", tafsir.namaSingkat)).toThrow(
            /bukan role/,
        );
    });

    it("seluruh pemilik Lampiran C terurai — langsung atau lewat tafsir", () => {
        const matriks = matriksBawaan();
        const berpemilik = new Set(matriks.map((g) => g.permission));
        expect(katalog.filter((p) => !berpemilik.has(p.kode))).toEqual([]);
    });

    it("Administrator memegang seluruh permission inti (FR-02.2 A1)", () => {
        const admin = new Set(
            matriksBawaan()
                .filter((g) => g.role === "R-01")
                .map((g) => g.permission),
        );
        expect(
            katalog
                .filter((p) => p.inti && !admin.has(p.kode))
                .map((p) => p.kode),
        ).toEqual([]);
    });
});
