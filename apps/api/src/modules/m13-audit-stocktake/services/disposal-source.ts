import { sql } from "kysely";
import type { QueryExecutor } from "../../../shared/db/index.js";
export async function disposalLossSession(db: QueryExecutor, assetId: string) {
    const row = await db.selectFrom("audit_items as i").innerJoin("audit_sessions as s", "s.id", "i.session_id").select("s.id").where("i.asset_id", "=", assetId).where("i.tindakan", "=", "HILANG").where("s.status", "=", "SELESAI")
        .where(sql<boolean>`s.id=(SELECT CASE WHEN h.referensi_jenis='audit_session' THEN h.referensi_id ELSE NULL END FROM asset_condition_history h WHERE h.asset_id=${assetId} AND h.kondisi_baru='HILANG' ORDER BY h.diubah_pada DESC,h.id DESC LIMIT 1)`)
        .orderBy("s.id", "desc").executeTakeFirst(); return row?.id ?? null;
}
