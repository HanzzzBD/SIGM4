import { sql } from "kysely";
import type { AnalyticsProvider } from "../registry.js";
import { calendarDaysSql } from "../../../shared/calendar/index.js";
import { column, cutoff, observation, dimensions, requester, plan, FILTER_NOTES } from "./common.js";

export const loansProvider: AnalyticsProvider = {
    jenis: "aktivitas-peminjaman",
    prepare(c) {
        const end = cutoff(c), exclude = sql`(l.kebijakan_denda->>'excludeHolidays')::boolean`;
        const extensionDays = calendarDaysSql(sql`e.jatuh_tempo_lama`, sql`e.diputuskan_pada`, exclude);
        const data = sql`with source as (
          select l.id loan_id,li.id item_id,a.id asset_id,a.kode_barang,a.nama aset,u.id borrower_id,u.nama peminjam,ac.nama kategori,rm.nama lokasi,to_char(l.tanggal_pinjam at time zone 'Asia/Jakarta','YYYY-MM') bulan,
            li.tanggal_kembali,li.status_kembali,l.kebijakan_denda,
            least(coalesce(li.tanggal_kembali,${observation(c)}::timestamptz),${observation(c)}::timestamptz) diamati,
            coalesce((select e.jatuh_tempo_baru from loan_extensions e join loan_extension_items ei on ei.extension_id=e.id where ei.loan_item_id=li.id and e.status='DISETUJUI' and e.diputuskan_pada < ${end} order by e.diputuskan_pada desc,e.id desc limit 1),l.tanggal_jatuh_tempo_asli,l.tanggal_jatuh_tempo) jatuh_tempo,
            coalesce((select sum(${extensionDays}) from loan_extensions e join loan_extension_items ei on ei.extension_id=e.id where ei.loan_item_id=li.id and e.status='DISETUJUI' and e.diputuskan_pada < ${end}),0)::int hari_perpanjangan,
            exists(select 1 from loan_extensions e join loan_extension_items ei on ei.extension_id=e.id where ei.loan_item_id=li.id and e.status='DISETUJUI' and e.diputuskan_pada < ${end} and e.diputuskan_pada > e.jatuh_tempo_lama) terlambat_sebelum_perpanjangan,
            (select f.hari_terlambat from fines f where f.loan_item_id=li.id and f.jenis='KETERLAMBATAN' and li.tanggal_kembali < ${end}) hari_final
          from loans l join loan_items li on li.loan_id=l.id join assets a on a.id=li.asset_id join asset_categories ac on ac.id=a.category_id join rooms rm on rm.id=a.room_id
          join users u on u.id=l.peminjam_id join roles ur on ur.id=u.role_id
          where ${c.access.predicate("loans")} and ${c.access.predicate("assets")} and ${dimensions(c)} and ${requester(c)} and l.tanggal_pinjam >= ${c.period.start} and l.tanggal_pinjam < ${end}),
        measured as (select *,tanggal_kembali < ${end} and status_kembali<>'HILANG' dikembalikan,
          tanggal_kembali < ${end} and status_kembali='HILANG' hilang,
          diamati > jatuh_tempo or terlambat_sebelum_perpanjangan terlambat,
          coalesce(hari_final,case when kebijakan_denda ? 'excludeHolidays' then hari_perpanjangan+${calendarDaysSql(sql`jatuh_tempo`, sql`diamati`, sql`(kebijakan_denda->>'excludeHolidays')::boolean`)} end)::int hari_terlambat from source)
        select * from measured`;
        return plan(sql`select bulan||':'||asset_id||':'||borrower_id grup,bulan,kode_barang,aset,peminjam,kategori,lokasi,count(distinct loan_id)::int transaksi,count(*)::int unit,
          count(*) filter(where dikembalikan)::int kembali,count(*) filter(where dikembalikan and not terlambat)::int tepat_waktu,count(*) filter(where terlambat)::int terlambat,count(*) filter(where hilang)::int hilang,
          sum(hari_terlambat)::int hari_terlambat,count(*) filter(where hari_terlambat is null)::int kebijakan_tidak_diketahui from (${data}) d group by bulan,asset_id,borrower_id,kode_barang,aset,peminjam,kategori,lokasi`,
          sql`select count(distinct loan_id)::int transaksi,count(*)::int unit,count(*) filter(where dikembalikan)::int kembali,count(*) filter(where dikembalikan and not terlambat)::int tepat_waktu,count(*) filter(where terlambat)::int terlambat,count(*) filter(where hilang)::int hilang,
          round(100.0*count(*) filter(where dikembalikan and not terlambat)/nullif(count(*) filter(where dikembalikan),0),2)::text kepatuhan_persen,
          sum(hari_terlambat)::int hari_terlambat,count(*) filter(where hari_terlambat is null)::int kebijakan_tidak_diketahui,
          (select peminjam from (${data}) v group by borrower_id,peminjam order by count(distinct loan_id) desc,borrower_id limit 1) peminjam_teraktif,
          (select kode_barang from (${data}) v group by asset_id,kode_barang order by count(*) desc,asset_id limit 1) aset_terpopuler from (${data}) d`,
          [column("grup", "Grup", "TEXT"), column("bulan", "Bulan pinjam", "TEXT"), column("kode_barang", "Kode barang", "TEXT"), column("aset", "Aset", "TEXT"), column("peminjam", "Peminjam", "TEXT"), column("kategori", "Kategori", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("transaksi", "Transaksi unik"), column("unit", "Unit"), column("kembali", "Kembali normal"), column("tepat_waktu", "Kembali tepat waktu"), column("terlambat", "Unit pernah terlambat"), column("hilang", "Hilang"), column("hari_terlambat", "Hari keterlambatan"), column("kebijakan_tidak_diketahui", "Tanpa snapshot hari")],
          [column("transaksi", "Transaksi unik"), column("unit", "Unit"), column("kembali", "Kembali normal"), column("tepat_waktu", "Kembali tepat waktu"), column("terlambat", "Unit pernah terlambat"), column("hilang", "Hilang"), column("kepatuhan_persen", "Kepatuhan unit kembali", "DECIMAL", "PUBLIC", "%"), column("hari_terlambat", "Total hari keterlambatan"), column("kebijakan_tidak_diketahui", "Tanpa snapshot hari"), column("peminjam_teraktif", "Peminjam teraktif", "TEXT"), column("aset_terpopuler", "Aset terpopuler", "TEXT")], "bulan",
          [...FILTER_NOTES, "Kohor menurut tanggal pinjam. Unit kembali sebagian dihitung masing-masing; Hilang dipisahkan. Kepatuhan berdasarkan tenggat waktu, sedangkan jumlah hari mengikuti kalender WIB/snapshot dan perpanjangan disetujui. Snapshot lama tidak lengkap menghasilkan hari null, bukan hari nol.", "Fines hanya menyediakan jumlah hari final, tanpa membaca nominal kewajiban. Pembanding memakai kohor dan hak yang sama."]);
    },
};
