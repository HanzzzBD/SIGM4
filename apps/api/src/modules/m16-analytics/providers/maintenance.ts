import { sql } from "kysely";
import type { AnalyticsProvider } from "../registry.js";
import { column, cutoff, plan, FILTER_NOTES } from "./common.js";

export const maintenanceProvider: AnalyticsProvider = {
    jenis: "biaya-pemeliharaan",
    prepare(c) {
        const data = sql`select w.id,w.nomor,w.jenis,coalesce(a.nama,rm.nama) objek,ac.nama kategori,rm.nama lokasi,to_char(w.diverifikasi_pada at time zone 'Asia/Jakarta','YYYY-MM') bulan,w.biaya,
          (select sum(co.total) from work_order_costs co where co.work_order_id=w.id) rincian
          from work_orders w left join assets a on a.id=w.asset_id left join asset_categories ac on ac.id=a.category_id left join rooms rm on rm.id=coalesce(w.room_id,a.room_id)
          where ${c.access.predicate("maintenance")} and ${c.access.predicate("assets")} and w.status='SELESAI' and w.diverifikasi_pada >= ${c.period.start} and w.diverifikasi_pada < ${cutoff(c)}
          and (${c.query.room_id ?? null}::bigint is null or rm.id=${c.query.room_id ?? null}) and (${c.query.category_id ?? null}::bigint is null or a.category_id=${c.query.category_id ?? null})`;
        return plan(sql`select id::text grup,nomor,jenis,objek,kategori,lokasi,bulan,biaya::text biaya,coalesce(rincian,0)::text biaya_rincian,(biaya=coalesce(rincian,0)) cocok_rincian from (${data}) d`,
          sql`select count(*)::int work_order,coalesce(sum(biaya),0)::text biaya,coalesce(sum(rincian),0)::text biaya_rincian,count(*) filter(where biaya<>coalesce(rincian,0))::int selisih_rincian from (${data}) d`,
          [column("grup", "ID WO", "TEXT"), column("nomor", "Nomor WO", "TEXT"), column("jenis", "Jenis", "TEXT"), column("objek", "Objek", "TEXT"), column("kategori", "Kategori", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("bulan", "Bulan verifikasi", "TEXT"), column("biaya", "Biaya aktual WO", "DECIMAL", "MAINTENANCE_COST", "Rp"), column("biaya_rincian", "Jumlah rincian", "DECIMAL", "MAINTENANCE_COST", "Rp"), column("cocok_rincian", "Rincian cocok", "BOOLEAN", "MAINTENANCE_COST")],
          [column("work_order", "WO terverifikasi"), column("biaya", "Realisasi", "DECIMAL", "MAINTENANCE_COST", "Rp"), column("biaya_rincian", "Total rincian", "DECIMAL", "MAINTENANCE_COST", "Rp"), column("selisih_rincian", "WO dengan selisih", "NUMBER", "MAINTENANCE_COST")], "-biaya",
          [...FILTER_NOTES, "Biaya aktual WO Selesai diakui pada tanggal verifikasi Petugas. Estimasi dan pekerjaan menunggu verifikasi tidak masuk realisasi. Nomor WO serta jumlah rincian mempertahankan rekonsiliasi tanpa menggandakan biaya karena join."]);
    },
};
