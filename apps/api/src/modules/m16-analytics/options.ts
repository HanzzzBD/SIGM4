import { sql } from "kysely";
import type { RawBuilder } from "kysely";
import type { AnalyticsType } from "@sigm4/schemas";
import type { AuthContext } from "../../shared/auth/index.js";
import type { QueryExecutor } from "../../shared/db/index.js";
import { authorizeAnalytics } from "./access.js";
/** Only dictionaries related to rows in the caller's intersected domain/report scopes. No separate settings permission. */
export async function analyticsFilterOptions(db: QueryExecutor, ctx: AuthContext, jenis: AnalyticsType) {
    const a = authorizeAnalytics(ctx, jenis), asset = a.predicate.bind(a, "assets");
    const select = sql`rm.id::text room_id,rm.nama lokasi,ac.id::text category_id,ac.nama kategori,u.work_unit_id::text unit_id,ur.kode role_code`;
    let rows: RawBuilder<unknown>;
    if (["kondisi-aset", "rekapitulasi-aset", "kebutuhan-pengadaan"].includes(jenis)) rows = sql`select rm.id::text room_id,rm.nama lokasi,ac.id::text category_id,ac.nama kategori,null::text unit_id,null::text role_code from assets a join rooms rm on rm.id=a.room_id join asset_categories ac on ac.id=a.category_id where ${asset()}`;
    else if (jenis === "biaya-pemeliharaan") rows = sql`select ${select} from work_orders w join assets a on a.id=w.asset_id join rooms rm on rm.id=a.room_id join asset_categories ac on ac.id=a.category_id left join users u on u.id=w.teknisi_id left join roles ur on ur.id=u.role_id where ${asset()} and ${a.predicate("maintenance")}`;
    else if (jenis === "tren-kerusakan") rows = sql`select ${select} from damage_reports d left join assets a on a.id=d.asset_id left join rooms rm on rm.id=coalesce(d.room_id,a.room_id) left join asset_categories ac on ac.id=a.category_id join users u on u.id=d.pelapor_id join roles ur on ur.id=u.role_id where ${asset()} and ${a.predicate("damage")}`;
    else if (jenis === "konsumsi-bahan") rows = sql`select rm.id::text room_id,rm.nama lokasi,mc.id::text category_id,mc.nama kategori,u.work_unit_id::text unit_id,ur.kode role_code from material_requests mr join material_request_items mi on mi.material_request_id=mr.id join materials m on m.id=mi.material_id join material_categories mc on mc.id=m.material_category_id join rooms rm on rm.id=mi.room_id join users u on u.id=mr.pemohon_id join roles ur on ur.id=u.role_id where ${a.predicate("material_consumption")}`;
    else {
        const loans = sql`select ${select} from loans l join loan_items li on li.loan_id=l.id join assets a on a.id=li.asset_id join rooms rm on rm.id=a.room_id join asset_categories ac on ac.id=a.category_id join users u on u.id=l.peminjam_id join roles ur on ur.id=u.role_id ${jenis === "pemanfaatan-fasilitas" ? sql`join reservations r on r.id=l.reservation_id` : sql``} where ${asset()} and ${a.predicate("loans")} ${jenis === "pemanfaatan-fasilitas" ? sql`and ${a.predicate("reservations")}` : sql``}`;
        rows = jenis === "aktivitas-peminjaman" ? loans : sql`${loans} union all select rm.id::text,rm.nama,null::text,null::text,u.work_unit_id::text,ur.kode from reservations r join rooms rm on rm.id=r.room_id join users u on u.id=r.pemohon_id join roles ur on ur.id=u.role_id where ${a.predicate("reservations")}`;
    }
    return (await sql<{ rooms: { id: string; nama: string }[]; categories: { id: string; nama: string }[]; units: { id: string; nama: string }[]; roles: { id: string; nama: string }[] }>`with visible as (${rows}) select
        coalesce((select jsonb_agg(x order by x.nama,x.id) from (select distinct room_id id,lokasi nama from visible where room_id is not null) x),'[]'::jsonb) rooms,
        coalesce((select jsonb_agg(x order by x.nama,x.id) from (select distinct category_id id,kategori nama from visible where category_id is not null) x),'[]'::jsonb) categories,
        coalesce((select jsonb_agg(x order by x.nama,x.id) from (select distinct w.id::text id,w.nama from visible v join work_units w on w.id::text=v.unit_id) x),'[]'::jsonb) units,
        coalesce((select jsonb_agg(x order by x.nama,x.id) from (select distinct r.kode id,r.nama from visible v join roles r on r.kode=v.role_code) x),'[]'::jsonb) roles`.execute(db)).rows[0]!;
}
