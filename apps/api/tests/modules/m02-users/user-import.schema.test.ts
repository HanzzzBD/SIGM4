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
        kode_unit_kerja: "TU-01",
    };
    const PESAN = "Kode unit kerja wajib diisi (E.5.2).";

    it("menerima baris minimal sah: kode_unit_kerja wajib, telepon opsional", () => {
        expect(() => ImportUserRowSchema.parse(dasar)).not.toThrow();
    });

    it("E.5.2: kode_unit_kerja WAJIB — tidak ada, kosong, atau hanya spasi ditolak dengan alasan berbahasa Indonesia", () => {
        const { kode_unit_kerja: _dibuang, ...tanpa } = dasar;
        for (const baris of [tanpa, { ...dasar, kode_unit_kerja: undefined }, { ...dasar, kode_unit_kerja: "" }, { ...dasar, kode_unit_kerja: "   " }]) {
            const hasil = ImportUserRowSchema.safeParse(baris);
            expect(hasil.success).toBe(false);
            expect(hasil.error?.issues.map((i) => i.message)).toEqual([PESAN]);
        }
    });

    it("E.5.2: kode_unit_kerja tanpa pengecualian role — Siswa/OSIS (R-07) juga wajib", () => {
        const { kode_unit_kerja: _dibuang, ...tanpa } = { ...dasar, kode_role: "R-07", consent_wali: "true" };
        expect(ImportUserRowSchema.safeParse(tanpa).success).toBe(false);
        expect(ImportUserRowSchema.safeParse({ ...dasar, kode_role: "R-07", consent_wali: "true" }).success).toBe(true);
    });

    it("kode_unit_kerja dipangkas spasi tepinya dan dibatasi 100 karakter", () => {
        expect(ImportUserRowSchema.parse({ ...dasar, kode_unit_kerja: "  TU-01 " }).kode_unit_kerja).toBe("TU-01");
        expect(ImportUserRowSchema.safeParse({ ...dasar, kode_unit_kerja: "x".repeat(101) }).success).toBe(false);
    });

    it("menolak email tidak sah", () => {
        expect(() =>
            ImportUserRowSchema.parse({ ...dasar, email: "bukan-email" }),
        ).toThrow();
    });

    it("menolak nip_nis kosong", () => {
        expect(() => ImportUserRowSchema.parse({ ...dasar, nip_nis: "" })).toThrow();
    });

    it("kolom kelas masih diabaikan (impor kelas belum dibangun); consent_wali kini dibaca (PR-01-14, DP-02)", () => {
        const hasil = ImportUserRowSchema.parse({
            ...dasar,
            kelas: "X-IPA-1",
            consent_wali: "true",
        }) as Record<string, unknown>;
        expect(hasil["kelas"]).toBeUndefined();
        expect(hasil["consent_wali"]).toBe(true);
    });
});
