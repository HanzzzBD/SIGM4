import { describe, expect, it } from "vitest";
import { canEdit, emptyForm, estimateTotal, formFromAsset, newItem, procurementBody } from "../src/features/procurement/model.js";

const item = { ...newItem(), nama_barang: "Proyektor", category_id: "3", jumlah: "2", harga: "4500000.5" };
const form = { ...emptyForm("2026"), judul: "Proyektor kelas", unit: "4", justifikasi: "Proyektor lama rusak", items: [item], lampiran: [{ file_id: 9, nama_berkas: "brosur.pdf", scan_status: "CLEAN" as const }] };

describe("MS-68 usulan pengadaan (FR-14.1)", () => {
    it("submits a complete proposal with an asset category and attachments", () => {
        expect(procurementBody(form, "AJUKAN")).toEqual({ body: { mode: "AJUKAN", judul: "Proyektor kelas", work_unit_id: 4, tahun_anggaran: 2026, prioritas: "SEDANG", justifikasi: "Proyektor lama rusak", lampiran: [{ file_id: 9, nama_berkas: "brosur.pdf" }], source_asset_id: null, items: [{ jenis: "ASET", nama_barang: "Proyektor", category_id: 3, spesifikasi: "", jumlah: 2, satuan: "unit", estimasi_harga_satuan: 4500000.5, keterangan: null }] } });
    });
    it("requires unit, justification and at least one item only when submitting", () => {
        expect(procurementBody({ ...form, unit: "" }, "AJUKAN")).toHaveProperty("error");
        expect(procurementBody({ ...form, justifikasi: " " }, "AJUKAN")).toHaveProperty("error");
        expect(procurementBody({ ...form, items: [] }, "AJUKAN")).toHaveProperty("error");
        expect(procurementBody({ ...form, unit: "", justifikasi: "", items: [item, newItem()] }, "DRAF")).toMatchObject({ body: { mode: "DRAF", work_unit_id: null, items: [{ nama_barang: "Proyektor" }] } });
    });
    it("sends a material id for consumables and names the failing item", () => {
        const bahan = { ...newItem(), jenis: "BAHAN" as const, material_id: "12", nama_barang: "Kertas A4", satuan: "rim" };
        expect(procurementBody({ ...form, items: [bahan] }, "AJUKAN")).toMatchObject({ body: { items: [{ jenis: "BAHAN", material_id: 12 }] } });
        expect(Object.keys((procurementBody({ ...form, items: [bahan] }, "AJUKAN") as { body: { items: object[] } }).body.items[0]!)).not.toContain("category_id");
        expect(procurementBody({ ...form, items: [item, { ...item, category_id: "" }] }, "AJUKAN")).toEqual({ error: "Barang 2: Kategori aset wajib dipilih." });
    });
    it("estimates the total and prefills a replacement from the source asset", () => {
        expect(estimateTotal([item, { ...item, jumlah: "1", harga: "1000" }])).toBe(9001001);
        expect(estimateTotal([{ ...item, jumlah: "" }])).toBe(0);
        expect(formFromAsset(emptyForm("2026", "77"), { nama: "Laptop Guru", kategori: { id: "5" }, kondisi: "RUSAK_BERAT" })).toMatchObject({ source: "77", judul: "Penggantian Laptop Guru", justifikasi: expect.stringContaining("rusak berat"), items: [{ nama_barang: "Laptop Guru", category_id: "5" }] });
        expect(procurementBody({ ...form, source: "77" }, "AJUKAN")).toMatchObject({ body: { source_asset_id: 77 } });
    });
    it("lets only the proposer edit drafts and returned proposals", () => {
        const perms = { "procurement.create": "own" }, d = { status: "DRAF" as const, pengusul: { id: "5", nama: "Guru", role_kode: "R-04" } };
        expect(canEdit(d, "5", perms)).toBe(true);
        expect(canEdit({ ...d, status: "PERLU_REVISI" }, "5", perms)).toBe(true);
        expect(canEdit({ ...d, status: "MENUNGGU_PERSETUJUAN" }, "5", perms)).toBe(false);
        expect(canEdit(d, "6", perms)).toBe(false);
        expect(canEdit(d, "5", {})).toBe(false);
    });
});
