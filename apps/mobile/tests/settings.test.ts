import { describe, expect, it } from "vitest";
import { holidayBody, parameterChanges, shownValue, typedValue, unitBody, yearBody, yearForm } from "../src/features/settings/model.js";
import type { Parameter, Year } from "../src/features/settings/model.js";

const p = (key: string, tipe: Parameter["tipe"], value: unknown): Parameter => ({ key, kelompok: "PEMINJAMAN", tipe, value, nilai_bawaan: value, nilai_min: 1, nilai_maks: 30, deskripsi: key, updated_at: "2026-10-01T00:00:00Z", updated_by: null });
describe("MS-85 parameter sistem (FR-20.1)", () => {
    it("types values and rejects non-numbers before sending", () => {
        expect(typedValue({ tipe: "BILANGAN_BULAT" }, "7")).toBe(7);
        expect(typedValue({ tipe: "BILANGAN_BULAT" }, "7,5")).toBeUndefined();
        expect(typedValue({ tipe: "DESIMAL" }, "7,5")).toBe(7.5);
        expect(typedValue({ tipe: "DESIMAL" }, " ")).toBeUndefined();
        expect(typedValue({ tipe: "BOOLEAN" }, true)).toBe(true);
        expect(typedValue({ tipe: "TEKS" }, " SMA ")).toBe(" SMA ");
        expect(shownValue({ tipe: "BOOLEAN", value: true })).toBe(true);
        expect(shownValue({ tipe: "TEKS", value: null })).toBe("");
    });
    it("sends only changed keys and leaves range checks to the server (A1)", () => {
        const params = [p("maks_hari", "BILANGAN_BULAT", 7), p("aktif", "BOOLEAN", false), p("nama", "TEKS", "SMA")];
        expect(parameterChanges(params, { maks_hari: "7", aktif: true })).toEqual({ settings: { aktif: true } });
        expect(parameterChanges(params, { maks_hari: "99" })).toEqual({ settings: { maks_hari: 99 } });
        expect(parameterChanges(params, { maks_hari: "x", nama: "SMK" })).toEqual({ errors: { maks_hari: "Isi dengan bilangan bulat." } });
    });
});

describe("MS-86/87 kalender & unit kerja (FR-20.2)", () => {
    const f = { nama: "2026/2027", start: "2026-07-13", end: "2027-06-30", ganjil: ["2026-07-13", "2026-12-19"] as [string, string], genap: ["2027-01-04", "2027-06-30"] as [string, string] };
    it("requires the year and both semesters, leaving date order to the server", () => {
        expect(yearBody(f)).toEqual({ body: { nama: "2026/2027", tanggal_mulai: "2026-07-13", tanggal_selesai: "2027-06-30", semester: [{ nama: "GANJIL", tanggal_mulai: "2026-07-13", tanggal_selesai: "2026-12-19" }, { nama: "GENAP", tanggal_mulai: "2027-01-04", tanggal_selesai: "2027-06-30" }] } });
        expect(yearBody({ ...f, genap: ["", "2027-06-30"] })).toEqual({ error: "Lengkapi nama, rentang tahun ajaran, dan kedua semester." });
        expect(yearBody({ ...f, nama: " " })).toHaveProperty("error");
        const y: Year = { id: "1", nama: "2026/2027", tanggal_mulai: "2026-07-13T00:00:00+07:00", tanggal_selesai: "2027-06-30", is_active: true, semester: [{ id: "a", nama: "GENAP", tanggal_mulai: "2027-01-04", tanggal_selesai: "2027-06-30" }, { id: "b", nama: "GANJIL", tanggal_mulai: "2026-07-13", tanggal_selesai: "2026-12-19" }] };
        expect(yearForm(y)).toEqual(f);
    });
    it("scopes holidays to a year or to all years", () => {
        expect(holidayBody({ tanggal: "2026-08-17", nama: " HUT RI ", jenis: "NASIONAL", year: "" })).toEqual({ body: { tanggal: "2026-08-17", nama: "HUT RI", jenis: "NASIONAL", academic_year_id: null } });
        expect(holidayBody({ tanggal: "2026-08-17", nama: "x", jenis: "SEKOLAH", year: "3" })).toMatchObject({ body: { academic_year_id: 3 } });
        expect(holidayBody({ tanggal: "", nama: "x", jenis: "SEKOLAH", year: "" })).toHaveProperty("error");
    });
    it("keeps the unit head when editing a work unit", () => {
        expect(unitBody({ nama: "Kelas X-1", kode: "X1", jenis: "KELAS" })).toEqual({ body: { nama: "Kelas X-1", kode: "X1", jenis: "KELAS" } });
        expect(unitBody({ nama: "Kelas X-1", kode: "X1", jenis: "KELAS" }, { kepala_unit_id: "8" })).toMatchObject({ body: { kepala_unit_id: 8 } });
        expect(unitBody({ nama: "Kelas X-1", kode: "X1", jenis: "KELAS" }, { kepala_unit_id: null })).toMatchObject({ body: { kepala_unit_id: null } });
        expect(unitBody({ nama: "", kode: "X1", jenis: "KELAS" })).toHaveProperty("error");
    });
});
