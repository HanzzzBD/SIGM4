// Kode cadangan 2FA (FR-01.5 langkah 2, BR-070c).

import { describe, expect, it } from "vitest";
import {
    JUMLAH_KODE_CADANGAN,
    bangkitkanKodeCadangan,
    normalisasiKodeCadangan,
    tampilkanKodeCadangan,
} from "../../../src/shared/security/index.js";

describe("bangkitkanKodeCadangan", () => {
    it("tepat 10 kode berbeda, 10 karakter, tanpa karakter yang mudah tertukar (I, O, 0, 1)", () => {
        const kode = bangkitkanKodeCadangan();
        expect(JUMLAH_KODE_CADANGAN).toBe(10);
        expect(kode).toHaveLength(10);
        expect(new Set(kode).size).toBe(10);
        for (const k of kode) expect(k).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
    });

    it("dua pembangkitan tidak menghasilkan kode yang sama", () => {
        const a = new Set(bangkitkanKodeCadangan());
        expect(bangkitkanKodeCadangan().some((k) => a.has(k))).toBe(false);
    });
});

describe("tampilan dan normalisasi", () => {
    it("XXXXX-XXXXX ↔ bentuk normal; huruf kecil, spasi, dan tanda hubung ditoleransi", () => {
        const [kode] = bangkitkanKodeCadangan();
        expect(kode).toBeDefined();
        const tampil = tampilkanKodeCadangan(kode ?? "");
        expect(tampil).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
        expect(normalisasiKodeCadangan(tampil)).toBe(kode);
        expect(normalisasiKodeCadangan(tampil.toLowerCase())).toBe(kode);
        expect(normalisasiKodeCadangan(` ${tampil.replace("-", " ")} `)).toBe(kode);
    });

    it.each(["", "ABC", "ABCDE-FGHJK-M", "ABCDEFGHI0", "ABCDEFGHIO", "ABCDEFGH11", "12345", "ABCDE-FGHJ!"])(
        "bentuk %j bukan kode cadangan → undefined (tidak memicu Argon2id)",
        (masukan) => {
            expect(normalisasiKodeCadangan(masukan)).toBeUndefined();
        },
    );
});
