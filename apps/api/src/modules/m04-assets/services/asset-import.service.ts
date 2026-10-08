// PR-02-38, SDD-DB-24: aset + cursor + audit satu transaksi per baris.
import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { ASSET_IMPORT_SYNC_LIMIT, importAssetRowSchema } from "@sigm4/schemas";
import type { AssetImportFailure } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { createAssetImportRepository } from "../repositories/asset-import.repository.js";
import type { AssetImportJobRow } from "../repositories/asset-import.repository.js";
import { AssetService } from "./asset.service.js";
import { assetImportTemplate, readAssetImportFile } from "./asset-import-file.js";
import type { RawAssetImportRow } from "./asset-import-file.js";

export const EVENT_ASSET_IMPORT_REQUESTED = "AssetImportRequested";
export const EVENT_ASSET_IMPORT_COMPLETED = "AssetImportCompleted";
const terminal = (job: AssetImportJobRow) => job.status === "SELESAI" || job.status === "GAGAL";
const missing = () => new NotFoundError("Pekerjaan impor aset tidak ditemukan.");

export class AssetImportService {
    private readonly assets: AssetService;
    constructor(private readonly db: Kysely<Database>, private readonly audit: AuditLogger, private readonly clock: Clock) {
        this.assets = new AssetService(db, audit, clock);
    }
    private authorize(ctx: AuthContext): void {
        if (!ctx.can("asset.create")) throw new ForbiddenError();
    }
    private year(): number {
        return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Jakarta", year: "numeric" }).format(this.clock.now()));
    }
    async template(ctx: AuthContext): Promise<Buffer> {
        this.authorize(ctx);
        const masters = await createAssetImportRepository(this.db).masters(ctx);
        return assetImportTemplate(masters.categories.keys().next().value ?? "KODE_KATEGORI", masters.rooms.keys().next().value ?? "KODE_RUANGAN", this.year());
    }
    async get(ctx: AuthContext, id: number): Promise<AssetImportJobRow> {
        this.authorize(ctx);
        const job = await createAssetImportRepository(this.db).find(ctx, id);
        if (job === undefined) throw missing();
        return job;
    }
    async submit(ctx: AuthContext, input: { filename: string; contentBase64: string }): Promise<{ job: AssetImportJobRow; replay: boolean }> {
        this.authorize(ctx);
        const content = Buffer.from(input.contentBase64, "base64");
        const rows = await readAssetImportFile(input.filename, content);
        const hash = createHash("sha256").update(content).digest("hex");
        const async = rows.length > ASSET_IMPORT_SYNC_LIMIT;
        const accepted = await withTransaction(ctx, async (scope) => {
            const repo = createAssetImportRepository(scope.tx);
            await repo.lockHash(ctx, hash);
            const existing = await repo.findReplay(ctx, hash, new Date(this.clock.now().getTime() - 86_400_000));
            if (existing !== undefined) return { job: existing, replay: true };
            const job = await repo.insert(ctx, { hash, filename: input.filename, total: rows.length, content, async, now: this.clock.now() });
            await this.audit.write(scope, { modul: "m04-assets", aksi: "ASSET_IMPORT_REQUESTED", entitas: "asset_import_jobs", entitasId: job.id, nilaiSesudah: { total: job.total_baris, nama_berkas: job.nama_berkas, status: job.status } });
            if (async) await publish(scope, { name: EVENT_ASSET_IMPORT_REQUESTED, aggregateType: "AssetImportJob", aggregateId: job.id, payload: { job_id: job.id, oleh: ctx.userId } });
            return { job, replay: false };
        }, this.db);
        if (accepted.job.total_baris > ASSET_IMPORT_SYNC_LIMIT || terminal(accepted.job)) return accepted;
        // Unggah ulang juga dapat melanjutkan HTTP sinkron yang terputus.
        await this.process(ctx, accepted.job, rows);
        return { job: await this.get(ctx, Number(accepted.job.id)), replay: accepted.replay };
    }
    async run(ctx: AuthContext, id: number): Promise<void> {
        const job = await this.get(ctx, id);
        if (terminal(job)) return;
        const stored = await createAssetImportRepository(this.db).find(ctx, id);
        if (stored?.berkas === null || stored?.berkas === undefined) throw new Error("Isi berkas impor aset tidak tersedia.");
        await this.process(ctx, job, await readAssetImportFile(job.nama_berkas, stored.berkas));
    }
    async fail(ctx: AuthContext, id: number, message: string): Promise<void> { await this.finish(ctx, id, message); }

