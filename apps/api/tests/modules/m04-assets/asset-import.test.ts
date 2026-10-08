import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { ASSET_IMPORT_COLUMNS, importAssetRowSchema, ImportAssetsBodySchema } from "@sigm4/schemas";
import { assetImportTemplate, readAssetImportFile } from "../../../src/modules/m04-assets/services/asset-import-file.js";

const valid = { nama_barang: "Kursi", kode_kategori: "KAT", kode_ruangan: "R1", tahun_perolehan: "2026", sumber_perolehan: "Pembelian", kondisi: "Rusak Ringan", dapat_dipinjam: "true", boleh_dipinjam_siswa: "false", jumlah_unit: "1" };
describe("E.5.1: validasi baris impor aset", () => {
    it("menerima label Indonesia, kode teknis, nilai kosong dan nomor seri berawalan nol", () => {
        expect(importAssetRowSchema(2026).parse({ ...valid, nomor_seri: "00001234567890123456", nilai_perolehan: "12345.67" })).toMatchObject({ nomor_seri: "00001234567890123456", kondisi: "RUSAK_RINGAN", sumber_perolehan: "PEMBELIAN", nilai_perolehan: 12345.67, dapat_dipinjam: true });
        expect(importAssetRowSchema(2026).parse({ ...valid, sumber_perolehan: "Bantuan" }).sumber_perolehan).toBe("BANTUAN_PEMERINTAH");
    });
    it.each([
        { tahun_perolehan: "1949" }, { tahun_perolehan: "2027" }, { tahun_perolehan: "" },
        { jumlah_unit: "0" }, { jumlah_unit: "501" }, { jumlah_unit: "1.5" },
        { dapat_dipinjam: "false", boleh_dipinjam_siswa: "true" }, { dapat_dipinjam: "1" },
        { jumlah_unit: "2", nomor_seri: "SERI" }, { kondisi: "Hilang" }, { nilai_perolehan: "-1" },
        { nilai_perolehan: "1.234" }, { nilai_perolehan: "1000000000000" },
    ])("menolak isian di luar E.5.1: %j", (override) => {
        expect(importAssetRowSchema(2026).safeParse({ ...valid, ...override }).success).toBe(false);
    });
    it("body menolak ekstensi dan base64 yang rusak", () => {
        expect(ImportAssetsBodySchema.safeParse({ filename: "a.exe", content_base64: "YQ==" }).success).toBe(false);
        expect(ImportAssetsBodySchema.safeParse({ filename: "a.csv", content_base64: "@@@" }).success).toBe(false);
    });
});
describe("parser/template CSV dan XLSX", () => {
    it("CSV mempertahankan nol di depan, kutipan, nomor baris fisik dan sel opsional kosong", async () => {
        const cells = ASSET_IMPORT_COLUMNS.map((name) => ({ ...valid, nama_barang: '"Kursi, kelas"', nomor_seri: "00001234567890123456" } as Record<string, string>)[name] ?? "");
        const rows = await readAssetImportFile("a.csv", Buffer.from(`${ASSET_IMPORT_COLUMNS.join(",")}\n\n${cells.join(",")}`));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ number: 3, data: { nama_barang: "Kursi, kelas", nomor_seri: "00001234567890123456", merek: undefined } });
    });
    it("template dapat dibaca ulang dengan kode master dan contoh sah", async () => {
        const rows = await readAssetImportFile("template_aset.xlsx", await assetImportTemplate("KAT", "R1", 2026));
        expect(rows).toHaveLength(1);
        expect(importAssetRowSchema(2026).parse(rows[0]?.data)).toMatchObject({ kode_kategori: "KAT", kode_ruangan: "R1", jumlah_unit: 1 });
    });
    it("XLSX membaca sel boolean, teks seri; formula menjadi kegagalan baris", async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Aset");
        sheet.addRow([...ASSET_IMPORT_COLUMNS]);
        sheet.addRow(ASSET_IMPORT_COLUMNS.map((name) => ({ ...valid, nomor_seri: "000001" } as Record<string, string>)[name] ?? null));
        sheet.getCell(2, ASSET_IMPORT_COLUMNS.indexOf("dapat_dipinjam") + 1).value = true;
        sheet.addRow(ASSET_IMPORT_COLUMNS.map((name) => (valid as Record<string, string>)[name] ?? null));
        sheet.getCell(3, 1).value = { formula: '"Kursi"', result: "Kursi" };
        const rows = await readAssetImportFile("a.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
        expect(rows[0]?.data["nomor_seri"]).toBe("000001");
        expect(rows[0]?.data["dapat_dipinjam"]).toBe("true");
        expect(rows[1]?.error).toContain("formula");
    });
    it.each(["nama_barang\nKursi", `${ASSET_IMPORT_COLUMNS.join(",")},nama_barang\nKursi`, ASSET_IMPORT_COLUMNS.join(",")])("header hilang/duplikat atau tanpa data menolak seluruh berkas", async (csv) => {
        await expect(readAssetImportFile("a.csv", Buffer.from(csv))).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
    });
    it("XLSX rusak ditolak sebelum job dibuat", async () => {
        await expect(readAssetImportFile("a.xlsx", Buffer.from("rusak"))).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
    });
});
