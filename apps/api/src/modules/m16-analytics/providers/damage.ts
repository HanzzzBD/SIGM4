import { sql } from "kysely";
import type { AnalyticsProvider } from "../registry.js";
import { column, cutoff, requester, plan, FILTER_NOTES } from "./common.js";

export const damageProvider: AnalyticsProvider = {
    jenis: "tren-kerusakan",
    prepare(c) {
        const end = cutoff(c);
        const data = sql`select d.id,to_char(d.created_at at time zone 'Asia/Jakarta','YYYY-MM') bulan,coalesce(ac.id::text,'RUANGAN') category_key,coalesce(ac.nama,'Ruangan') kategori,rm.id room_key,rm.nama lokasi,d.created_at,
          coalesce((select min(w.diverifikasi_pada) from work_orders w where w.damage_report_id=d.id and w.status='SELESAI'),case when d.status='SELESAI' then d.diverifikasi_pada end) closed_at
          from damage_reports d left join assets a on a.id=d.asset_id left join asset_categories ac on ac.id=a.category_id left join rooms rm on rm.id=coalesce(d.room_id,a.room_id)
          join users u on u.id=d.pelapor_id join roles ur on ur.id=u.role_id
          where ${c.access.predicate("damage")} and ${c.access.predicate("assets")} and ${requester(c)} and d.created_at >= ${c.period.start} and d.created_at < ${end}
          and (${c.query.room_id ?? null}::bigint is null or rm.id=${c.query.room_id ?? null}) and (${c.query.category_id ?? null}::bigint is null or a.category_id=${c.query.category_id ?? null})`;
        const aggregates = sql`count(*)::int laporan,count(*) filter(where closed_at < ${end})::int selesai,round(avg(extract(epoch from closed_at-created_at)/3600) filter(where closed_at < ${end}),4)::text rata_jam_penyelesaian`;
        return plan(sql`select bulan||':'||category_key||':'||room_key grup,bulan,kategori,lokasi,${aggregates} from (${data}) d group by bulan,category_key,room_key,kategori,lokasi`,
          sql`select ${aggregates} from (${data}) d`,
          [column("grup", "Grup", "TEXT"), column("bulan", "Bulan laporan", "TEXT"), column("kategori", "Kategori", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("laporan", "Laporan"), column("selesai", "Selesai pada batas periode"), column("rata_jam_penyelesaian", "Rata-rata penyelesaian", "DECIMAL", "PUBLIC", "jam")],
          [column("laporan", "Laporan dalam kohor"), column("selesai", "Kohor selesai"), column("rata_jam_penyelesaian", "Rata-rata penyelesaian kohor", "DECIMAL", "PUBLIC", "jam")], "bulan",
          [...FILTER_NOTES, "Kohor berdasarkan tanggal laporan. Penyelesaian memakai verifikasi WO atau verifikasi perbaikan ringan; yang selesai setelah akhir periode/Clock tidak masuk rata-rata. Aset terhapus tidak menghilangkan tiket historis. Tidak ada durasi yang diambil dari updated_at."]);
    },
};
