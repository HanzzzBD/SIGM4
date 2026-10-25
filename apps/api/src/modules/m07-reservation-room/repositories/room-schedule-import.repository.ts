// Job milik pengunggah, termasuk pemegang scope all (M-07, PR-03-35).
import { sql } from "kysely";
import type { RoomScheduleImportFailure } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

const SUMMARY = ["id", "nama_berkas", "status", "total_baris", "baris_terproses", "sukses", "gagal", "laporan_gagal", "pesan_galat", "selesai_pada", "created_at", "created_by", "report_purged_at"] as const;
export class RoomScheduleImportRepository extends BaseRepository {
    constructor(executor: QueryExecutor) { super(executor); }
    async lockHash(ctx: AuthContext, hash: string): Promise<void> {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`room-schedule-import:${ctx.userId}:${hash}`}, 0))`.execute(this.query(ctx));
    }
    findReplay(ctx: AuthContext, hash: string, since: Date) {
        return this.query(ctx).selectFrom("room_schedule_import_jobs").select(SUMMARY).where("created_by", "=", String(ctx.userId)).where("file_hash", "=", hash).where("created_at", ">=", since).orderBy("id", "desc").executeTakeFirst();
    }
    insert(ctx: AuthContext, input: { hash: string; filename: string; total: number; content: Buffer; async: boolean; now: Date }) {
        return this.query(ctx).insertInto("room_schedule_import_jobs").values({ file_hash: input.hash, nama_berkas: input.filename, total_baris: input.total, berkas: input.content, status: input.async ? "MENUNGGU" : "BERJALAN", created_by: ctx.userId, created_at: input.now, updated_at: input.now }).returning(SUMMARY).executeTakeFirstOrThrow();
    }
    find(ctx: AuthContext, id: number, lock = false) {
        const query = this.query(ctx).selectFrom("room_schedule_import_jobs").select([...SUMMARY, "berkas"]).where("id", "=", String(id)).where("created_by", "=", String(ctx.userId));
        return (lock ? query.forUpdate() : query).executeTakeFirst();
    }
    async record(ctx: AuthContext, id: number, cursor: number, failure: RoomScheduleImportFailure | null): Promise<void> {
        await this.query(ctx).updateTable("room_schedule_import_jobs").set({ status: "BERJALAN", baris_terproses: cursor, sukses: sql`sukses + ${failure === null ? 1 : 0}`, gagal: sql`gagal + ${failure === null ? 0 : 1}`, ...(failure === null ? {} : { laporan_gagal: sql`laporan_gagal || ${JSON.stringify([failure])}::jsonb` }), updated_by: ctx.userId }).where("id", "=", String(id)).where("created_by", "=", String(ctx.userId)).executeTakeFirstOrThrow();
    }
    finish(ctx: AuthContext, id: number, now: Date, message: string | null) {
        return this.query(ctx).updateTable("room_schedule_import_jobs").set({ status: message === null ? "SELESAI" : "GAGAL", berkas: null, pesan_galat: message, selesai_pada: now, updated_by: ctx.userId }).where("id", "=", String(id)).where("created_by", "=", String(ctx.userId)).where("status", "in", ["MENUNGGU", "BERJALAN"]).returning(SUMMARY).executeTakeFirst();
    }
}
export type RoomScheduleImportJobRow = Awaited<ReturnType<RoomScheduleImportRepository["insert"]>>;
export const createRoomScheduleImportRepository = (executor: QueryExecutor) => defineRepository(new RoomScheduleImportRepository(executor));
