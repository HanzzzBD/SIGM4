import { randomUUID } from "node:crypto";
import { z } from "zod";
import ExcelJS from "exceljs";
import type { Kysely } from "kysely";
import { DisposalDetailSchema } from "@sigm4/schemas";
import type { DisposalQuerySchema } from "@sigm4/schemas";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import { publish } from "../../../shared/events/index.js";
import { registerDisposalPdf } from "../../m06-documents/index.js";
import { createDisposalRepository } from "../repositories/disposal.repository.js";
import { invalid } from "../access.js";
export const DISPOSAL_REPORT_JOB = "asset-disposal-report-generate";
const Report = DisposalDetailSchema.extend({ penyetuju: z.string() });
const escaped = (v: unknown) => String(v ?? "—").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function html(value: z.infer<typeof Report>, financial: boolean) {
    return `<!doctype html><html lang="id"><meta charset="utf-8"><title>${escaped(value.nomor)}</title><style>@page{size:A4;margin:18mm}body{font:11px Arial;color:#17252a}h1{font-size:20px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #b6c2c4;padding:5px;word-break:break-word}tr{break-inside:avoid}thead{display:table-header-group}</style><h1>Berita Acara Penghapusan Aset</h1><p>${escaped(value.nomor)}</p><p>Alasan: ${escaped(value.alasan)}. ${escaped(value.justifikasi)}</p><p>Tanggal pelaksanaan (WIB): ${escaped(value.tanggal_pelaksanaan)}<br>Tindak lanjut aktual: ${escaped(value.tindak_lanjut_fisik)}<br>Penyetuju: ${escaped(value.penyetuju)}<br>Pelaksana: ${escaped(value.pelaksana)}<br>Saksi: ${value.saksi!.map(escaped).join(", ")}</p><table><thead><tr><th>Kode / UUID</th><th>Aset / lokasi terakhir</th><th>Kondisi / tahun</th>${financial ? "<th>Nilai perolehan</th>" : ""}</tr></thead><tbody>${value.items.filter(i => i.executed_at).map(i => `<tr><td>${escaped(i.snapshot.kode_barang)}<br>${escaped(i.snapshot.uuid)}</td><td>${escaped(i.snapshot.nama)}<br>${escaped(i.snapshot.lokasi)}</td><td>${escaped(i.snapshot.kondisi)}<br>${i.snapshot.tahun_perolehan}</td>${financial ? `<td>${escaped(i.snapshot.nilai_perolehan)}</td>` : ""}</tr>`).join("")}</tbody></table><p>${escaped(value.catatan)}</p><p>Hasil ini dibekukan pada pelaksanaan; pemulihan aset berikutnya tidak mengubah berita acara ini.</p></html>`;
}
export class DisposalReportService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly audit: AuditLogger, private readonly storage: PenyimpananObjek) {}
    async run(ctx: AuthContext, id: string, renderer: PembangkitPdf, lastAttempt = false) {
        const uploaded: string[] = [];
        try { await withTransaction(ctx, async scope => {
            const row = await createDisposalRepository(scope.tx).lock(scope.ctx, id); if (row.status !== "SELESAI" || row.report_status === "SIAP") return;
            const report = Report.parse(row.report_snapshot);
            const outputs: { key: string; id: string }[] = [];
            for (const financial of [true, false]) { const bytes = await renderer.render(html(report, financial)), key = `disposal/${id}/${randomUUID()}.pdf`; uploaded.push(key); await this.storage.simpan(key, bytes, "application/pdf"); const fileId = await registerDisposalPdf(scope, this.audit, this.clock, { bytes, objectKey: key, ownerId: id, creatorId: row.dilaksanakan_oleh! }); outputs.push({ key, id: fileId }); }
            await scope.tx.updateTable("asset_disposals").set({ report_status: "SIAP", report_file_id: outputs[0]!.id, report_object_key: outputs[0]!.key, report_redacted_file_id: outputs[1]!.id, report_redacted_object_key: outputs[1]!.key }).where("id", "=", id).execute();
            await publish(scope, { name: "AssetDisposalExecuted", aggregateType: "asset_disposal", aggregateId: id, payload: { disposal_id: Number(id), pengusul_id: Number(row.pengusul_id), n: report.items.filter(i => i.executed_at).length } });
        }, this.db); } catch (error) { for (const key of uploaded) await this.storage.hapus(key); if (lastAttempt) await withTransaction(ctx, async scope => { const row = await createDisposalRepository(scope.tx).lock(scope.ctx, id); if (row.report_status !== "SIAP") await scope.tx.updateTable("asset_disposals").set({ report_status: "GAGAL" }).where("id", "=", id).execute(); }, this.db); throw error; }
    }
    async retry(scope: TransactionScope, id: string) { const row = await createDisposalRepository(scope.tx).lock(scope.ctx, id); if (row.status !== "SELESAI" || row.report_status !== "GAGAL") throw invalid("Hanya berita acara gagal yang dapat diulang."); await scope.tx.updateTable("asset_disposals").set({ report_status: "MENUNGGU" }).where("id", "=", id).execute(); await publish(scope, { name: "AssetDisposalReportRequested", aggregateType: "asset_disposal", aggregateId: id, payload: { disposal_id: Number(id) } }); await this.audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_REPORT_RETRY_REQUESTED", entitas: "asset_disposals", entitasId: id, nilaiSebelum: { report_status: "GAGAL" }, nilaiSesudah: { report_status: "MENUNGGU" } }); /* AL-01 */ }
    async download(ctx: AuthContext, id: string) {
        return withTransaction(ctx, async scope => { const row = await createDisposalRepository(scope.tx).lock(ctx, id); if (row.status !== "SELESAI") throw invalid("Berita acara tersedia setelah pelaksanaan."); const financial = ctx.can("asset.view_financial"), key = financial ? row.report_object_key : row.report_redacted_object_key, fileId = financial ? row.report_file_id : row.report_redacted_file_id;
            const url = row.report_status === "SIAP" && key && fileId ? await this.storage.urlUnduh(key, 300) : null;
            if (url) await this.audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_EXPORTED", entitas: "asset_disposals", entitasId: id, nilaiSesudah: { format: "PDF", file_id: fileId, finansial: financial } }); return { status: row.report_status, url, file_id: fileId };
        }, this.db);
    }
    async export(ctx: AuthContext, query: z.infer<typeof DisposalQuerySchema>, format: "XLSX" | "PDF", renderer: PembangkitPdf) {
        return withTransaction(ctx, async scope => {
            const repo = createDisposalRepository(scope.tx), reports: z.infer<typeof Report>[] = [];
            for (let page = 1; ; page++) { const result = await repo.list(ctx, { ...query, tab: "ARSIP", page, per_page: 100 }); for (const r of result.data) { const row = await repo.lock(ctx, r.id); reports.push(Report.parse(row.report_snapshot)); } if (page >= result.meta.total_pages) break; }
            const items = reports.flatMap(r => r.items.filter(i => i.executed_at).map(i => ({ report: r, item: i }))).filter(({ item: i, report: r }) => (!query.category_id || i.snapshot.category_id === String(query.category_id)) && (!query.room_id || i.snapshot.room_id === String(query.room_id)) && (!query.asset_id || i.asset_id === String(query.asset_id)) && (!query.q || `${i.snapshot.kode_barang} ${i.snapshot.nama} ${r.nomor}`.toLowerCase().includes(query.q.toLowerCase())));
            const financial = ctx.can("asset.view_financial"); let bytes: Buffer;
            const cents = items.reduce((sum, { item }) => { const [whole, fraction = ""] = item.snapshot.nilai_perolehan!.split("."); return sum + BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0")); }, 0n), total = `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
            if (format === "XLSX") { const workbook = new ExcelJS.Workbook(), summary = workbook.addWorksheet("Ringkasan"), sheet = workbook.addWorksheet("Arsip Penghapusan", { views: [{ state: "frozen", ySplit: 1 }] }); summary.addRows([["Unit", items.length], ["Nilai perolehan", financial ? total : null], ["Filter", JSON.stringify(query)]]);
                sheet.addRow(["Berita acara", "Tanggal", "Kode", "UUID", "Nama", "Kategori", "Lokasi terakhir", "Alasan", "Nilai perolehan", "Penyetuju", "Pelaksana", "Saksi"]);
                for (const { report: r, item: i } of items) sheet.addRow([r.nomor, r.tanggal_pelaksanaan, i.snapshot.kode_barang, i.snapshot.uuid, i.snapshot.nama, i.snapshot.kategori, i.snapshot.lokasi, r.alasan, financial ? i.snapshot.nilai_perolehan : null, r.penyetuju, r.pelaksana, r.saksi?.join(", ")]); sheet.columns.forEach(c => { c.width = 24; }); sheet.getRow(1).font = { bold: true }; bytes = Buffer.from(await workbook.xlsx.writeBuffer());
            } else { bytes = await renderer.render(`<!doctype html><html lang="id"><meta charset="utf-8"><style>@page{size:A4 landscape;margin:15mm}body{font:11px Arial}table{width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:5px}thead{display:table-header-group}</style><h1>Rekapitulasi Penghapusan Aset</h1><p>Unit: ${items.length}${financial ? `; nilai perolehan: ${escaped(total)}` : ""}</p><table><thead><tr><th>Berita acara / tanggal</th><th>Kode / aset</th><th>Lokasi / kategori</th><th>Alasan</th>${financial ? "<th>Nilai</th>" : ""}</tr></thead><tbody>${items.map(({ report: r, item: i }) => `<tr><td>${escaped(r.nomor)}<br>${escaped(r.tanggal_pelaksanaan)}</td><td>${escaped(i.snapshot.kode_barang)}<br>${escaped(i.snapshot.nama)}</td><td>${escaped(i.snapshot.lokasi)}<br>${escaped(i.snapshot.kategori)}</td><td>${escaped(r.alasan)}</td>${financial ? `<td>${escaped(i.snapshot.nilai_perolehan)}</td>` : ""}</tr>`).join("")}</tbody></table></html>`); }
            await this.audit.write(scope, { modul: "m21-disposal", aksi: "ASSET_DISPOSAL_EXPORTED", entitas: "asset_disposals", nilaiSesudah: { format, filters: query, unit: items.length, finansial: financial } }); return { bytes, filename: `arsip-penghapusan-${query.tahun ?? "semua"}.${format.toLowerCase()}` };
        }, this.db);
    }
}
