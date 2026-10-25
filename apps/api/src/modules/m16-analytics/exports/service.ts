import { randomUUID } from "node:crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import { ReportExportSchema } from "@sigm4/schemas";
import type { AnalyticsType } from "@sigm4/schemas";
import type { AuthContext, SystemAuthContext } from "../../../shared/auth/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import type { PembangkitPdf } from "../../../shared/pdf/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { registerReportExportFile, detachReportExportFile } from "../../m06-documents/index.js";
import { reportLetterhead, reportSchoolName } from "../../m20-settings/index.js";
import { ANALYTICS_DEFINITIONS } from "../catalog.js";
import type { AnalyticsProviderRegistry } from "../registry.js";
import { exportRepository } from "../repositories/export.repository.js";
import { currentExportActor, authorizeExport, exportScopeHash } from "./authorization.js";
import { validateExportFilter, readExportDataset } from "./dataset.js";
import { EXPORT_LIMITS, EXPORT_REQUESTED, EXPORT_READY, wibTime } from "./model.js";
import { renderExport } from "./render.js";
import { assetExportAccess } from "../../m04-assets/index.js";
type JobRow = NonNullable<Awaited<ReturnType<ReturnType<typeof exportRepository>["get"]>>>;
export const exportDto = (r: JobRow, now: Date) => ReportExportSchema.parse({ id: r.id, jenis: r.jenis, judul: r.judul, format: r.format, status: r.status === "SIAP" && r.berlaku_sampai && r.berlaku_sampai <= now ? "KEDALUWARSA" : r.status, jumlah_baris: r.jumlah_baris, pesan_galat: r.pesan_galat, dibuat_pada: r.created_at.toISOString(), selesai_pada: r.selesai_pada?.toISOString() ?? null, berlaku_sampai: r.berlaku_sampai?.toISOString() ?? null });
export class ReportExportService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly audit: AuditLogger, private readonly storage: PenyimpananObjek, private readonly providers: AnalyticsProviderRegistry) {}
    async request(scope: TransactionScope, jenis: string, body: unknown) {
        if (isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
        const actor = await currentExportActor(scope.tx, scope.ctx, scope.ctx.userId), input = validateExportFilter(actor.ctx, jenis, body, this.clock, this.providers);
        if (input.format === "PDF" && !await reportSchoolName(scope)) throw new DomainError("VALIDATION_ERROR", "Isi Nama sekolah di Pengaturan sebelum ekspor PDF.");
        const judul = jenis === "assets" ? "Katalog Aset" : jenis === "reservations" ? "Daftar Reservasi" : jenis === "damage-reports" ? "Daftar Kerusakan" : ANALYTICS_DEFINITIONS[jenis as AnalyticsType].judul;
        // Freeze default periods when queued, including across WIB midnight and retries.
        let filter: unknown = input.filter;
        if (jenis !== "assets" && jenis !== "reservations" && jenis !== "damage-reports") { const { analyticsPeriods } = await import("../period.js"); const p = analyticsPeriods(this.clock, { ...input.filter, page: 1, per_page: 25 } as Parameters<typeof analyticsPeriods>[1], 1830).current; filter = { ...input.filter, tanggal_mulai: p.tanggal_mulai, tanggal_selesai: p.tanggal_selesai }; }
        const row = await exportRepository(scope.tx).create(actor.ctx, { jenis, judul, format: input.format, filter, accessHash: actor.hash, key: `report-exports/${actor.ctx.userId}/${randomUUID()}.${input.format.toLowerCase()}`, now: this.clock.now() });
        await this.audit.write(scope, { modul: jenis === "assets" ? "m04-assets" : "m16-analytics", aksi: jenis === "assets" ? "ASSET_EXPORT_REQUESTED" : "REPORT_EXPORT_REQUESTED", entitas: "report_exports", entitasId: row.id, nilaiSesudah: { jenis, format: input.format, filter } });
        await publish(scope, { name: EXPORT_REQUESTED, aggregateType: "report_export", aggregateId: row.id, payload: { export_id: row.id } });
        return exportDto(row, this.clock.now());
    }
    async list(ctx: AuthContext, jenis?: "assets") {
        if (isSystemAuthContext(ctx)) throw new ForbiddenError();
        const actor = await currentExportActor(this.db, ctx, ctx.userId);
        if (jenis === "assets") assetExportAccess(actor.ctx);
        else if (actor.ctx.roleCode === "R-07" || !actor.ctx.can("report.export") || !["all", "own"].includes(actor.ctx.scopeOf("report.export"))) throw new ForbiddenError();
        await exportRepository(this.db).cancelChangedAccess(ctx, actor.hash, this.clock.now());
        const rows = (await exportRepository(this.db).list(ctx, jenis)).filter(r => { try { authorizeExport(actor.ctx, r.jenis); return true; } catch (e) { if (e instanceof ForbiddenError) return false; throw e; } });
        // Counts belong to checked status/download, not unchecked historical row membership.
        return rows.map(r => actor.hash !== r.access_hash ? exportDto({ ...r, status: "DIBATALKAN", jumlah_baris: null, pesan_galat: "Izin berubah. Buat ekspor ulang." }, this.clock.now()) : exportDto({ ...r, jumlah_baris: null }, this.clock.now()));
    }
    async status(ctx: AuthContext, id: string, jenis?: "assets") { const row = await this.readable(ctx, id, jenis); return exportDto(row, this.clock.now()); }
    private async readable(ctx: AuthContext, id: string, jenis?: "assets") {
        if (isSystemAuthContext(ctx)) throw new ForbiddenError();
        const row = await exportRepository(this.db).get(ctx, id); if (!row || jenis !== undefined && row.jenis !== jenis) throw new NotFoundError();
        const actor = await currentExportActor(this.db, ctx, ctx.userId);
        if (actor.hash !== row.access_hash || row.scope_hash !== null && await exportScopeHash(this.db, actor.ctx, row.jenis) !== row.scope_hash) {
            await exportRepository(this.db).fail(ctx, id, "DIBATALKAN", "Izin atau cakupan berubah. Buat ekspor ulang.", this.clock.now());
            throw new DomainError("FORBIDDEN", "Izin atau cakupan berubah. Buat ekspor ulang.");
        }
        authorizeExport(actor.ctx, row.jenis);
        return row;
    }
    async download(ctx: AuthContext, id: string, jenis?: "assets") {
        const row = await this.readable(ctx, id, jenis);
        if (row.status !== "SIAP" || !row.berlaku_sampai || row.berlaku_sampai <= this.clock.now()) throw new DomainError("VALIDATION_ERROR", "File belum siap atau sudah kedaluwarsa. Buat ekspor ulang.");
        const ttl = Math.min(300, Math.floor((row.berlaku_sampai.getTime() - this.clock.now().getTime()) / 1000));
        if (ttl < 1) throw new DomainError("VALIDATION_ERROR", "File sudah kedaluwarsa.");
        return { url: await this.storage.urlUnduh(row.object_key, ttl, `${row.jenis}-${id}.${row.format.toLowerCase()}`), expires_at: new Date(this.clock.now().getTime() + ttl * 1000).toISOString(), nama_berkas: `${row.jenis}-${id}.${row.format.toLowerCase()}` };
    }
    async run(system: SystemAuthContext, id: string, pdf: PembangkitPdf, lastAttempt: boolean) {
        if (!isSystemAuthContext(system) || !/^\d+$/.test(id)) throw new ForbiddenError();
        await this.db.connection().execute(async connection => {
            const repo = exportRepository(connection); await repo.lock(system, id);
            try {
                const row = await repo.get(system, id); if (!row || !["MENUNGGU", "BERJALAN"].includes(row.status)) return;
                let uploaded = false;
                try {
                    const actor = await currentExportActor(connection, system, Number(row.requester_id));
                    authorizeExport(actor.ctx, row.jenis);
                    if (actor.hash !== row.access_hash) throw new ForbiddenError();
                    validateExportFilter(actor.ctx, row.jenis, { format: row.format, filter: row.filter }, this.clock, this.providers);
                    if (!await repo.start(system, id, this.clock.now())) return;
                    const prepared = await withTransaction(actor.ctx, async scope => {
                        await sql`set transaction read only`.execute(scope.tx);
                        const hash = await exportScopeHash(scope.tx, actor.ctx, row.jenis);
                        const data = await readExportDataset(scope, row.jenis, row.filter, EXPORT_LIMITS[row.format], this.clock, this.providers);
                        if (data.rows.length > EXPORT_LIMITS[row.format]) throw new DomainError("VALIDATION_ERROR", `Hasil melebihi ${EXPORT_LIMITS[row.format]} baris. Persempit filter dan ekspor ulang.`);
                        const school = await reportLetterhead(scope);
                        if (row.format === "PDF" && !await reportSchoolName(scope)) throw new DomainError("VALIDATION_ERROR", "Isi Nama sekolah di Pengaturan sebelum ekspor PDF.");
                        if (hash !== await exportScopeHash(scope.tx, actor.ctx, row.jenis)) throw new ForbiddenError();
                        return { data, hash, school };
                    }, connection);
                    const bytes = await renderExport(prepared.data, row.format, { school: prepared.school, title: row.judul, filter: row.filter, printedAt: wibTime(this.clock.now())!, printer: actor.name }, pdf);
                    uploaded = true; await this.storage.simpan(row.object_key, bytes, row.format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
                    await withTransaction(system, async scope => {
                        const latest = await currentExportActor(scope.tx, system, Number(row.requester_id));
                        if (latest.hash !== row.access_hash || prepared.hash !== await exportScopeHash(scope.tx, latest.ctx, row.jenis)) throw new ForbiddenError();
                        const fileId = await registerReportExportFile(scope, { id, ownerId: Number(row.requester_id), key: row.object_key, bytes, format: row.format, now: this.clock.now() });
                        await exportRepository(scope.tx).finish(system, id, { fileId, n: prepared.data.rows.length, hash: prepared.hash, now: this.clock.now() });
                        await this.audit.write({ ...scope, ctx: latest.ctx }, { modul: row.jenis === "assets" ? "m04-assets" : "m16-analytics", aksi: row.jenis === "assets" ? "ASSET_EXPORTED" : "REPORT_EXPORTED", entitas: "report_exports", entitasId: id, nilaiSesudah: { jenis: row.jenis, format: row.format, filter: row.filter, jumlah_baris: prepared.data.rows.length, file_id: fileId } });
                        await publish(scope, { name: EXPORT_READY, aggregateType: "report_export", aggregateId: id, payload: { export_id: id } });
                    }, connection);
                } catch (error) {
                    let cleanupError: unknown; if (uploaded) try { await this.storage.hapus(row.object_key); } catch (e) { cleanupError = e; }
                    const terminal = error instanceof ForbiddenError || error instanceof DomainError && error.kode === "VALIDATION_ERROR";
                    if (terminal || lastAttempt) await repo.fail(system, id, error instanceof ForbiddenError ? "DIBATALKAN" : "GAGAL", error instanceof ForbiddenError ? "Izin atau cakupan berubah. Buat ekspor ulang." : error instanceof DomainError && error.kode === "VALIDATION_ERROR" ? error.message : "Ekspor gagal dibuat. Silakan ajukan ekspor ulang.", this.clock.now());
                    if (cleanupError !== undefined) throw new AggregateError([error, cleanupError], "Ekspor dan kompensasi storage gagal.", { cause: error });
                    if (!terminal) throw error;
                }
            } finally { await repo.unlock(system, id); }
        });
    }
    async cleanup(ctx: SystemAuthContext) {
        if (!isSystemAuthContext(ctx)) throw new ForbiddenError();
        const rows = await exportRepository(this.db).cleanupCandidates(ctx, this.clock.now());
        for (const row of rows) await this.db.connection().execute(async connection => {
            const repo = exportRepository(connection); await repo.lock(ctx, row.id);
            try {
                const current = await repo.get(ctx, row.id); if (!current || current.object_removed_at || current.status === "SIAP" && current.berlaku_sampai! > this.clock.now()) return;
                await this.storage.hapus(current.object_key);
                await withTransaction(ctx, async scope => { if (current.file_id) await detachReportExportFile(scope, current.file_id); await exportRepository(scope.tx).cleaned(ctx, current.id, this.clock.now()); }, connection);
            } finally { await repo.unlock(ctx, row.id); }
        });
        return rows.length;
    }
}
export async function exportNotificationSource(scope: TransactionScope, id: string, clock: Clock) {
    if (!isSystemAuthContext(scope.ctx)) throw new ForbiddenError();
    const row = await exportRepository(scope.tx).get(scope.ctx, id);
    if (!row || row.status !== "SIAP" || !row.berlaku_sampai || row.berlaku_sampai <= clock.now()) return;
    return { id: Number(row.id), requesterId: Number(row.requester_id), title: row.judul, deepLink: row.jenis === "assets" ? `/aset?ekspor=${row.id}` : row.jenis === "reservations" ? `/reservasi?ekspor=${row.id}` : row.jenis === "damage-reports" ? `/kerusakan?ekspor=${row.id}` : `/analitik/${row.jenis}?ekspor=${row.id}` };
}
