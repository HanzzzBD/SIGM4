import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import type { z } from "zod";
import type { LocationExportQuerySchema } from "../schemas/location.schema.js";
import { createLocationRepository } from "../repositories/location.repository.js";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export async function exportLocation(db: Kysely<Database>, audit: AuditLogger, clock: Clock, pdf: PembangkitPdf, ctx: AuthContext, id: number, filter: z.infer<typeof LocationExportQuerySchema>) {
    // PM-01: tepat satu permission per endpoint — `report.export` (m03 §7).
    if (!ctx.can("report.export")) throw new ForbiddenError("INSUFFICIENT_PERMISSION");
    return withTransaction(ctx, async (scope) => {
        const repo = createLocationRepository(scope.tx);
        const location = await repo.exportIdentity(scope.ctx, id);
        if (location === undefined) throw new NotFoundError("Ruangan tidak ditemukan.");
        const [user, rows] = await Promise.all([repo.printer(scope.ctx), repo.exportAssets(scope.ctx, id, filter)]);
        const identity = `${location.gedung} / ${location.area} / ${location.nama} (${location.kode})`;
        const printed = clock.now().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
        const printer = `${user.nama} (ID ${ctx.userId})`;
        let buffer: Buffer;
        if (filter.format === "xlsx") {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet("Inventaris lokasi");
            sheet.addRow(["Inventaris lokasi", identity]);
            sheet.addRow(["Tanggal cetak", printed]);
            sheet.addRow(["Pencetak", printer]);
            sheet.addRow(["Kode aset", "Nama", "Kondisi", "Status"]);
            for (const row of rows) sheet.addRow([row.kode_barang, row.nama, row.kondisi, row.status]);
            sheet.columns.forEach((column) => { column.width = 30; });
            buffer = Buffer.from(await workbook.xlsx.writeBuffer());
        } else {
            buffer = await pdf.render(`<!doctype html><html lang="id"><meta charset="utf-8"><title>Inventaris lokasi</title><style>@page{size:A4;margin:18mm}body{font:11pt Arial}table{width:100%;border-collapse:collapse}td,th{border:1px solid #555;padding:6px;text-align:left}thead{display:table-header-group}tr{break-inside:avoid}</style><h1>Inventaris lokasi</h1><p>${escape(identity)}</p><p>Tanggal cetak: ${escape(printed)}<br>Pencetak: ${escape(printer)}</p><table><thead><tr><th>Kode aset</th><th>Nama</th><th>Kondisi</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr>${[r.kode_barang, r.nama, r.kondisi, r.status].map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></html>`);
        }
        const recorded = await audit.write(scope, { modul: "m03-locations", aksi: "DATA_EXPORTED", entitas: "rooms", entitasId: id, nilaiSesudah: { filter, jumlah_baris: rows.length } });
        if (!recorded) throw new DomainError("INTERNAL_ERROR");
        return buffer;
    }, db);
}
