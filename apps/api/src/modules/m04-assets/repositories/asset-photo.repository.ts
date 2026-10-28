import type { Kysely } from "kysely";
import type { Database } from "../../../shared/db/index.js";

export function createAssetPhotoRepository(db: Kysely<Database>) {
    const query = (id: number) => db.selectFrom("asset_photos as p").innerJoin("stored_files as f", "f.id", "p.file_id")
        .where("p.asset_id", "=", String(id)).where("f.owner_type", "=", "ASSET_PHOTO");
    return {
        async list(id: number, page: number, perPage: number) {
            const rows = await query(id).select(["p.id", "p.file_id", "p.urutan", "p.is_primary", "f.scan_status", "f.checksum", "f.object_key", "f.thumb_key", "f.medium_key"])
                .orderBy("p.is_primary", "desc").orderBy("p.urutan").orderBy("p.id").limit(perPage).offset((page - 1) * perPage).execute();
            const count = await query(id).select(db.fn.countAll<string>().as("total")).executeTakeFirstOrThrow();
            return { rows, total: Number(count.total) };
        },
    };
}
