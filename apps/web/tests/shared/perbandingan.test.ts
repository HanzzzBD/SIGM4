// Perbandingan sebelum/sesudah P-74 (FR-18.2 AC; PR-01-25): label field Bahasa Indonesia, sorotan per field,
// larik berkunci `kode` (bentuk ROLE_PERMISSION_UPDATED) dibandingkan per kode tanpa memedulikan urutan.

import { describe, expect, it } from "vitest";
import { bandingkan, labelField, labelNilai, sama } from "../../src/modules/m18-activity-log/perbandingan";

describe("labelField", () => {
    it("humanize snake_case; akhiran _id; singkatan", () => {
        expect(labelField("tanggal_jatuh_tempo")).toBe("Tanggal jatuh tempo");
        expect(labelField("role_id")).toBe("Role (ID)");
        expect(labelField("nip_nis")).toBe("NIP/NIS");
        expect(labelField("id")).toBe("ID");
        expect(labelField("alamat_ip")).toBe("Alamat IP");
    });
});

describe("labelNilai", () => {
    it("null → —, boolean → Ya/Tidak, enum dikenal → label bersama, lainnya apa adanya", () => {
        expect(labelNilai("nama", null, "users")).toBe("—");
        expect(labelNilai("aktif", true, null)).toBe("Ya");
        expect(labelNilai("kondisi", "RUSAK_RINGAN", "assets")).toBe("Rusak Ringan");
        expect(labelNilai("status", "TERSEDIA", "assets")).not.toBe("TERSEDIA");
        expect(labelNilai("status", "AKTIF", "users")).toBe("AKTIF");
    });
});

describe("bandingkan", () => {
    it("objek: gabungan kunci; hanya yang berbeda ditandai berubah (urutan kunci bersarang diabaikan)", () => {
        const p = bandingkan({ nama: "Bu Sari", telepon: null, meta: { a: 1, b: 2 } }, { nama: "Bu Sari W.", telepon: null, meta: { b: 2, a: 1 }, work_unit_id: "3" });
        expect(p.jenis).toBe("objek");
        if (p.jenis !== "objek") return;
        expect(p.baris.map((b) => [b.kunci, b.berubah])).toEqual([["nama", true], ["telepon", false], ["meta", false], ["work_unit_id", true]]);
        expect(p.baris.find((b) => b.kunci === "work_unit_id")?.label).toBe("Work unit (ID)");
    });

    it("ROLE_PERMISSION_UPDATED: per kode — Ditambahkan, Dicabut, Diubah (scope), Tetap; urutan larik diabaikan", () => {
        const sebelum = [{ kode: "user.view", scope: "ALL" }, { kode: "role.view", scope: "ALL" }, { kode: "asset.view", scope: "ALL" }];
        const sesudah = [{ kode: "asset.view", scope: "OWN" }, { kode: "user.view", scope: "ALL" }, { kode: "damage.view", scope: "ALL" }];
        const p = bandingkan(sebelum, sesudah);
        expect(p.jenis).toBe("kode");
        if (p.jenis !== "kode") return;
        expect(Object.fromEntries(p.baris.map((b) => [b.kode, b.status]))).toEqual({ "asset.view": "DIUBAH", "damage.view": "DITAMBAHKAN", "role.view": "DICABUT", "user.view": "TETAP" });
    });

    it("larik lain dan skalar → satu baris Nilai; kosong → kosong", () => {
        expect(bandingkan([1, 2], [2, 1])).toEqual({ jenis: "nilai", sebelum: [1, 2], sesudah: [2, 1], berubah: true });
        expect(bandingkan(null, 5)).toMatchObject({ jenis: "nilai", berubah: true });
        expect(bandingkan(null, undefined)).toEqual({ jenis: "kosong" });
    });

    it("sama(): struktural", () => {
        expect(sama({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
        expect(sama({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        // R3 inspeksi: himpunan kunci berbeda walau nilainya sama-sama kosong.
        expect(sama({ a: null }, { b: null })).toBe(false);
        const p = bandingkan({ meta: { a: null } }, { meta: { b: null } });
        expect(p.jenis === "objek" && p.baris[0]?.berubah).toBe(true);
    });
});
