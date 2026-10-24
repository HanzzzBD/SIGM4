import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { sql } from "kysely";

class SubmissionRepository extends BaseRepository {
    constructor(db: QueryExecutor) { super(db); }
    async lockRequester(ctx: AuthContext) { await sql`SELECT pg_advisory_xact_lock(hashtext('reservasi-pemohon'), ${ctx.userId}::int)`.execute(this.query(ctx)); }
    async settings(ctx: AuthContext) {
        const rows = await this.query(ctx).selectFrom("system_settings").select(["key", "value"]).where("kelompok", "=", "RESERVASI").execute();
        return new Map(rows.map((r) => [r.key, r.value]));
    }
    async pending(ctx: AuthContext) { const row = await this.query(ctx).selectFrom("reservations").select((e) => e.fn.countAll<string>().as("n")).where("pemohon_id", "=", String(ctx.userId)).where("status", "=", "MENUNGGU_PERSETUJUAN").where("parent_id", "is", null).executeTakeFirstOrThrow(); return Number(row.n); }
    async candidates(ctx: AuthContext, categories: readonly number[], student: boolean) {
        let q = this.query(ctx).selectFrom("assets").select(["id", "category_id", "nilai_perolehan"])
            .where("category_id", "in", categories.map(String)).where("dapat_dipinjam", "=", true).where("dihapuskan", "=", false)
            .where("kondisi", "in", ["BAIK", "RUSAK_RINGAN"]).where("status", "not in", ["DALAM_PERBAIKAN", "TIDAK_TERSEDIA"]);
        if (student) q = q.where("boleh_dipinjam_siswa", "=", true);
        return q.orderBy("id").execute();
    }
    /** CI-02: seluruh kategori berjalan dalam satu urutan global asset_id menaik. */
    async lockNext(ctx: AuthContext, ids: readonly string[], after: string, student: boolean) {
        if (ids.length === 0) return undefined;
        return this.query(ctx).selectFrom("assets").select(["id", "category_id", "nilai_perolehan"])
            .where("id", "in", [...ids]).where("id", ">", after).where("dapat_dipinjam", "=", true).where("dihapuskan", "=", false)
            .where("kondisi", "in", ["BAIK", "RUSAK_RINGAN"]).where("status", "not in", ["DALAM_PERBAIKAN", "TIDAK_TERSEDIA"])
            .$if(student, (q) => q.where("boleh_dipinjam_siswa", "=", true))
            .orderBy("id").limit(1).forUpdate().skipLocked().executeTakeFirst();
    }
}
export const createSubmissionRepository = (db: QueryExecutor) => defineRepository(new SubmissionRepository(db));
