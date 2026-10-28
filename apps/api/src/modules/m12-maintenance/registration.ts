import { sql } from "kysely";
import { sumberLinimasaAset } from "../m04-assets/index.js";
import type { SumberLinimasaAset } from "../m04-assets/index.js";
export const MAINTENANCE_TIMELINE:SumberLinimasaAset={jenis:"PEMELIHARAAN",fragmen:(ctx,assetId)=>{
 if(!ctx.can("workorder.view"))return null;
 const assigned=ctx.scopeOf("workorder.view")!=="all";
 return sql`SELECT w.id::text AS id,coalesce(w.diverifikasi_pada,w.created_at) AS waktu,jsonb_build_object('work_order_id',w.id::text,'nomor',w.nomor,'status',w.status,'jenis_pekerjaan',w.jenis,'biaya',${ctx.can("maintenance.view_cost")?(ctx.scopeOf("maintenance.view_cost")==="all"?sql`w.biaya::text`:sql`CASE WHEN w.teknisi_id=${String(ctx.userId)}::bigint THEN w.biaya::text ELSE null END`):sql`null`},'hasil',w.hasil) AS data FROM work_orders w WHERE w.asset_id=${assetId} ${assigned?sql`AND w.teknisi_id=${String(ctx.userId)}::bigint`:sql``}`;
}};
export function registerMaintenanceTimeline(){if(!sumberLinimasaAset.cari(MAINTENANCE_TIMELINE.jenis))sumberLinimasaAset.daftar(MAINTENANCE_TIMELINE);}
