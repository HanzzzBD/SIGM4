import { sql } from "kysely";
import type { AssetMovementSnapshot } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

class MovementDocumentRepository extends BaseRepository {
    constructor(executor: QueryExecutor) { super(executor); }
    async lockAssets(ctx: AuthContext, ids: readonly number[]): Promise<void> {
        await this.query(ctx).selectFrom("assets").select("id").where("id", "in", ids.map(String)).orderBy("id").forUpdate().execute();
    }
    async location(ctx: AuthContext, id: number) {
        return this.query(ctx).selectFrom("rooms").innerJoin("areas", "areas.id", "rooms.area_id")
            .innerJoin("buildings", "buildings.id", "areas.building_id")
            .select(["rooms.id", "rooms.nama", "rooms.kode", "areas.nama as area", "buildings.nama as gedung"])
            .where("rooms.id", "=", String(id)).executeTakeFirstOrThrow();
    }
    async person(ctx: AuthContext, id: number) {
        return this.query(ctx).selectFrom("users").select(["id", "nama", "status"]).where("id", "=", String(id)).executeTakeFirst();
    }
    async create(ctx: AuthContext, snapshot: AssetMovementSnapshot, objectKey: string): Promise<string> {
        const row = await this.query(ctx).insertInto("asset_movement_documents")
            .values({ snapshot: JSON.stringify(snapshot), object_key: objectKey, created_by: ctx.userId })
            .returning("id").executeTakeFirstOrThrow();
        return row.id;
    }
    async get(ctx: AuthContext, id: string, permission?: "asset_movement_document.view") {
        let query = this.query(ctx).selectFrom("asset_movement_documents").selectAll().where("id", "=", id);
        if (permission !== undefined) {
            const scope = ctx.scopeOf(permission);
            if (scope === "own") query = query.where("created_by", "=", String(ctx.userId));
            else if (scope !== "all") return undefined;
        }
        return query.executeTakeFirst();
    }
    async file(ctx: AuthContext, id: string) {
        return this.query(ctx).selectFrom("stored_files").select(["object_key", "scan_status"])
            .where("id", "=", id).where("owner_type", "=", "ASSET_MOVEMENT_DOCUMENT").executeTakeFirstOrThrow();
    }
    async start(ctx: AuthContext, id: string): Promise<boolean> {
        const result = await this.query(ctx).updateTable("asset_movement_documents").set({ status: "BERJALAN" })
            .where("id", "=", id).where("status", "=", "MENUNGGU").executeTakeFirst();
        return result.numUpdatedRows > 0n;
    }
    async finish(ctx: AuthContext, id: string, now: Date, result: { fileId: string } | { error: string }): Promise<void> {
        await this.query(ctx).updateTable("asset_movement_documents")
            .set({ ...("fileId" in result ? { status: "SIAP" as const, file_id: result.fileId } : { status: "GAGAL" as const, pesan_galat: result.error }), selesai_pada: now })
            .where("id", "=", id).execute();
    }
    /** Session lock: pemanggil mempertahankan satu koneksi hingga unlock. */
    async lockWorker(ctx: AuthContext, id: string): Promise<void> {
        await sql`select pg_advisory_lock(hashtextextended(${`asset-movement-document:${id}`}, 0))`.execute(this.query(ctx));
    }
    async unlockWorker(ctx: AuthContext, id: string): Promise<void> {
        await sql`select pg_advisory_unlock(hashtextextended(${`asset-movement-document:${id}`}, 0))`.execute(this.query(ctx));
    }
}
export const movementDocumentRepository = (executor: QueryExecutor) => defineRepository(new MovementDocumentRepository(executor));
