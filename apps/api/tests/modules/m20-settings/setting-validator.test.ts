// Validasi nilai parameter (FR-20.1 A1). Uji negatif adalah acceptance PR-01-10
// yang sebenarnya: "nilai di luar rentang ditolak dengan penjelasan".

import { describe, expect, it } from "vitest";
import { validasiNilai } from "../../../src/modules/m20-settings/services/setting-validator.js";
import {
    ListSettingsQuerySchema,
    UpdateSettingsBodySchema,
} from "../../../src/modules/m20-settings/schemas/setting.schema.js";

const bulat = { tipe: "BILANGAN_BULAT", nilai_min: "1", nilai_maks: "365" } as const;
const desimal = { tipe: "DESIMAL", nilai_min: "1", nilai_maks: "100" } as const;

describe("validasiNilai — angka dan rentang (FR-20.1 A1)", () => {
    it("menerima nilai di dalam rentang, termasuk kedua batasnya", () => {
        expect(validasiNilai(bulat, 90)).toBeUndefined();
        expect(validasiNilai(bulat, 1)).toBeUndefined();
        expect(validasiNilai(bulat, 365)).toBeUndefined();
    });

    it("menolak di luar rentang dengan penjelasan yang menyebut batas yang diizinkan", () => {
        expect(validasiNilai(bulat, 0)).toBe("Nilai harus antara 1 dan 365.");
        expect(validasiNilai(bulat, 366)).toBe("Nilai harus antara 1 dan 365.");
    });

    it("menjelaskan batas tunggal bila hanya satu sisi yang ada", () => {
        expect(validasiNilai({ tipe: "BILANGAN_BULAT", nilai_min: "0", nilai_maks: null }, -1)).toBe(
            "Nilai tidak boleh kurang dari 0.",
        );
        expect(validasiNilai({ tipe: "BILANGAN_BULAT", nilai_min: null, nilai_maks: "9" }, 10)).toBe(
            "Nilai tidak boleh lebih dari 9.",
        );
    });

    it("BILANGAN_BULAT menolak pecahan; DESIMAL menerimanya", () => {
        expect(validasiNilai(bulat, 1.5)).toBe("Nilai harus berupa bilangan bulat.");
        expect(validasiNilai(desimal, 12.5)).toBeUndefined();
    });

    it("menolak yang bukan angka — string numerik pun ditolak, tanpa koersi diam-diam", () => {
        expect(validasiNilai(bulat, "90")).toBe("Nilai harus berupa angka.");
        expect(validasiNilai(bulat, null)).toBe("Nilai harus berupa angka.");
        expect(validasiNilai(bulat, Number.NaN)).toBe("Nilai harus berupa angka.");
        expect(validasiNilai(bulat, Number.POSITIVE_INFINITY)).toBe("Nilai harus berupa angka.");
    });
});

describe("validasiNilai — boolean dan teks", () => {
    const bool = { tipe: "BOOLEAN", nilai_min: null, nilai_maks: null } as const;
    const teks = { tipe: "TEKS", nilai_min: null, nilai_maks: null } as const;

    it("BOOLEAN hanya menerima true/false", () => {
        expect(validasiNilai(bool, true)).toBeUndefined();
        expect(validasiNilai(bool, "true")).toBe("Nilai harus berupa true atau false.");
    });

    it("TEKS menolak kosong/spasi, bukan-teks, dan yang terlalu panjang", () => {
        expect(validasiNilai(teks, "SMA Negeri 1")).toBeUndefined();
        expect(validasiNilai(teks, "   ")).toBe("Nilai harus berupa teks yang tidak kosong.");
        expect(validasiNilai(teks, 7)).toBe("Nilai harus berupa teks yang tidak kosong.");
        expect(validasiNilai(teks, "x".repeat(501))).toBe("Teks tidak boleh lebih dari 500 karakter.");
    });
});

describe("ListSettingsQuerySchema (SDD-PERF-04)", () => {
    it("berbawaan page=1, per_page=25, tanpa filter kelompok", () => {
        expect(ListSettingsQuerySchema.parse({})).toEqual({ page: 1, per_page: 25 });
    });

    it("menerima kelompok yang dikenal; menolak kelompok asing dan per_page di atas 100", () => {
        expect(ListSettingsQuerySchema.parse({ kelompok: "DENDA" }).kelompok).toBe("DENDA");
        expect(() => ListSettingsQuerySchema.parse({ kelompok: "TIDAK_ADA" })).toThrow();
        expect(() => ListSettingsQuerySchema.parse({ per_page: "101" })).toThrow();
    });
});

describe("UpdateSettingsBodySchema", () => {
    it("menerima peta kunci -> nilai", () => {
        expect(UpdateSettingsBodySchema.parse({ settings: { "denda.cap_persen": 25 } })).toEqual({
            settings: { "denda.cap_persen": 25 },
        });
    });

    it("menolak peta kosong dan isi yang bukan objek", () => {
        expect(() => UpdateSettingsBodySchema.parse({ settings: {} })).toThrow();
        expect(() => UpdateSettingsBodySchema.parse({ settings: [1] })).toThrow();
        expect(() => UpdateSettingsBodySchema.parse({})).toThrow();
    });
});
