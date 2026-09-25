// Skema Zod M-04 (SDD-API-01). Uji negatif adalah acceptance PR-01-07 yang
// sebenarnya: permintaan yang tidak sah wajib ditolak SEBELUM lapisan layanan.

import { describe, expect, it } from "vitest";
import {
    CreateAssetBodySchema,
    ListRoomAssetsQuerySchema,
    RoomIdParamSchema,
} from "../../../src/modules/m04-assets/schemas/asset.schema.js";

const DASAR = {
    nama: "Kursi Kelas",
    category_id: "1",
    tahun_perolehan: "2024",
    sumber_perolehan: "PEMBELIAN",
    room_id: "1",
    kondisi: "BAIK",
};

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

describe("CreateAssetBodySchema (FR-04.1 langkah 2-3, PR-02-11)", () => {
    it("berbawaan dapat_dipinjam=true, boleh_dipinjam_siswa=false, jumlah_unit=1", () => {
        const hasil = CreateAssetBodySchema.parse(DASAR);
        expect(hasil.dapat_dipinjam).toBe(true);
        expect(hasil.boleh_dipinjam_siswa).toBe(false);
        expect(hasil.jumlah_unit).toBe(1);
        expect(hasil.merek).toBeUndefined();
        expect(hasil.nomor_seri).toBeUndefined();
    });

    it("menerima jumlah_unit hingga 500 (conventions.md E.5.1)", () => {
        expect(CreateAssetBodySchema.parse({ ...DASAR, jumlah_unit: "500" }).jumlah_unit).toBe(500);
    });

    it("menolak jumlah_unit di luar 1..500", () => {
        expect(() => CreateAssetBodySchema.parse({ ...DASAR, jumlah_unit: "0" })).toThrow();
        expect(() => CreateAssetBodySchema.parse({ ...DASAR, jumlah_unit: "501" })).toThrow();
    });

    it("menolak sumber_perolehan di luar katalog Bab 11.3", () => {
        expect(() => CreateAssetBodySchema.parse({ ...DASAR, sumber_perolehan: "SEWA" })).toThrow();
    });

    it("menolak kondisi di luar katalog asset_condition", () => {
        expect(() => CreateAssetBodySchema.parse({ ...DASAR, kondisi: "SEDANG_DIPERBAIKI" })).toThrow();
    });

    it("menolak tahun_perolehan di luar pagar teknis 1900-2100", () => {
        expect(() => CreateAssetBodySchema.parse({ ...DASAR, tahun_perolehan: "1899" })).toThrow();
        expect(() => CreateAssetBodySchema.parse({ ...DASAR, tahun_perolehan: "2101" })).toThrow();
    });

    it("menerima nomor_seri/merek/model/nilai_perolehan/penanggung_jawab_id/procurement_id opsional", () => {
        const hasil = CreateAssetBodySchema.parse({
            ...DASAR,
            merek: "Chitose",
            model: "Galva",
            nomor_seri: "SN-001",
            nilai_perolehan: "150000",
            penanggung_jawab_id: "2",
            procurement_id: "9",
        });
        expect(hasil.merek).toBe("Chitose");
        expect(hasil.nilai_perolehan).toBe(150000);
        expect(hasil.penanggung_jawab_id).toBe(2);
        expect(hasil.procurement_id).toBe(9);
    });
});
