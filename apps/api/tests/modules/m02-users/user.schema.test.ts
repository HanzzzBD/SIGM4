// Skema Zod M-02 (SDD-API-01). Uji negatif adalah acceptance PR-01-02 yang
// sebenarnya: permintaan yang tidak sah wajib ditolak SEBELUM lapisan layanan.

import { describe, expect, it } from "vitest";
import {
    CreateUserBodySchema,
    ListUsersQuerySchema,
    UpdateUserStatusBodySchema,
} from "../../../src/modules/m02-users/schemas/user.schema.js";

describe("CreateUserBodySchema (FR-02.1)", () => {
    const dasar = {
        nama: "Budi Santoso",
        email: "Budi.Santoso@Sekolah.sch.id",
        nip_nis: "198001012005011001",
        role_id: 2,
    };

    it("menerima data minimal sah, email dinormalisasi huruf kecil", () => {
        const hasil = CreateUserBodySchema.parse(dasar);
        expect(hasil.email).toBe("budi.santoso@sekolah.sch.id");
    });

    it("menolak email tidak sah", () => {
        expect(() =>
            CreateUserBodySchema.parse({ ...dasar, email: "bukan-email" }),
        ).toThrow();
    });

    it("menolak nama kosong", () => {
        expect(() =>
            CreateUserBodySchema.parse({ ...dasar, nama: "" }),
        ).toThrow();
    });

    it("menolak role_id bukan angka positif", () => {
        expect(() =>
            CreateUserBodySchema.parse({ ...dasar, role_id: -1 }),
        ).toThrow();
    });

    it("tidak menerima field password dari klien — server yang menerbitkannya", () => {
        const hasil = CreateUserBodySchema.parse({
            ...dasar,
            password: "TidakBolehDiterima123",
        }) as Record<string, unknown>;
        expect(hasil["password"]).toBeUndefined();
    });
});

describe("UpdateUserStatusBodySchema (FR-02.1 langkah 7)", () => {
    it("mengaktifkan kembali tidak menuntut alasan", () => {
        expect(() =>
            UpdateUserStatusBodySchema.parse({ status: "AKTIF" }),
        ).not.toThrow();
    });

    it("menonaktifkan TANPA alasan ditolak", () => {
        expect(() =>
            UpdateUserStatusBodySchema.parse({ status: "NONAKTIF" }),
        ).toThrow();
    });

    it("menonaktifkan DENGAN alasan diterima", () => {
        const hasil = UpdateUserStatusBodySchema.parse({
            status: "NONAKTIF",
            alasan: "Mengundurkan diri",
        });
        expect(hasil.alasan).toBe("Mengundurkan diri");
    });
});

describe("ListUsersQuerySchema (Bab 17.1)", () => {
    it("bawaan page=1, per_page=25 saat kosong", () => {
        const hasil = ListUsersQuerySchema.parse({});
        expect(hasil).toMatchObject({ page: 1, per_page: 25 });
    });

    it("per_page di atas 100 ditolak", () => {
        expect(() =>
            ListUsersQuerySchema.parse({ per_page: "101" }),
        ).toThrow();
    });

    it("status filter di luar enum ditolak", () => {
        expect(() =>
            ListUsersQuerySchema.parse({ status: "DIHAPUS" }),
        ).toThrow();
    });
});
