import { createHash } from "node:crypto";
import type { Kysely } from "kysely";
import { ROOM_SCHEDULE_IMPORT_SYNC_LIMIT, RoomScheduleImportRowSchema } from "@sigm4/schemas";
import type { RoomScheduleImportFailure } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { Database, TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { importReportView } from "../../../shared/import/index.js";
import { idRuanganDariKode } from "../../m03-locations/index.js";
import { periodeAkademikAktif } from "../../m20-settings/index.js";
import { createBlockRepository } from "../repositories/block.repository.js";
import { createRoomScheduleImportRepository } from "../repositories/room-schedule-import.repository.js";
import type { RoomScheduleImportJobRow } from "../repositories/room-schedule-import.repository.js";
import type { BlockService } from "./block.service.js";
import { readRoomScheduleFile, roomScheduleTemplate } from "./room-schedule-import-file.js";
import type { RawScheduleRow } from "./room-schedule-import-file.js";
import { tanggalWib } from "./schedule.js";

export const EVENT_ROOM_SCHEDULE_IMPORT_REQUESTED = "RoomScheduleImportRequested";
export const EVENT_ROOM_SCHEDULE_IMPORT_COMPLETED = "RoomScheduleImportCompleted";
const terminal = (j: RoomScheduleImportJobRow) => j.status === "SELESAI" || j.status === "GAGAL";
const missing = () => new NotFoundError("Pekerjaan impor jadwal tetap tidak ditemukan.");

export class RoomScheduleImportService {
    constructor(private readonly db: Kysely<Database>, private readonly audit: AuditLogger, private readonly clock: Clock, private readonly blocks: BlockService) {}
    private authorize(ctx: AuthContext): void { if (!ctx.can("reservation.fixed_schedule")) throw new ForbiddenError(); }
    async template(ctx: AuthContext): Promise<Buffer> {
        this.authorize(ctx);
        return withTransaction(ctx, async scope => {
            const { tahunAjaran } = await periodeAkademikAktif(scope, tanggalWib(this.clock.now()));
            return roomScheduleTemplate("KODE_RUANGAN", tahunAjaran?.mulai ?? "YYYY-MM-DD", tahunAjaran?.akhir ?? "YYYY-MM-DD");
        }, this.db);
    }
    async get(ctx: AuthContext, id: number) {
        this.authorize(ctx);
        const job = await createRoomScheduleImportRepository(this.db).find(ctx, id);
        if (!job) throw missing();
        return this.report(job);
    }
    report(job: RoomScheduleImportJobRow) { return importReportView(job, this.clock.now()); }
    async submit(ctx: AuthContext, input: { filename: string; contentBase64: string }) {
        this.authorize(ctx);
        const content = Buffer.from(input.contentBase64, "base64");
        const rows = await readRoomScheduleFile(input.filename, content);
        const hash = createHash("sha256").update(content).digest("hex");
        const async = rows.length > ROOM_SCHEDULE_IMPORT_SYNC_LIMIT;
        const accepted = await withTransaction(ctx, async scope => {
            const repo = createRoomScheduleImportRepository(scope.tx);
            await repo.lockHash(ctx, hash);
            const existing = await repo.findReplay(ctx, hash, new Date(this.clock.now().getTime() - 86_400_000));
            if (existing) return { job: existing, replay: true };
            const job = await repo.insert(ctx, { hash, filename: input.filename, total: rows.length, content, async, now: this.clock.now() });
            await this.audit.write(scope, { modul: "m07-reservation-room", aksi: "ROOM_SCHEDULE_IMPORT_REQUESTED", entitas: "room_schedule_import_jobs", entitasId: job.id, nilaiSesudah: { total: job.total_baris, status: job.status } });
            if (async) await publish(scope, { name: EVENT_ROOM_SCHEDULE_IMPORT_REQUESTED, aggregateType: "RoomScheduleImportJob", aggregateId: job.id, payload: { job_id: job.id, oleh: ctx.userId } });
            return { job, replay: false };
        }, this.db);
        if (accepted.job.total_baris > ROOM_SCHEDULE_IMPORT_SYNC_LIMIT || terminal(accepted.job)) return accepted;
        await this.process(ctx, accepted.job, rows);
        return { job: await this.get(ctx, Number(accepted.job.id)), replay: accepted.replay };
    }
    async run(ctx: AuthContext, id: number): Promise<void> {
        const job = await this.get(ctx, id);
        if (terminal(job)) return;
        const stored = await createRoomScheduleImportRepository(this.db).find(ctx, id);
        if (!stored?.berkas) throw new Error("Isi CSV jadwal tetap tidak tersedia.");
        await this.process(ctx, job, await readRoomScheduleFile(job.nama_berkas, stored.berkas));
    }
    async fail(ctx: AuthContext, id: number, message: string): Promise<void> { await this.finish(ctx, id, message); }
    private failure(row: RawScheduleRow, message: string): RoomScheduleImportFailure { return { baris: row.number, kode_ruangan: row.data["kode_ruangan"] || null, pesan: message, data: row.data }; }
    private async record(scope: TransactionScope, id: number, cursor: number, failure: RoomScheduleImportFailure | null) {
        await createRoomScheduleImportRepository(scope.tx).record(scope.ctx, id, cursor, failure);
        await this.audit.write(scope, { modul: "m07-reservation-room", aksi: "ROOM_SCHEDULE_IMPORT_ROW_PROCESSED", entitas: "room_schedule_import_jobs", entitasId: String(id), nilaiSesudah: { terproses: cursor, baris_gagal: failure?.baris ?? null, pesan: failure?.pesan ?? null } });
    }
    private async process(ctx: AuthContext, job: RoomScheduleImportJobRow, rows: readonly RawScheduleRow[]): Promise<void> {
        const id = Number(job.id);
        for (let i = job.baris_terproses; i < rows.length; i++) {
            const row = rows[i]!;
            const parsed = RoomScheduleImportRowSchema.safeParse(row.data);
            try {
                await withTransaction(ctx, async scope => {
                    const current = await createRoomScheduleImportRepository(scope.tx).find(ctx, id, true);
                    if (!current) throw missing();
                    if (terminal(current) || current.baris_terproses > i) return;
                    if (current.baris_terproses !== i) throw new Error("Cursor impor tidak berurutan.");
                    if (!parsed.success) { await this.record(scope, id, i + 1, this.failure(row, parsed.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; "))); return; }
                    const v = parsed.data;
                    const room = await idRuanganDariKode(scope, v.kode_ruangan);
                    if (room === undefined) throw new DomainError("VALIDATION_ERROR", `Kode ruangan tidak dikenal: ${v.kode_ruangan}.`);
                    const repo = createBlockRepository(scope.tx);
                    await repo.kunciRuangan(ctx, room);
                    if (await repo.identik(ctx, room, v)) throw new DomainError("VALIDATION_ERROR", "Jadwal aktif identik sudah terdaftar (duplikat).");
                    await this.blocks.buat(ctx, room, { ...v, jenis: "JADWAL_TETAP", hari: [v.hari] }, undefined, scope);
                    await this.record(scope, id, i + 1, null);
                }, this.db);
            } catch (error) {
                const conflict = typeof error === "object" && error !== null && "code" in error && error.code === "23P01";
                if (!(error instanceof DomainError) && !conflict) throw error;
                const failure = this.failure(row, conflict ? "Jadwal bentrok dengan pemakaian ruangan lain." : (error as DomainError).message);
                await withTransaction(ctx, async scope => {
                    const current = await createRoomScheduleImportRepository(scope.tx).find(ctx, id, true);
                    if (!current) throw missing();
                    if (!terminal(current) && current.baris_terproses === i) await this.record(scope, id, i + 1, failure);
                }, this.db);
            }
        }
        await this.finish(ctx, id, null);
    }
    private async finish(ctx: AuthContext, id: number, message: string | null) {
        await withTransaction(ctx, async scope => {
            const repo = createRoomScheduleImportRepository(scope.tx);
            const current = await repo.find(ctx, id, true);
            if (!current) throw missing();
            if (terminal(current) || (message === null && current.baris_terproses !== current.total_baris)) return;
            const job = await repo.finish(ctx, id, this.clock.now(), message);
            if (!job) return;
            const payload = { job_id: job.id, oleh: ctx.userId, status: job.status, total: job.total_baris, sukses: job.sukses, gagal: job.gagal };
            await this.audit.write(scope, { modul: "m07-reservation-room", aksi: "ROOM_SCHEDULE_IMPORTED", entitas: "room_schedule_import_jobs", entitasId: job.id, nilaiSesudah: payload });
            if (job.total_baris > ROOM_SCHEDULE_IMPORT_SYNC_LIMIT) await publish(scope, { name: EVENT_ROOM_SCHEDULE_IMPORT_COMPLETED, aggregateType: "RoomScheduleImportJob", aggregateId: job.id, payload });
        }, this.db);
    }
}
