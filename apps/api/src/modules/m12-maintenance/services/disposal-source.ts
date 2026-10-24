import { sql } from "kysely";
import type { QueryExecutor } from "../../../shared/db/index.js";
export function disposalCandidatePredicate(alias: string) {
    const id = sql.ref(`${alias}.id`), condition = sql.ref(`${alias}.kondisi`), value = sql.ref(`${alias}.nilai_perolehan`);
    return sql<boolean>`(${condition} IN ('RUSAK_BERAT','HILANG') OR EXISTS(SELECT 1 FROM work_orders w WHERE w.asset_id=${id} AND w.status='SELESAI' AND w.rekomendasi IS NOT NULL)
        OR COALESCE((SELECT sum(w.biaya) FROM work_orders w WHERE w.asset_id=${id}) > ${value} * (SELECT CASE WHEN jsonb_typeof(value)='number' THEN (value::text)::numeric ELSE NULL END FROM system_settings WHERE key='maintenance.ambang_penggantian_persen')/100,false))`;
}
/** Internal facts for M-21 eligibility/snapshot. Caller masks financial output using its own permission. */
export async function disposalMaintenanceFacts(db: QueryExecutor, assetId: string) {
    const result = await sql<{ cost: string; count: number; recommended: boolean; work_order_id: string | null }>`
        SELECT coalesce(sum(w.biaya),0)::text AS cost, count(w.id)::int AS count,
          coalesce(bool_or(w.status='SELESAI' AND w.rekomendasi IS NOT NULL),false)
          OR coalesce(coalesce(sum(w.biaya),0) > (SELECT a.nilai_perolehan FROM assets a WHERE a.id=${assetId}) *
            (SELECT CASE WHEN jsonb_typeof(value)='number' THEN (value::text)::numeric ELSE NULL END FROM system_settings WHERE key='maintenance.ambang_penggantian_persen')/100,false) AS recommended,
          (max(w.id) filter(where w.status='SELESAI' AND w.rekomendasi IS NOT NULL))::text AS work_order_id
        FROM work_orders w WHERE w.asset_id=${assetId}`.execute(db); return result.rows[0]!;
}
