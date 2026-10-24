import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import type { ExportDataset } from "./model.js";
const escape = (value: unknown) => String(value ?? "—").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function renderExport(data: ExportDataset, format: "XLSX" | "PDF", header: { school: string[]; title: string; filter: unknown; printedAt: string; printer: string }, pdf: PembangkitPdf) {
    const headings = [...header.school, header.title, `Periode: ${data.period ?? "Sesuai filter daftar"}`, `Filter: ${JSON.stringify(header.filter)}`, `Dicetak: ${header.printedAt}`, `Pencetak: ${header.printer}`];
    if (format === "XLSX") {
        const { default: ExcelJS } = await import("exceljs"), book = new ExcelJS.Workbook(), sheet = book.addWorksheet("Data");
        // Primitive strings stay string cells, including text beginning =,+,-,@. No formulas/URLs are inferred.
        sheet.addRow(data.columns.map(c => c.label));
        for (const row of data.rows) sheet.addRow(data.columns.map(c => row[c.key] ?? null));
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.rows.length + 1, column: data.columns.length } };
        sheet.columns.forEach(c => { c.width = 25; });
        const metadata = book.addWorksheet("Keterangan"); headings.forEach(h => metadata.addRow([h]));
        if (data.summaryColumns) { metadata.addRow(["Ringkasan", "Periode utama", "Periode pembanding", "Selisih"]); for (const c of data.summaryColumns) {
            const current = data.summary?.[c.key] ?? null, previous = data.comparison?.summary[c.key] ?? null;
            // Decimal money remains exact string. Only native NUMBER deltas are computed here.
            metadata.addRow([c.label, current, previous, typeof current === "number" && typeof previous === "number" ? current - previous : null]);
        } }
        if (data.comparison) metadata.addRow(["Periode pembanding", data.comparison.period]);
        metadata.columns.forEach(c => { c.width = 35; });
        return Buffer.from(await book.xlsx.writeBuffer());
    }
    const summary = data.summaryColumns?.map(c => `<tr><th scope="row">${escape(c.label)}</th><td>${escape(data.summary?.[c.key])}</td><td>${escape(data.comparison?.summary[c.key])}</td></tr>`).join("") ?? "";
    return pdf.render(`<!doctype html><html lang="id"><meta charset="utf-8"><title>${escape(header.title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:9pt Arial;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #666;padding:4px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}h1{font-size:16pt}</style>${headings.map((h, i) => i === header.school.length ? `<h1>${escape(h)}</h1>` : `<p>${escape(h)}</p>`).join("")}${summary ? `<h2>Ringkasan${data.comparison ? ` dan pembanding (${escape(data.comparison.period)})` : ""}</h2><table><thead><tr><th>Indikator</th><th>Utama</th><th>Pembanding</th></tr></thead><tbody>${summary}</tbody></table>` : ""}<table><caption>${escape(header.title)} — ${data.rows.length} baris</caption><thead><tr>${data.columns.map(c => `<th scope="col">${escape(c.label)}</th>`).join("")}</tr></thead><tbody>${data.rows.map(r => `<tr>${data.columns.map(c => `<td>${escape(r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table></html>`);
}
