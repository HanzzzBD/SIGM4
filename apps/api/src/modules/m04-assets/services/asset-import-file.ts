// CSV/XLSX E.5.1; nomor baris fisik dan teks nomor seri dipertahankan (IMPT-02).
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { ASSET_IMPORT_COLUMNS, ASSET_IMPORT_REQUIRED_COLUMNS } from "@sigm4/schemas";
import { DomainError } from "../../../shared/errors/index.js";

export interface RawAssetImportRow {
    readonly number: number;
    readonly data: Readonly<Record<string, string | undefined>>;
    readonly error?: string;
}
export async function readAssetImportFile(filename: string, buffer: Buffer): Promise<readonly RawAssetImportRow[]> {
    const workbook = new ExcelJS.Workbook();
    let sheet: ExcelJS.Worksheet;
    try {
        if (/\.csv$/i.test(filename)) sheet = await workbook.csv.read(Readable.from(buffer), { map: (v: string) => v === "" ? null : v });
        else {
            // @ts-expect-error exceljs@4.4.0 mendeklarasikan Buffer sebagai ArrayBuffer.
            await workbook.xlsx.load(buffer);
            const first = workbook.worksheets[0];
            if (first === undefined) throw new Error("Tidak ada sheet.");
            sheet = first;
        }
    } catch {
        throw new DomainError("INVALID_REQUEST", "Berkas tidak dapat dibaca sebagai CSV/XLSX.");
    }
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, index) => {
        const name = cell.text.trim().toLowerCase().replace(/^\uFEFF/, "");
        if (!name) return;
        if (columns.has(name)) throw new DomainError("INVALID_REQUEST", `Header kolom duplikat: ${name}.`);
        columns.set(name, index);
    });
    const missing = ASSET_IMPORT_REQUIRED_COLUMNS.filter((name) => !columns.has(name));
    if (missing.length) throw new DomainError("INVALID_REQUEST", `Kolom wajib hilang pada header: ${missing.join(", ")}.`);
    const rows: RawAssetImportRow[] = [];
    sheet.eachRow((row, number) => {
        if (number === 1) return;
        const data: Record<string, string | undefined> = {};
        let invalid = false;
        for (const name of ASSET_IMPORT_COLUMNS) {
            const index = columns.get(name);
            const value = index === undefined ? null : row.getCell(index).value;
            if (typeof value === "object" && value !== null) invalid = true; // Formula tidak dieksekusi/dipercaya.
            const text = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value).trim() : "";
            data[name] = text || undefined;
        }
        if (!invalid && Object.values(data).every((v) => v === undefined)) return;
        rows.push({ number, data, ...(invalid ? { error: "Sel formula, tanggal, atau objek tidak didukung; gunakan nilai teks." } : {}) });
    });
    if (rows.length === 0) throw new DomainError("INVALID_REQUEST", "Berkas impor tidak memiliki baris data.");
    return rows;
}

/** Contoh menggunakan kode master aktual; penjelasan ada di sheet terpisah (IMPT-05). */
export async function assetImportTemplate(categoryCode: string, roomCode: string, year: number): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Aset");
    sheet.addRow([...ASSET_IMPORT_COLUMNS]);
    sheet.addRow(["Kursi", categoryCode, "", "", "", String(year), "Pembelian", "", roomCode, "Baik", "true", "false", "1"]);
    sheet.columns.forEach((column) => { column.width = 24; column.numFmt = "@"; });
    const guide = workbook.addWorksheet("Petunjuk");
    guide.addRow(["Isi sheet Aset; satu baris menghasilkan jumlah_unit record. Gunakan kode kategori dan ruangan aktif dari master sekolah."]);
    guide.addRow(["Tahun: 1950–tahun berjalan. Kondisi: Baik/Rusak Ringan/Rusak Berat. Boolean: true/false."]);
    guide.addRow(["Sumber: Pembelian/Hibah/Bantuan Pemerintah/Sumbangan/Lainnya. Nilai: desimal tanpa pemisah ribuan; kosong diperbolehkan."]);
    guide.addRow(["Nomor seri hanya untuk jumlah_unit = 1; format sel sebagai teks untuk mempertahankan nol di depan."]);
    return Buffer.from(await workbook.xlsx.writeBuffer());
}
