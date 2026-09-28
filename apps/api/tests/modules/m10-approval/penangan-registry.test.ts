// Registri penangan hasil (SDD-APR-17, keputusan 75): satu penangan per jenis pengajuan.

import { describe, expect, it } from "vitest";
import { RegistriPenanganHasil } from "../../../src/modules/m10-approval/index.js";
import type { PenanganHasil } from "../../../src/modules/m10-approval/index.js";

const penangan = (jenis: PenanganHasil["jenis"]): PenanganHasil => ({
    jenis,
    sebelumDisetujui: () => Promise.resolve(),
    setelahDitutup: () => Promise.resolve(),
});

describe("RegistriPenanganHasil", () => {
    it("mengembalikan penangan per jenis; jenis tanpa penangan → undefined (tak ada objek untuk diperiksa)", () => {
        const p = penangan("RESERVASI_RUANGAN");
        const r = new RegistriPenanganHasil().daftar(p);
        expect(r.cari("RESERVASI_RUANGAN")).toBe(p);
        expect(r.cari("PENGADAAN_BARANG")).toBeUndefined();
    });

    it("menolak penangan ganda untuk jenis yang sama — dua modul tak boleh sama-sama melepas slot", () => {
        const r = new RegistriPenanganHasil().daftar(penangan("RESERVASI_ASET"));
        expect(() => r.daftar(penangan("RESERVASI_ASET"))).toThrow(/ganda/);
    });
});
