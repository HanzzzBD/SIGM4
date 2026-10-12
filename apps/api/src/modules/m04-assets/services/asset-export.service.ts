import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import type { z } from "zod";
import { LABEL_KONDISI_ASET, LABEL_STATUS_ASET } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Database } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError } from "../../../shared/errors/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import { createAssetRepository } from "../repositories/asset.repository.js";
import type { AssetExportQuerySchema } from "../schemas/asset.schema.js";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const BASE = [
    ["kode_barang", "Kode aset"], ["nama", "Nama"], ["kategori_nama", "Kategori"], ["gedung_nama", "Gedung"], ["ruang_nama", "Ruangan"],
    ["merek", "Merek"], ["model", "Model"], ["nomor_seri", "Nomor seri"], ["tahun_perolehan", "Tahun perolehan"],
    ["kondisi", "Kondisi"], ["status", "Status"], ["dapat_dipinjam", "Dapat dipinjam"], ["qr_terpasang", "QR terpasang"],
] as const;
const MONEY = [["sumber_perolehan", "Sumber perolehan"], ["nilai_perolehan", "Nilai perolehan (Rp)"]] as const;
function cell(key: string, value: unknown): string | number {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean") return value ? "Ya" : "Tidak";
    if (key === "kondisi") return LABEL_KONDISI_ASET[value as keyof typeof LABEL_KONDISI_ASET] ?? String(value);
    if (key === "status") return LABEL_STATUS_ASET[value as keyof typeof LABEL_STATUS_ASET] ?? String(value);
    if (key === "sumber_perolehan") return ({ PEMBELIAN: "Pembelian", HIBAH: "Hibah", BANTUAN_PEMERINTAH: "Bantuan pemerintah", SUMBANGAN: "Sumbangan", LAINNYA: "Lainnya" } as Record<string, string>)[String(value)] ?? String(value);
    return typeof value === "number" && key === "tahun_perolehan" ? value : String(value);
}
export async function exportAssets(db: Kysely<Database>, audit: AuditLogger, clock: Clock, pdf: PembangkitPdf, ctx: AuthContext, filter: z.infer<typeof AssetExportQuerySchema>) {
    if (!ctx.can("report.export")) throw new ForbiddenError("INSUFFICIENT_PERMISSION");
    const financial = ctx.can("asset.view_financial") && ctx.scopeOf("asset.view_financial") !== "restricted" && ctx.scopeOf("report.export") !== "restricted" && (!ctx.can("asset.view") || ctx.scopeOf("asset.view") !== "restricted") && ctx.roleCode !== "R-07";
    return withTransaction(ctx, async (scope) => {
        const repo = createAssetRepository(scope.tx);
        const [user, rows] = await Promise.all([repo.exportPrinter(scope.ctx), repo.exportRows(scope.ctx, {
            sort: filter.sort, ...(filter.q === undefined ? {} : { q: filter.q }), ...(filter.kategori_id === undefined ? {} : { categoryId: filter.kategori_id }),
            ...(filter.lokasi_id === undefined ? {} : { roomId: filter.lokasi_id }), ...(filter.kondisi === undefined ? {} : { kondisi: filter.kondisi }),
            ...(filter.status === undefined ? {} : { status: filter.status }), ...(filter.tahun_perolehan === undefined ? {} : { tahunPerolehan: filter.tahun_perolehan }),
            ...(filter.dapat_dipinjam === undefined ? {} : { dapatDipinjam: filter.dapat_dipinjam }), ...(filter.qr_terpasang === undefined ? {} : { qrTerpasang: filter.qr_terpasang }),
            ...(filter.import_job_id === undefined ? {} : { importJobId: filter.import_job_id }),
        }, financial)]);
        const printed = clock.now().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB";
        const printer = `${user.nama} (ID ${ctx.userId})`;
        const columns: readonly (readonly [string, string])[] = financial ? [...BASE, ...MONEY] : BASE;
        const applied = Object.entries(filter).filter(([, value]) => value !== undefined);
        const labels: Record<string, string> = { q: "Pencarian", kategori_id: "Kategori", lokasi_id: "Ruangan", kondisi: "Kondisi", status: "Status", tahun_perolehan: "Tahun perolehan", dapat_dipinjam: "Dapat dipinjam", qr_terpasang: "QR terpasang", import_job_id: "Pekerjaan impor", sort: "Urutan" };
        const filters = applied.filter(([k]) => k !== "format").map(([key, value]) => {
            const order = String(value);
            const sortLabel = ({ kode_barang: "Kode aset", nama: "Nama", tahun_perolehan: "Tahun perolehan" } as Record<string, string>)[order.replace(/^-/, "")] ?? order;
            return `${labels[key] ?? key}: ${key === "sort" ? `${sortLabel} (${order.startsWith("-") ? "menurun" : "menaik"})` : cell(key, value)}`;
        }).join("; ") || "Tanpa saringan";
        const values = rows.map((row) => columns.map(([key]) => cell(key, row[key])));
        let buffer: Buffer;
        if (filter.format === "xlsx") {
            const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Inventaris aset");
            sheet.addRow(["Inventaris Aset"]); sheet.addRow(["Tanggal cetak", printed]); sheet.addRow(["Pencetak", printer]); sheet.addRow(["Saringan", filters]); sheet.addRow(["Jumlah aset", rows.length]); sheet.addRow(columns.map(([, label]) => label));
            for (const row of values) sheet.addRow(row);
            sheet.columns.forEach((column) => { column.width = 24; }); sheet.views = [{ state: "frozen", ySplit: 6 }];
            sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + rows.length, column: columns.length } };
            buffer = Buffer.from(await workbook.xlsx.writeBuffer());
        } else {
            buffer = await pdf.render(`<!doctype html><html lang="id"><meta charset="utf-8"><title>Inventaris Aset</title><style>@page{size:A4 landscape;margin:12mm}body{font:9pt Arial}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #555;padding:4px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}</style><h1>Inventaris Aset</h1><p>Tanggal cetak: ${escape(printed)}<br>Pencetak: ${escape(printer)}<br>Saringan: ${escape(filters)}<br>Jumlah aset: ${rows.length}</p><table><thead><tr>${columns.map(([, label]) => `<th>${escape(label)}</th>`).join("")}</tr></thead><tbody>${values.map((row) => `<tr>${row.map((value) => `<td>${escape(String(value))}</td>`).join("")}</tr>`).join("")}</tbody></table></html>`);
        }
        const recorded = await audit.write(scope, { modul: "m04-assets", aksi: "DATA_EXPORTED", entitas: "assets", nilaiSesudah: { filter: Object.fromEntries(applied), jumlah_baris: rows.length, kolom_finansial: financial } });
        if (!recorded) throw new DomainError("INTERNAL_ERROR");
        return buffer;
    }, db);
}
