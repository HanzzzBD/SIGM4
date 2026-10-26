import { describe, expect, it } from "vitest";
import { actor, compare, fieldLabel, filterParams, same, valueLabel } from "../src/features/activity-log/model.js";

describe("MS-88/89 activity log (FR-18.x)", () => {
    it("sends inclusive WIB day bounds and trimmed filters", () => {
        expect(filterParams({ dari: "2026-10-01", sampai: "2026-10-26", modul: " m04-assets ", aksi: "", user: "5" })).toEqual({ "filter[dari]": "2026-10-01T00:00:00.000+07:00", "filter[sampai]": "2026-10-26T23:59:59.999+07:00", "filter[user_id]": "5", "filter[modul]": "m04-assets" });
        expect(filterParams({})).toEqual({});
    });
    it("names system actors and anonymous requests", () => {
        expect(actor({ user_nama: "SYSTEM", user_id: null })).toBe("Sistem");
        expect(actor({ user_nama: "Sari", user_id: "5" })).toBe("Sari");
        expect(actor({ user_nama: null, user_id: null })).toBe("Anonim (tanpa sesi)");
        expect(actor({ user_nama: null, user_id: "9" })).toBe("Pengguna #9");
    });
    it("humanizes keys and shows enum labels instead of codes", () => {
        expect(fieldLabel("tanggal_jatuh_tempo")).toBe("Tanggal jatuh tempo");
        expect(fieldLabel("role_id")).toBe("Role (ID)");
        expect(fieldLabel("nip_nis")).toBe("NIP/NIS");
        expect(valueLabel("kondisi", "RUSAK_RINGAN", "assets")).toBe("Rusak Ringan");
        expect(valueLabel("catatan", "", null)).toBe("—");
        expect(valueLabel("aktif", false, null)).toBe("Tidak");
    });
    it("compares objects per key, coded arrays per code, otherwise whole values", () => {
        expect(compare({ nama: "A", lokasi: 1 }, { lokasi: 1, nama: "B", baru: true })).toEqual({ kind: "object", rows: [{ key: "nama", label: "Nama", before: "A", after: "B", changed: true }, { key: "lokasi", label: "Lokasi", before: 1, after: 1, changed: false }, { key: "baru", label: "Baru", before: undefined, after: true, changed: true }] });
        expect(compare([{ kode: "a.view", scope: "ALL" }, { kode: "b.view", scope: "OWN" }], [{ kode: "b.view", scope: "ALL" }, { kode: "c.view", scope: "ALL" }])).toMatchObject({ kind: "code", rows: [{ code: "a.view", status: "DICABUT" }, { code: "b.view", status: "DIUBAH" }, { code: "c.view", status: "DITAMBAHKAN" }] });
        expect(compare(null, undefined)).toEqual({ kind: "empty" });
        expect(compare(3, 4)).toEqual({ kind: "value", before: 3, after: 4, changed: true });
        expect(same({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
        expect(same({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });
});
