import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { ROOM_SCHEDULE_IMPORT_COLUMNS, ROOM_SCHEDULE_IMPORT_MAX_BYTES } from "@sigm4/schemas";
import { DomainError } from "../../../shared/errors/index.js";
import { detectCsvDelimiter } from "../../../shared/import/index.js";

export interface RawScheduleRow { readonly number: number; readonly data: Readonly<Record<string, string>> }
export async function readRoomScheduleFile(filename: string, buffer: Buffer): Promise<readonly RawScheduleRow[]> {
    if (!/\.csv$/i.test(filename) || buffer.length > ROOM_SCHEDULE_IMPORT_MAX_BYTES) throw new DomainError("INVALID_REQUEST", "Pilih CSV maksimal 6 MB.");
    let source: string;
    try { source = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
    catch { throw new DomainError("INVALID_REQUEST", "CSV harus memakai encoding UTF-8."); }
    const workbook = new ExcelJS.Workbook();
    let sheet: ExcelJS.Worksheet;
    try { sheet = await workbook.csv.read(Readable.from([source]), { parserOptions: { delimiter: detectCsvDelimiter(buffer) }, map: (v: string) => v }); }
    catch { throw new DomainError("INVALID_REQUEST", "Berkas CSV tidak dapat dibaca."); }
    const columns = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, i) => {
        const name = cell.text.trim().toLowerCase().replace(/^\uFEFF/, "");
        if (!name) return;
        if (columns.has(name)) throw new DomainError("INVALID_REQUEST", `Header kolom duplikat: ${name}.`);
        columns.set(name, i);
    });
    const missing = ROOM_SCHEDULE_IMPORT_COLUMNS.filter(c => !columns.has(c));
    if (missing.length) throw new DomainError("INVALID_REQUEST", `Kolom wajib hilang pada header: ${missing.join(", ")}.`);
    const rows: RawScheduleRow[] = [];
    sheet.eachRow((row, number) => {
        if (number === 1) return;
        const data = Object.fromEntries(ROOM_SCHEDULE_IMPORT_COLUMNS.map(c => [c, row.getCell(columns.get(c)!).text.trim()]));
        if (Object.values(data).some(Boolean)) rows.push({ number, data });
    });
    if (!rows.length) throw new DomainError("INVALID_REQUEST", "Berkas impor tidak memiliki baris data.");
    return rows;
}
const cell = (s: string) => `"${(/^\s*[=+\-@]/.test(s) ? "'" + s : s).replaceAll('"', '""')}"`;
export function roomScheduleTemplate(code: string, start: string, end: string): Buffer {
    return Buffer.from("\uFEFF" + [ROOM_SCHEDULE_IMPORT_COLUMNS.join(","), [code, "Senin", "07:00", "08:00", "KBM Kelas", start, end].map(cell).join(",")].join("\r\n"), "utf8");
}