    private failure(row: RawAssetImportRow, message: string): AssetImportFailure {
        return { baris: row.number, nama_barang: row.data["nama_barang"] ?? null, pesan: message, data: Object.fromEntries(Object.entries(row.data).map(([key, value]) => [key, value ?? ""])) };
    }
    private async record(scope: TransactionScope, id: number, cursor: number, units: number, failure: AssetImportFailure | null): Promise<void> {
        await createAssetImportRepository(scope.tx).record(scope.ctx, id, cursor, units, failure);
        await this.audit.write(scope, { modul: "m04-assets", aksi: "ASSET_IMPORT_ROW_PROCESSED", entitas: "asset_import_jobs", entitasId: String(id), nilaiSesudah: { terproses: cursor, unit_dibuat: units, baris_gagal: failure?.baris ?? null, pesan: failure?.pesan ?? null } });
    }
    private async process(ctx: AuthContext, job: AssetImportJobRow, rows: readonly RawAssetImportRow[]): Promise<void> {
        const id = Number(job.id);
        const masters = await createAssetImportRepository(this.db).masters(ctx);
        const schema = importAssetRowSchema(this.year());
        for (let i = job.baris_terproses; i < rows.length; i += 1) {
            const row = rows[i];
            if (row === undefined) break;
            const parsed = schema.safeParse(row.data);
            let failure = row.error === undefined ? null : this.failure(row, row.error);
            if (!parsed.success) failure = this.failure(row, parsed.error.issues.map((issue) => issue.message).join("; "));
            try {
                await withTransaction(ctx, async (scope) => {
                    const current = await createAssetImportRepository(scope.tx).find(ctx, id, true);
                    if (current === undefined) throw missing();
                    if (terminal(current) || current.baris_terproses > i) return;
                    if (current.baris_terproses !== i) throw new Error("Cursor impor tidak berurutan.");
                    let units = 0;
                    if (parsed.success && failure === null) {
                        const v = parsed.data;
                        const categoryId = masters.categories.get(v.kode_kategori);
                        const roomId = masters.rooms.get(v.kode_ruangan);
                        if (categoryId === undefined) throw new DomainError("VALIDATION_ERROR", `Kode kategori tidak dikenal: ${v.kode_kategori}.`);
                        if (roomId === undefined) throw new DomainError("VALIDATION_ERROR", `Kode ruangan tidak dikenal atau nonaktif: ${v.kode_ruangan}.`);
                        const assets = await this.assets.daftarkan(ctx, { nama: v.nama_barang, categoryId, roomId, merek: v.merek ?? null, model: v.model ?? null, nomorSeri: v.nomor_seri ?? null, tahunPerolehan: v.tahun_perolehan, sumberPerolehan: v.sumber_perolehan, nilaiPerolehan: v.nilai_perolehan ?? null, kondisi: v.kondisi, dapatDipinjam: v.dapat_dipinjam, bolehDipinjamSiswa: v.boleh_dipinjam_siswa, jumlahUnit: v.jumlah_unit, penanggungJawabId: null, procurementId: null, importJobId: job.id }, scope);
                        units = assets.length;
                    }
                    await this.record(scope, id, i + 1, units, failure);
                }, this.db);
            } catch (error) {
                // Kesalahan sistem dicoba ulang; pelanggaran bisnis tidak menggagalkan berkas (IMPT-01).
                const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
                if (!(error instanceof DomainError) && !duplicate) throw error;
                const rowFailure = this.failure(row, duplicate ? "Nomor seri atau kode aset sudah digunakan." : (error as DomainError).message);
                await withTransaction(ctx, async (scope) => {
                    const current = await createAssetImportRepository(scope.tx).find(ctx, id, true);
                    if (current === undefined) throw missing();
                    if (!terminal(current) && current.baris_terproses === i) await this.record(scope, id, i + 1, 0, rowFailure);
                }, this.db);
            }
        }
        await this.finish(ctx, id, null);
    }
    private async finish(ctx: AuthContext, id: number, message: string | null): Promise<void> {
        await withTransaction(ctx, async (scope) => {
            const repo = createAssetImportRepository(scope.tx);
            const current = await repo.find(ctx, id, true);
            if (current === undefined) throw missing();
            if (terminal(current)) return;
            if (message === null && current.baris_terproses !== current.total_baris) return;
            const job = await repo.finish(ctx, id, this.clock.now(), message);
            if (job === undefined) return;
            const payload = { job_id: job.id, oleh: ctx.userId, status: job.status, total: job.total_baris, sukses: job.sukses, gagal: job.gagal, unit: job.unit_dibuat };
            await this.audit.write(scope, { modul: "m04-assets", aksi: "ASSET_IMPORTED", entitas: "asset_import_jobs", entitasId: job.id, nilaiSesudah: payload });
            if (job.total_baris > ASSET_IMPORT_SYNC_LIMIT) await publish(scope, { name: EVENT_ASSET_IMPORT_COMPLETED, aggregateType: "AssetImportJob", aggregateId: job.id, payload });
        }, this.db);
    }
}
