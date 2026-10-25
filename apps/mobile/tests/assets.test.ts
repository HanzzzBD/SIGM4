import { describe, expect, it } from "vitest";
import { EMPTY_FORM, createBody, formProblems, moveBody, updateBody, warranty } from "../src/features/assets/model.js";
import { documentMime } from "../src/shared/upload/document-policy.js";
import { visibleMenu } from "../src/features/menu/model.js";

const form = { ...EMPTY_FORM, nama: "Laptop", category: "4", tahun: "2025", room: "9", jumlah: "3" };

describe("MS-34 Tambah / Ubah Aset (FR-04.1, FR-04.3)", () => {
    it("validates like the web form, including serial numbers for a single unit (BR-003)", () => {
        expect(formProblems(form, { create: true })).toEqual([]);
        expect(formProblems({ ...form, seri: "SN-1" }, { create: true })).toEqual(["Nomor seri hanya untuk pendaftaran satu unit."]);
        expect(formProblems({ ...form, tahun: "25", siswa: true }, { create: true })).toEqual(["Isi tahun empat digit, 1900–2100.", "Boleh dipinjam siswa menuntut aset dapat dipinjam."]);
        expect(formProblems({ ...form, category: "", room: "" }, { create: true })).toHaveLength(2);
    });
    it("requires a reason for a condition change and a reference when lost", () => {
        expect(formProblems({ ...form, kondisi: "RUSAK_RINGAN" }, { create: false, oldCondition: "BAIK" })).toEqual(["Alasan perubahan kondisi wajib diisi."]);
        expect(formProblems({ ...form, kondisi: "HILANG", alasan: "Tidak ditemukan" }, { create: false, oldCondition: "BAIK" })).toEqual(["Kondisi Hilang wajib merujuk sesi stock opname atau berita acara kehilangan."]);
        expect(formProblems({ ...form, kondisi: "HILANG", alasan: "x", refJenis: "OPNAME", refId: "3" }, { create: false, oldCondition: "BAIK" })).toEqual([]);
    });
    it("creates n units and never lets students borrow a non-lendable asset", () => {
        expect(createBody({ ...form, siswa: true })).toMatchObject({ category_id: 4, room_id: 9, jumlah_unit: 3, nomor_seri: null, boleh_dipinjam_siswa: false, nilai_perolehan: null });
    });
    it("sends financial and condition fields only when allowed and changed", () => {
        expect(updateBody(form, { kondisi: "BAIK", financial: false })).not.toHaveProperty("sumber_perolehan");
        expect(updateBody(form, { kondisi: "BAIK", financial: false })).not.toHaveProperty("kondisi");
        expect(updateBody({ ...form, nilai: "1500000", kondisi: "HILANG", alasan: " x ", refJenis: "OPNAME", refId: "3" }, { kondisi: "BAIK", financial: true })).toMatchObject({ sumber_perolehan: "PEMBELIAN", nilai_perolehan: 1500000, kondisi: "HILANG", alasan: "x", referensi_jenis: "OPNAME", referensi_id: 3 });
    });
});

describe("MS-35 Mutasi Lokasi (FR-04.4)", () => {
    it("moves 1–50 assets to a destination with a reason", () => {
        expect(moveBody({ assets: [], room: "2", date: "2026-11-03", reason: "x", pj: "" })).toEqual({ error: "Pilih minimal satu aset." });
        expect(moveBody({ assets: Array.from({ length: 51 }, (_, i) => String(i + 1)), room: "2", date: "2026-11-03", reason: "x", pj: "" })).toEqual({ error: "Mutasi paling banyak 50 aset sekaligus." });
        expect(moveBody({ assets: ["1"], room: "", date: "2026-11-03", reason: "x", pj: "" })).toEqual({ error: "Pilih ruangan tujuan." });
        expect(moveBody({ assets: ["1", "2"], room: "7", date: "2026-11-03", reason: "Renovasi", pj: "5" })).toEqual({ body: { asset_ids: [1, 2], room_tujuan_id: 7, tanggal_mutasi: "2026-11-03", alasan: "Renovasi", penanggung_jawab_baru_id: 5 } });
    });
});

describe("MS-39 Dokumen Aset (FR-06.1)", () => {
    it("accepts only the M-06 document policy", () => {
        expect(documentMime("faktur.PDF", 1000)).toEqual({ mime: "application/pdf" });
        expect(documentMime("data.xlsx", 10 * 1024 * 1024)).toHaveProperty("mime");
        expect(documentMime("data.xlsx", 10 * 1024 * 1024 + 1)).toEqual({ error: "Ukuran dokumen maksimal 10 MB." });
        expect(documentMime("skrip.exe", 10)).toHaveProperty("error");
        expect(documentMime("kosong.pdf", 0)).toHaveProperty("error");
    });
    it("marks warranties ending within 30 days", () => {
        const g = { jenis: "GARANSI", garansi_mulai: "2026-01-01", garansi_selesai: "2026-11-20" };
        expect(warranty(g, "2026-11-03")).toEqual({ label: "Berakhir dalam 17 hari", tone: "warning" });
        expect(warranty(g, "2026-06-01")).toEqual({ label: "Garansi aktif", tone: "success" });
        expect(warranty(g, "2026-12-01")?.label).toBe("Garansi berakhir");
        expect(warranty({ ...g, jenis: "FAKTUR" }, "2026-11-03")).toBeNull();
    });
});

describe("Menu Aset & Bahan", () => {
    it("opens inventory, categories, and documents natively; Label QR stays a web entry", () => {
        expect(visibleMenu({ "asset.view": "all", "category.manage": "all", "asset_document.view": "all", "asset.qr_print": "all" })[0]?.entries.map((e) => e.path)).toEqual(["/aset", "/kategori-aset", "/label-qr", "/dokumen-aset", "/scan"]);
    });
});
