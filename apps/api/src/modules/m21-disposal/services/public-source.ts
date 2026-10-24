import { sql } from "kysely";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { SumberLinimasaAset } from "../../m04-assets/index.js";
import { createDisposalRepository } from "../repositories/disposal.repository.js";
export async function disposalNotificationSource(scope: TransactionScope, id: number) {
    const row = await createDisposalRepository(scope.tx).lock(scope.ctx, String(id)); return { nomor: row.nomor, pengusul_id: Number(row.pengusul_id), status: row.status };
}
export const disposalTimelineSource: SumberLinimasaAset = { jenis: "PENGHAPUSAN", fragmen: (ctx, assetId) => {
    if (!ctx.can("disposal.view")) return null;
    const visibility = ctx.scopeOf("disposal.view") === "all" ? sql`TRUE` : sql`d.pengusul_id=${ctx.userId}`;
    return sql`SELECT i.id::text||'-hapus' AS id,i.executed_at AS waktu,jsonb_build_object('disposal_id',d.id::text,'nomor',d.nomor,'aksi','DIEKSEKUSI','alasan',d.justifikasi) AS data FROM asset_disposal_items i JOIN asset_disposals d ON d.id=i.disposal_id WHERE i.asset_id=${assetId} AND i.executed_at IS NOT NULL AND ${visibility}
    UNION ALL SELECT i.id::text||'-pulih',i.reinstated_at,jsonb_build_object('disposal_id',d.id::text,'nomor',d.nomor,'aksi','DIPULIHKAN','alasan',i.reinstatement_reason) FROM asset_disposal_items i JOIN asset_disposals d ON d.id=i.disposal_id WHERE i.asset_id=${assetId} AND i.reinstated_at IS NOT NULL AND ${visibility}`;
} };
