import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import ExcelJS from "exceljs";
import { z } from "zod";
import { StocktakeSessionSchema, StocktakeItemSchema, StocktakeNewFindingSchema,MaterialStocktakeItemSchema } from "@sigm4/schemas";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { publish } from "../../../shared/events/index.js";
import { registerStocktakePdf } from "../../m06-documents/index.js";
import { invalid, lockSession } from "../access.js";
import { createStocktakeRepository } from "../repositories/stocktake.repository.js";

export const AUDIT_REPORT_JOB = "stocktake-report-generate";
export const ReportSnapshotSchema = z.object({ session: StocktakeSessionSchema, approver: z.string(), items: z.array(StocktakeItemSchema), findings: z.array(StocktakeNewFindingSchema),materials:z.array(MaterialStocktakeItemSchema).default([]) });
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function stocktakeReportHtml(value: unknown) {
    const report = ReportSnapshotSchema.parse(value), s = report.session;
    if(s.domain==="BAHAN")return materialReportHtml(report);
    return `<!doctype html><html lang="id"><meta charset="utf-8"><title>Berita Acara ${escape(s.nomor)}</title><style>@page{size:A4;margin:18mm}body{font:11px Arial;color:#17252a}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #b6c2c4;padding:5px;vertical-align:top;word-break:break-word}thead{display:table-header-group}tr{break-inside:avoid}</style><h1>Berita Acara Stock Opname</h1><p>${escape(s.nomor)} · ${escape(s.nama)}</p><p>Periode: ${escape(s.periode_mulai)}–${escape(s.periode_selesai)} (WIB)</p><p>Pelaksana: ${s.pelaksana.map(p => escape(p.nama)).join(", ")}</p><p>Disetujui: ${escape(report.approver)} · ${escape(s.disetujui_pada)}</p><p>Target ${s.target}; diperiksa ${s.diperiksa}; selisih ${s.selisih}; temuan baru ${s.temuan_baru}.</p><table><thead><tr><th>Kode / aset</th><th>Lokasi / kondisi snapshot</th><th>Hasil pemeriksaan</th><th>Tindakan / keterangan</th></tr></thead><tbody>${report.items.map(i => `<tr><td>${escape(i.kode_barang)}<br>${escape(i.nama)}</td><td>${escape(i.lokasi_sistem)}<br>${escape(i.kondisi_sistem)}</td><td>${escape(i.hasil)}<br>Lokasi: ${escape(i.lokasi_aktual)}; kondisi: ${escape(i.kondisi_aktual)}</td><td>${escape(i.tindakan)}<br>${escape(i.keterangan)}</td></tr>`).join("")}</tbody></table><h2>Temuan baru</h2>${report.findings.map(f => `<p>${escape(f.pendaftaran?.nama ?? f.deskripsi)} · aset terdaftar ${escape(f.asset_id_hasil)} · ${escape(f.keterangan)}</p>`).join("")}<p>Dokumen ini menggunakan hasil yang dibekukan saat persetujuan sesi.</p></html>`;
}
function materialReportHtml(r:z.output<typeof ReportSnapshotSchema>){const s=r.session;return `<!doctype html><html lang="id"><meta charset="utf-8"><title>Berita Acara ${escape(s.nomor)}</title><style>@page{size:A4;margin:18mm}body{font:11px Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:5px}thead{display:table-header-group}tr{break-inside:avoid}</style><h1>Berita Acara Stock Opname Bahan</h1><p>${escape(s.nomor)} · ${escape(s.nama)}</p><p>Periode ${escape(s.periode_mulai)}–${escape(s.periode_selesai)} (WIB)</p><p>Pelaksana: ${s.pelaksana.map(p=>escape(p.nama)).join(", ")}</p><p>Penyetuju: ${escape(r.approver)} · ${escape(s.disetujui_pada)}</p><p>${s.target} pasangan bahan/lokasi; ${s.diperiksa} dihitung; ${s.selisih} selisih.</p><table><thead><tr><th>Bahan / satuan</th><th>Lokasi</th><th>Saldo snapshot</th><th>Basis hitungan</th><th>Jumlah fisik</th><th>Penyesuaian OPNAME</th><th>Keterangan</th></tr></thead><tbody>${r.materials.map(i=>`<tr><td>${escape(i.nama)} / ${escape(i.satuan_simbol)}</td><td>${escape(i.lokasi)}</td><td>${i.saldo_sistem}</td><td>${i.basis_saldo}</td><td>${i.jumlah_fisik}</td><td>${i.selisih}</td><td>${escape(i.keterangan)}</td></tr>`).join("")}</tbody></table><p>Snapshot awal dan basis hitungan disimpan terpisah. Dokumen dibekukan saat persetujuan; saldo hanya berubah melalui ledger.</p></html>`;}
export class StocktakeReportService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly audit: AuditLogger, private readonly storage: PenyimpananObjek) {}
    async download(ctx: AuthContext, id: string) {
        await createStocktakeRepository(this.db).detail(ctx, id);
        return withTransaction(ctx, async scope => {
            const row = await lockSession(scope, id);
            if (row.status !== "SELESAI") throw invalid("Berita acara tersedia setelah sesi disetujui.");
            let url: string | null = null;
            if (row.report_status === "SIAP" && row.report_object_key && row.report_file_id) {
                url = await this.storage.urlUnduh(row.report_object_key, 300);
                await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_REPORT_EXPORTED", entitas: "audit_sessions", entitasId: id, nilaiSesudah: { format: "PDF", file_id: row.report_file_id } });
            }
            return { status: row.report_status, url, file_id: row.report_file_id };
        }, this.db);
    }
    async retry(scope: TransactionScope, id: string) {
        const row = await lockSession(scope, id);
        if (row.status !== "SELESAI" || row.report_status !== "GAGAL") throw invalid("Hanya berita acara gagal yang dapat dibuat ulang.");
        await scope.tx.updateTable("audit_sessions").set({ report_status: "MENUNGGU" }).where("id", "=", id).execute();
        await publish(scope, { name: "AuditReportRequested", aggregateType: "audit_session", aggregateId: id, payload: { session_id: Number(id) } });
        // Operasi tulis wajib tercatat dalam transaksi yang sama (AL-01).
        await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_REPORT_RETRY_REQUESTED", entitas: "audit_sessions", entitasId: id, nilaiSebelum: { report_status: "GAGAL" }, nilaiSesudah: { report_status: "MENUNGGU" } });
    }
    async run(ctx: AuthContext, id: string, pdf: PembangkitPdf, lastAttempt = false) {
        let objectKey: string | null = null, uploaded = false;
        try {
            await withTransaction(ctx, async scope => {
                const row = await lockSession(scope, id);
                if (row.status !== "SELESAI" || row.report_status === "SIAP") return;
                const report = ReportSnapshotSchema.parse(row.report_snapshot);
                const bytes = await pdf.render(stocktakeReportHtml(report));
                objectKey = `stocktake/${id}/${randomUUID()}.pdf`; uploaded = true;
                await this.storage.simpan(objectKey, bytes, "application/pdf");
                const fileId = await registerStocktakePdf(scope, this.audit, this.clock, { objectKey, bytes, ownerId: id, creatorId: row.disetujui_oleh! });
                await scope.tx.updateTable("audit_sessions").set({ report_status: "SIAP", report_file_id: fileId, report_object_key: objectKey }).where("id", "=", id).execute();
                await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_REPORT_GENERATED", entitas: "audit_sessions", entitasId: id, nilaiSesudah: { file_id: fileId } });
            }, this.db);
        } catch (error) {
            if (uploaded && objectKey) await this.storage.hapus(objectKey);
            if (lastAttempt) await withTransaction(ctx, async scope => {
                const row = await lockSession(scope, id);
                if (row.report_status !== "SIAP") await scope.tx.updateTable("audit_sessions").set({ report_status: "GAGAL" }).where("id", "=", id).execute();
            }, this.db);
            throw error;
        }
    }
    async exportXlsx(ctx: AuthContext, id: string) {
        await createStocktakeRepository(this.db).detail(ctx, id);
        return withTransaction(ctx, async scope => {
            const row = await lockSession(scope, id);
            if (row.status !== "SELESAI") throw invalid("Ekspor resmi tersedia sesudah persetujuan.");
            const r = ReportSnapshotSchema.parse(row.report_snapshot), workbook = new ExcelJS.Workbook();
            workbook.creator = "SIGM4"; workbook.created = this.clock.now();
            const summary = workbook.addWorksheet("Sesi");
            summary.addRows([["Nomor", r.session.nomor], ["Nama", r.session.nama], ["Periode", `${r.session.periode_mulai}–${r.session.periode_selesai}`], ["Pelaksana", r.session.pelaksana.map(p => p.nama).join(", ")], ["Penyetuju", r.approver], ["Disetujui", r.session.disetujui_pada], ["Target", r.session.target], ["Selisih", r.session.selisih]]);
            if(r.session.domain==="BAHAN"){const materials=workbook.addWorksheet("Bahan");materials.addRow(["Bahan","Satuan","Lokasi","Saldo snapshot","Basis hitungan","Jumlah fisik","Penyesuaian OPNAME","Keterangan"]);for(const i of r.materials)materials.addRow([i.nama,i.satuan_simbol,i.lokasi,i.saldo_sistem,i.basis_saldo,i.jumlah_fisik,i.selisih,i.keterangan]);}
            else {const sheet = workbook.addWorksheet("Aset", { views: [{ state: "frozen", ySplit: 1 }] });
            sheet.addRow(["Kode", "Nama", "Lokasi snapshot", "Kondisi snapshot", "Hasil", "Lokasi aktual", "Kondisi aktual", "Tindakan", "Keterangan"]);
            for (const i of r.items) sheet.addRow([i.kode_barang, i.nama, i.lokasi_sistem, i.kondisi_sistem, i.hasil, i.lokasi_aktual, i.kondisi_aktual, i.tindakan, i.keterangan]);
            const findings = workbook.addWorksheet("Temuan Baru"); findings.addRow(["Nama", "Keterangan", "Aset hasil"]);
            for (const f of r.findings) findings.addRow([f.pendaftaran?.nama ?? f.deskripsi, f.keterangan, f.asset_id_hasil]);
            }
            for (const s of workbook.worksheets) { s.columns.forEach(c => { c.width = 24; }); s.getRow(1).font = { bold: true }; }
            const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
            await this.audit.write(scope, { modul: "m13-audit-stocktake", aksi: "AUDIT_REPORT_EXPORTED", entitas: "audit_sessions", entitasId: id, nilaiSesudah: { format: "XLSX" } });
            return { bytes, filename: `${row.nomor}.xlsx` };
        }, this.db);
    }
}
