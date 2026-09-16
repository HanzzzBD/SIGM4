// Skema Zod impor massal pengguna (FR-02.1 A4, IMPT-01).

import { describe, expect, it } from "vitest";
import {
    ImportUserRowSchema,
    ImportUsersBodySchema,
} from "../../../src/modules/m02-users/schemas/user-import.schema.js";

describe("ImportUsersBodySchema", () => {
    it("menerima nama berkas .csv dan .xlsx", () => {
        expect(() =>
            ImportUsersBodySchema.parse({
                filename: "pengguna.csv",
                content_base64: "aGFsbG8=",
            }),
        ).not.toThrow();
        expect(() =>
            ImportUsersBodySchema.parse({
                filename: "pengguna.xlsx",
                content_base64: "aGFsbG8=",
            }),
        ).not.toThrow();
    });

    it("menolak ekstensi selain csv/xlsx", () => {
        expect(() =>
            ImportUsersBodySchema.parse({
                filename: "pengguna.pdf",
                content_base64: "aGFsbG8=",
            }),
        ).toThrow();
    });

    it("menolak content_base64 kosong", () => {
        expect(() =>
            ImportUsersBodySchema.parse({ filename: "pengguna.csv", content_base64: "" }),
        ).toThrow();
    });
});

describe("ImportUserRowSchema (Lampiran E.5.2)", () => {
    const dasar = {
        nama_lengkap: "Budi Santoso",
        email: "budi@sekolah.sch.id",
        nip_nis: "198001012005011001",
        kode_role: "R-02",
    };

    it("menerima baris minimal sah tanpa kode_unit_kerja/telepon (opsional — PR-01-12 belum ada)", () => {
        expect(() => ImportUserRowSchema.parse(dasar)).not.toThrow();
    });

    it("menolak email tidak sah", () => {
        expect(() =>
            ImportUserRowSchema.parse({ ...dasar, email: "bukan-email" }),
        ).toThrow();
    });

    it("menolak nip_nis kosong", () => {
        expect(() => ImportUserRowSchema.parse({ ...dasar, nip_nis: "" })).toThrow();
    });

    it("mengabaikan kolom kelas/consent_wali bila ikut terkirim (belum ada kolomnya — PR-01-13/14)", () => {
        const hasil = ImportUserRowSchema.parse({
            ...dasar,
            kelas: "X-IPA-1",
            consent_wali: "true",
        }) as Record<string, unknown>;
        expect(hasil["kelas"]).toBeUndefined();
        expect(hasil["consent_wali"]).toBeUndefined();
    });
});
