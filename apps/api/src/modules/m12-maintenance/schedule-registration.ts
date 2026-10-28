import { sql } from "kysely";
import { sumberLinimasaAset } from "../m04-assets/index.js";
import type { SumberLinimasaAset } from "../m04-assets/index.js";
const skipped: SumberLinimasaAset = {
    jenis: "PREVENTIF_DILEWATI",
    fragmen: (ctx, assetId) => {
        // scopeOf melempar bila permission tidak dipegang; tanpa can() lebih dulu, linimasa aset
        // (FR-04.2) gagal 500 bagi siapa pun tanpa workorder.view (PM-02).
        if (!ctx.can("maintenance.manage") && !(ctx.can("workorder.view") && ctx.scopeOf("workorder.view") === "all")) return null;
        return sql`SELECT k.id::text AS id,k.created_at AS waktu,jsonb_build_object('schedule_id',k.schedule_id::text,'nama',s.nama,'jatuh_tempo',to_char(k.jatuh_tempo,'YYYY-MM-DD'),'alasan',k.alasan) AS data FROM maintenance_schedule_skips k JOIN maintenance_schedules s ON s.id=k.schedule_id WHERE k.asset_id=${assetId}`;
    },
};
export function registerPreventiveSkipTimeline() {
    if (!sumberLinimasaAset.cari(skipped.jenis)) sumberLinimasaAset.daftar(skipped);
}
