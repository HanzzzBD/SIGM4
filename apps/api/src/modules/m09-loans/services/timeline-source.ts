import { sql } from "kysely";
import { sumberLinimasaAset } from "../../m04-assets/index.js";
import type { SumberLinimasaAset } from "../../m04-assets/index.js";
const source: SumberLinimasaAset = {
    jenis: "PEMINJAMAN",
    fragmen: (ctx, assetId) => !ctx.can("loan.view") ? null : sql`
        SELECT i.id::text AS id,l.tanggal_pinjam AS waktu,
        jsonb_build_object('loan_id',l.id::text,'nomor',l.nomor,'status',l.status,'dikembalikan_pada',i.tanggal_kembali) AS data
        FROM loan_items i JOIN loans l ON l.id=i.loan_id
        WHERE i.asset_id=${assetId} ${ctx.scopeOf("loan.view") === "all" ? sql`` : sql`AND l.peminjam_id=${ctx.userId}`}`,
};
export function registerLoanTimeline() { if (!sumberLinimasaAset.cari(source.jenis)) sumberLinimasaAset.daftar(source); }
