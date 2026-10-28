// rakitKodeBarang (FR-20.1, BR-002, PR-02-11) — perakitan murni tanpa basis
// data. Logika penomoran sungguhan (konkurensi, scope per kategori+ruangan)
// diuji terhadap PostgreSQL nyata di `m04-assets-create.test.ts`.

import { describe, expect, it } from "vitest";
import { rakitKodeBarang } from "../../../src/modules/m04-assets/services/asset.service.js";

const BAWAAN = { pola: "KATEGORI,LOKASI", pemisah: "-", panjangUrut: 4 };

describe("rakitKodeBarang (FR-20.1)", () => {
    it("merakit pola bawaan persis contoh dokumentasi (LAB-KOM-0002)", () => {
        expect(rakitKodeBarang(BAWAAN, "LAB", "KOM", "2")).toBe("LAB-KOM-0002");
    });

    it("URUT selalu di akhir dan diisi nol sesuai panjang_urut", () => {
        expect(rakitKodeBarang(BAWAAN, "ELK", "GDG", "37")).toBe("ELK-GDG-0037");
    });

    it("urut yang melebihi panjang_urut TIDAK dipotong (tetap unik)", () => {
        expect(rakitKodeBarang(BAWAAN, "ELK", "GDG", "12345")).toBe("ELK-GDG-12345");
    });

    it("pemisah dapat dikonfigurasi", () => {
        expect(rakitKodeBarang({ ...BAWAAN, pemisah: "/" }, "LAB", "KOM", "1")).toBe("LAB/KOM/0001");
    });

    it("urutan token pada pola dapat ditukar Administrator", () => {
        expect(rakitKodeBarang({ ...BAWAAN, pola: "LOKASI,KATEGORI" }, "LAB", "KOM", "1")).toBe(
            "KOM-LAB-0001",
        );
    });

    it("token dapat dihilangkan — URUT tetap wajib ada (jaring keunikan)", () => {
        expect(rakitKodeBarang({ ...BAWAAN, pola: "KATEGORI" }, "LAB", "KOM", "1")).toBe("LAB-0001");
    });

    it("panjang_urut dapat dikonfigurasi", () => {
        expect(rakitKodeBarang({ ...BAWAAN, panjangUrut: 2 }, "LAB", "KOM", "5")).toBe("LAB-KOM-05");
    });

    it("token tidak dikenal pada pola gagal keras, bukan diam-diam diabaikan", () => {
        expect(() => rakitKodeBarang({ ...BAWAAN, pola: "WARNA" }, "LAB", "KOM", "1")).toThrow(
            /Token pola kode_aset.pola tidak dikenal: WARNA/,
        );
    });
});
