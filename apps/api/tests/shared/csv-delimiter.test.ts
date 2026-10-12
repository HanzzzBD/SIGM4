import { describe, expect, it } from "vitest";
import { ASSET_IMPORT_COLUMNS } from "@sigm4/schemas";
import { detectCsvDelimiter } from "../../src/shared/import/index.js";
import { readAssetImportFile } from "../../src/modules/m04-assets/services/asset-import-file.js";
import { readUserImportFile } from "../../src/modules/m02-users/services/user-import.service.js";

const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
describe("PR-02-51: deteksi CSV pengguna dan aset", () => {
    it.each([",", ";"] as const)("membaca pengguna dengan pemisah %s, BOM, CRLF dan teks berkutip", async (delimiter) => {
        const header = ["nama_lengkap", "email", "nip_nis", "kode_role", "kode_unit_kerja", "telepon"];
        const values = ['Nama, dengan; "kutipan"\nbaris kedua', "guru@sekolah.sch.id", "00001234567890123456", "R-04", "0001", ""];
        const csv = `\uFEFF${header.map(quote).join(delimiter)}\r\n\r\n${values.map(quote).join(delimiter)}\r\n`;
        const rows = await readUserImportFile("PENGGUNA.CSV", Buffer.from(csv));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ nomor: 3, data: { nama_lengkap: values[0], nip_nis: values[2], kode_unit_kerja: "0001", telepon: undefined } });
    });
    it.each([",", ";"] as const)("membaca aset dengan pemisah %s tanpa mengubah seri atau angka desimal", async (delimiter) => {
        const data: Record<string, string> = { nama_barang: 'Kursi, kelas; "A"', kode_kategori: "KAT", kode_ruangan: "R1", tahun_perolehan: "2026", sumber_perolehan: "Pembelian", kondisi: "Baik", dapat_dipinjam: "true", boleh_dipinjam_siswa: "false", jumlah_unit: "1", nomor_seri: "00001234567890123456", nilai_perolehan: "12345.67" };
        const csv = `\uFEFF${ASSET_IMPORT_COLUMNS.map(quote).join(delimiter)}\n\n${ASSET_IMPORT_COLUMNS.map((name) => quote(data[name] ?? "")).join(delimiter)}`;
        const rows = await readAssetImportFile("ASET.CSV", Buffer.from(csv));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ number: 3, data: { nama_barang: data["nama_barang"], nomor_seri: data["nomor_seri"], nilai_perolehan: "12345.67", merek: undefined } });
    });
    it.each([
        ['"kolom,;\nberkutip";"dua"\n1,2,3,4', ";"],
        ['"kolom; dengan ""kutipan;""",dua\n1;2;3', ","],
        ["kolom", ","], ["", ","],
    ])("hanya membaca pemisah di luar kutipan pada header logis: %j", (csv, delimiter) => {
        expect(detectCsvDelimiter(Buffer.from(csv))).toBe(delimiter);
    });
    it.each([readAssetImportFile, readUserImportFile])("CSV rusak tetap ditolak sebelum job dibuat", async (read) => {
        await expect(read("a.csv", Buffer.from('"header tidak selesai;abc'))).rejects.toMatchObject({ kode: "INVALID_REQUEST" });
    });
});
