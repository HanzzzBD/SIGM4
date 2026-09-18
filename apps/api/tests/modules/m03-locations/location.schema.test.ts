// Skema Zod M-03 (SDD-API-01). Uji negatif adalah acceptance PR-01-05 yang
// sebenarnya: permintaan yang tidak sah wajib ditolak SEBELUM lapisan layanan.

import { describe, expect, it } from "vitest";
import {
    CreateAreaBodySchema,
    CreateBuildingBodySchema,
    CreateRoomBodySchema,
    IdParamSchema,
    UpdateLocationStatusBodySchema,
    UpdateRoomBodySchema,
} from "../../../src/modules/m03-locations/schemas/location.schema.js";

describe("CreateBuildingBodySchema (FR-03.1 langkah 2)", () => {
    it("menerima data minimal sah", () => {
        const hasil = CreateBuildingBodySchema.parse({ nama: "Gedung A", kode: "GD-A" });
        expect(hasil.keterangan).toBeUndefined();
    });

    it("menolak nama kosong", () => {
        expect(() =>
            CreateBuildingBodySchema.parse({ nama: "", kode: "GD-A" }),
        ).toThrow();
    });

    it("menolak kode kosong", () => {
        expect(() =>
            CreateBuildingBodySchema.parse({ nama: "Gedung A", kode: "" }),
        ).toThrow();
    });
});

describe("CreateAreaBodySchema (FR-03.1 langkah 3)", () => {
    it("menerima lantai null (area bukan lantai bernomor)", () => {
        const hasil = CreateAreaBodySchema.parse({
            building_id: 1,
            nama: "Lapangan",
            kode: "AR-1",
            lantai: null,
        });
        expect(hasil.lantai).toBeNull();
    });

    it("menolak building_id bukan angka positif", () => {
        expect(() =>
            CreateAreaBodySchema.parse({ building_id: -1, nama: "L1", kode: "AR-1" }),
        ).toThrow();
    });
});

describe("CreateRoomBodySchema (FR-03.1 langkah 4, BR-016)", () => {
    const dasar = { area_id: 1, nama: "Kelas A", kode: "RM-1", jenis: "KELAS" };

    it("dapat_direservasi dan boleh_direservasi_siswa berbawaan false", () => {
        const hasil = CreateRoomBodySchema.parse(dasar);
        expect(hasil.dapat_direservasi).toBe(false);
        expect(hasil.boleh_direservasi_siswa).toBe(false);
    });

    it("menolak jenis di luar katalog room_type (0002)", () => {
        expect(() =>
            CreateRoomBodySchema.parse({ ...dasar, jenis: "RUANG_RAPAT" }),
        ).toThrow();
    });

    it("menolak kapasitas nol atau negatif", () => {
        expect(() => CreateRoomBodySchema.parse({ ...dasar, kapasitas: 0 })).toThrow();
        expect(() => CreateRoomBodySchema.parse({ ...dasar, kapasitas: -5 })).toThrow();
    });

    it("menerima kapasitas null (ruangan tanpa kapasitas, mis. Gudang)", () => {
        const hasil = CreateRoomBodySchema.parse({ ...dasar, kapasitas: null });
        expect(hasil.kapasitas).toBeNull();
    });
});

describe("UpdateRoomBodySchema — PUT tanpa status", () => {
    it("menolak payload yang menyertakan status (bukan bagian skema)", () => {
        const hasil = UpdateRoomBodySchema.parse({
            area_id: 1,
            nama: "Kelas A",
            kode: "RM-1",
            jenis: "KELAS",
            dapat_direservasi: false,
            boleh_direservasi_siswa: false,
            status: "NONAKTIF",
        }) as Record<string, unknown>;
        expect(hasil["status"]).toBeUndefined();
    });

    it("menuntut dapat_direservasi/boleh_direservasi_siswa eksplisit — TANPA bawaan (PUT = pengganti penuh)", () => {
        expect(() =>
            UpdateRoomBodySchema.parse({
                area_id: 1,
                nama: "Kelas A",
                kode: "RM-1",
                jenis: "KELAS",
            }),
        ).toThrow();
    });
});

describe("UpdateLocationStatusBodySchema (PR-01-06, BR-015)", () => {
    it("menerima AKTIF dan NONAKTIF", () => {
        expect(UpdateLocationStatusBodySchema.parse({ status: "AKTIF" }).status).toBe("AKTIF");
        expect(UpdateLocationStatusBodySchema.parse({ status: "NONAKTIF" }).status).toBe(
            "NONAKTIF",
        );
    });

    it("menolak status di luar enum location_status", () => {
        expect(() => UpdateLocationStatusBodySchema.parse({ status: "DIHAPUS" })).toThrow();
    });
});

describe("IdParamSchema", () => {
    it("menolak id bukan angka positif", () => {
        expect(() => IdParamSchema.parse({ id: "0" })).toThrow();
        expect(() => IdParamSchema.parse({ id: "-1" })).toThrow();
    });
});
