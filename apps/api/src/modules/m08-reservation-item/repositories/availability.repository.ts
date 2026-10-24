import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

class AvailabilityRepository extends BaseRepository {
    constructor(executor: QueryExecutor) { super(executor); }
    async eligible(ctx: AuthContext) {
        let query = this.query(ctx).selectFrom("assets as a").innerJoin("asset_categories as c", "c.id", "a.category_id")
            .select(["a.id", "a.kode_barang", "a.nama", "a.merek", "a.model", "a.kondisi", "c.id as category_id", "c.nama as category_name"])
            .where("a.dapat_dipinjam", "=", true).where("a.dihapuskan", "=", false)
            .where(e => e.not(e.exists(e.selectFrom("asset_disposal_claims as d").select("d.asset_id").whereRef("d.asset_id", "=", "a.id"))))
            .where("a.kondisi", "in", ["BAIK", "RUSAK_RINGAN"])
            // DIPINJAM/DIRESERVASI tidak menutup rentang mendatang (FR-08.1 AC).
            .where("a.status", "not in", ["DALAM_PERBAIKAN", "TIDAK_TERSEDIA"]);
        if (ctx.scopeOf("reservation.view") === "restricted") query = query.where("a.boleh_dipinjam_siswa", "=", true);
        return query.orderBy("a.id").execute();
    }
    async horizonDays(ctx: AuthContext) {
        const row = await this.query(ctx).selectFrom("system_settings").select("value").where("key", "=", "reservasi.horizon_hari").executeTakeFirst();
        if (typeof row?.value !== "number" || !Number.isInteger(row.value) || row.value <= 0) throw new Error("Pengaturan reservasi.horizon_hari tidak sah.");
        return row.value;
    }
    async photos(ctx: AuthContext, ids: readonly string[]) {
        if (ids.length === 0) return [];
        return this.query(ctx).selectFrom("asset_photos as p").innerJoin("stored_files as f", "f.id", "p.file_id")
            .select(["p.asset_id", "f.object_key", "f.thumb_key", "f.medium_key", "f.scan_status"])
            .where("p.asset_id", "in", [...ids]).where("f.owner_type", "=", "ASSET_PHOTO")
            .where("f.scan_status", "=", "CLEAN").where("f.checksum", "is not", null)
            .orderBy("p.is_primary", "desc").orderBy("p.urutan").orderBy("p.id").execute();
    }
}
export const createAvailabilityRepository = (db: QueryExecutor) => defineRepository(new AvailabilityRepository(db));
