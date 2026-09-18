// Skema Zod M-04 (SDD-API-01). Uji negatif adalah acceptance PR-01-07 yang
// sebenarnya: permintaan yang tidak sah wajib ditolak SEBELUM lapisan layanan.

import { describe, expect, it } from "vitest";
import {
    ListRoomAssetsQuerySchema,
    RoomIdParamSchema,
} from "../../../src/modules/m04-assets/schemas/asset.schema.js";

describe("ListRoomAssetsQuerySchema (FR-03.2 langkah 4)", () => {
    it("berbawaan page=1, per_page=25 tanpa filter apa pun", () => {
        const hasil = ListRoomAssetsQuerySchema.parse({});
        expect(hasil.page).toBe(1);
        expect(hasil.per_page).toBe(25);
        expect(hasil.kategori_id).toBeUndefined();
        expect(hasil.kondisi).toBeUndefined();
        expect(hasil.status).toBeUndefined();
    });

    it("menerima kombinasi filter kategori, kondisi, dan status (dapat digabung)", () => {
        const hasil = ListRoomAssetsQuerySchema.parse({
            kategori_id: "3",
            kondisi: "RUSAK_RINGAN",
            status: "DIPINJAM",
        });
        expect(hasil.kategori_id).toBe(3);
        expect(hasil.kondisi).toBe("RUSAK_RINGAN");
        expect(hasil.status).toBe("DIPINJAM");
    });

    it("menolak kondisi di luar katalog asset_condition (0002)", () => {
        expect(() => ListRoomAssetsQuerySchema.parse({ kondisi: "SEDANG_DIPERBAIKI" })).toThrow();
    });

    it("menolak status di luar katalog asset_status (0002)", () => {
        expect(() => ListRoomAssetsQuerySchema.parse({ status: "HILANG" })).toThrow();
    });

    it("menolak per_page di atas 100", () => {
        expect(() => ListRoomAssetsQuerySchema.parse({ per_page: "101" })).toThrow();
    });
});

describe("RoomIdParamSchema", () => {
    it("menolak id bukan angka positif", () => {
        expect(() => RoomIdParamSchema.parse({ id: "0" })).toThrow();
        expect(() => RoomIdParamSchema.parse({ id: "-1" })).toThrow();
    });
});
