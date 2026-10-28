// Skema Zod kategori aset (FR-04.5, PR-02-15): permintaan tak sah ditolak
// SEBELUM lapisan layanan — terutama angka non-positif, yang di basis data
// akan menjadi 23514 dan salah dipetakan ke INSUFFICIENT_BALANCE.

import { describe, expect, it } from "vitest";
import { CategoryBodySchema } from "../../../src/modules/m04-assets/schemas/category.schema.js";

const DASAR = { nama: "Komputer", kode: "KOM" };

describe("CategoryBodySchema (FR-04.5 langkah 2)", () => {
    it("menerima bentuk minimal; induk, umur teknis, interval opsional", () => {
        const hasil = CategoryBodySchema.parse(DASAR);
        expect(hasil.parent_id).toBeUndefined();
        expect(hasil.umur_teknis_tahun).toBeUndefined();
    });

    it("mengoersi angka dari string", () => {
        const hasil = CategoryBodySchema.parse({ ...DASAR, parent_id: "3", umur_teknis_tahun: "5", interval_preventif_hari: "90" });
        expect(hasil).toMatchObject({ parent_id: 3, umur_teknis_tahun: 5, interval_preventif_hari: 90 });
    });

    it("menolak umur teknis / interval nol atau negatif (CHECK 0026 tak boleh tercapai)", () => {
        expect(() => CategoryBodySchema.parse({ ...DASAR, umur_teknis_tahun: 0 })).toThrow();
        expect(() => CategoryBodySchema.parse({ ...DASAR, interval_preventif_hari: -1 })).toThrow();
    });

    it("menolak nama/kode kosong", () => {
        expect(() => CategoryBodySchema.parse({ ...DASAR, nama: "  " })).toThrow();
        expect(() => CategoryBodySchema.parse({ ...DASAR, kode: "" })).toThrow();
    });
});
