import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import type { FineListQuery, LoanListQuery } from "@sigm4/schemas";
import { listLoans, listFines } from "./monitoring.service.js";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** FR-09.3 A2 / FR-09.4 A3: scope domain tetap berlaku meski pengguna berizin ekspor. */
export async function exportLoans(scope: TransactionScope, kind: "loans" | "fines", filter: LoanListQuery | FineListQuery, format: "xlsx" | "pdf", clock: Clock, audit: AuditLogger, pdf: PembangkitPdf) {
 if (!scope.ctx.can(kind === "loans" ? "loan.view" : "fine.view")) throw new ForbiddenError();
 const title = kind === "loans" ? "Daftar Peminjaman" : "Denda dan Kewajiban", header = kind === "loans" ? ["Nomor", "Peminjam", "Jatuh tempo", "Status", "Estimasi denda"] : ["Peminjaman", "Peminjam", "Unit", "Jenis", "Status", "Jumlah", "Dibebaskan", "Sisa"];
 const rows: string[][] = []; let page = 1, pages: number;
 do {
  if (kind === "loans") { const result = await listLoans(scope, { ...filter, page, per_page: 100 } as LoanListQuery, clock); pages = result.meta.total_pages; rows.push(...result.data.map((l) => [l.nomor, l.peminjam.nama, l.tanggal_jatuh_tempo, l.status, l.estimasi_denda])); }
  else { const result = await listFines(scope, { ...filter, page, per_page: 100 } as FineListQuery); pages = result.meta.total_pages; rows.push(...result.data.map((f) => [f.nomor_peminjaman, f.peminjam.nama, f.kode_barang, f.jenis, f.status, f.jumlah ?? "Menunggu penetapan", f.jumlah_dibebaskan, f.sisa ?? "Belum ditetapkan"])); }
  page += 1;
 } while (page <= pages);
 let bytes: Buffer;
 if (format === "xlsx") { const { default: ExcelJS } = await import("exceljs"), book = new ExcelJS.Workbook(), sheet = book.addWorksheet(title); sheet.addRow([title]); sheet.addRow(["Waktu cetak WIB", clock.now().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })]); sheet.addRow(header); for (const row of rows) sheet.addRow(row); sheet.columns.forEach((c) => { c.width = 27; }); bytes = Buffer.from(await book.xlsx.writeBuffer()); }
 else bytes = await pdf.render(`<!doctype html><html lang="id"><meta charset="utf-8"><title>${title}</title><style>@page{size:A4 landscape;margin:15mm}body{font:10pt Arial}table{width:100%;border-collapse:collapse}th,td{border:1px solid #555;padding:5px;text-align:left}tr{break-inside:avoid}</style><h1>${title}</h1><p>Dicetak ${escape(clock.now().toISOString())}</p><table><thead><tr>${header.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></html>`);
 await audit.write(scope, { modul: "m09-loans", aksi: "DATA_EXPORTED", entitas: kind, nilaiSesudah: { filter, format, jumlah_baris: rows.length } });
 return bytes;
}
