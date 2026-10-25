import { sql } from "kysely";
import type { AnalyticsProvider } from "../registry.js";
import { column, requester, cutoff, plan, FILTER_NOTES } from "./common.js";

export const materialsProvider: AnalyticsProvider = {
    jenis: "konsumsi-bahan",
    prepare(c) {
        const data = sql`select mt.id,mt.material_id,mt.room_id,m.nama bahan,mc.nama kategori,rm.nama lokasi,mu.simbol satuan,coalesce(wu.nama,'Tanpa unit kerja') unit_kerja,
          u.work_unit_id,mr.id request_id,to_char(mi.tanggal_serah,'YYYY-MM') bulan,-mt.jumlah jumlah
          from material_issue_items ii join material_transactions mt on mt.id=ii.transaction_id join material_issues mi on mi.id=ii.issue_id
          join material_requests mr on mr.id=mi.request_id join material_request_items ri on ri.id=ii.item_id
          join materials m on m.id=mt.material_id join material_categories mc on mc.id=m.material_category_id join rooms rm on rm.id=mt.room_id join material_units mu on mu.id=ri.satuan_id
          join users u on u.id=mr.pemohon_id join roles ur on ur.id=u.role_id left join work_units wu on wu.id=u.work_unit_id
          where ${c.access.predicate("material_consumption")} and ${requester(c)} and mt.jenis='PENGELUARAN' and mt.referensi_jenis='material_issue'
          and mi.tanggal_serah >= ${c.period.tanggal_mulai}::date and mi.tanggal_serah <= ${c.period.tanggal_selesai}::date and mi.created_at <= ${c.now!}
          and (${c.query.room_id ?? null}::bigint is null or mt.room_id=${c.query.room_id ?? null}) and (${c.query.category_id ?? null}::bigint is null or m.material_category_id=${c.query.category_id ?? null})`;
        const globalFrequency = !c.access.restrictedSubjects && !c.query.work_unit_id && !c.query.requester_role;
        const crossings = globalFrequency ? sql`with ledger as (select t.id,t.material_id,t.created_at,t.jumlah,m.stok_minimum,sum(t.jumlah) over(partition by t.material_id order by t.id rows unbounded preceding) saldo
          from material_transactions t join materials m on m.id=t.material_id where t.material_id in(select distinct material_id from (${data}) visible) and t.created_at <= ${c.now!})
          select id,material_id from ledger where jumlah<0 and stok_minimum>0 and saldo-jumlah>stok_minimum and saldo<=stok_minimum and created_at >= ${c.period.start} and created_at < ${cutoff(c)}` : null;
        const countForMaterial = crossings ? sql`(select count(*)::int from (${crossings}) f where f.material_id=d.material_id)` : sql`null::int`;
        return plan(sql`select bulan||':'||material_id||':'||room_id||':'||coalesce(work_unit_id::text,'0') grup,bulan,bahan,kategori,lokasi,satuan,unit_kerja,sum(jumlah)::float8 jumlah,count(distinct request_id)::int permintaan,${countForMaterial} frekuensi_minimum_per_jenis from (${data}) d group by bulan,material_id,room_id,work_unit_id,bahan,kategori,lokasi,satuan,unit_kerja`,
          sql`select count(distinct material_id)::int jenis_bahan,count(distinct request_id)::int permintaan,count(distinct satuan)::int satuan_berbeda,
            (select unit_kerja from (${data}) x group by work_unit_id,unit_kerja order by count(distinct request_id) desc,work_unit_id nulls last limit 1) unit_teraktif,
            ${crossings ? sql`(select count(*)::int from (${crossings}) f)` : sql`null::int`} penembusan_minimum,
            ${globalFrequency ? "AMBANG_SAAT_INI" : "TIDAK_TERSEDIA_PADA_SCOPE"}::text basis_minimum from (${data}) d`,
          [column("grup", "Grup", "TEXT"), column("bulan", "Bulan penyerahan", "TEXT"), column("bahan", "Bahan", "TEXT"), column("kategori", "Kategori bahan", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("satuan", "Satuan", "TEXT"), column("unit_kerja", "Unit kerja pemohon", "TEXT"), column("jumlah", "Jumlah diserahkan"), column("permintaan", "Permintaan unik"), column("frekuensi_minimum_per_jenis", "Penembusan minimum per jenis, seluruh lokasi")],
          [column("jenis_bahan", "Jenis bahan"), column("permintaan", "Permintaan unik"), column("satuan_berbeda", "Satuan berbeda"), column("unit_teraktif", "Unit kerja peminta teraktif", "TEXT"), column("penembusan_minimum", "Penembusan ambang saat ini"), column("basis_minimum", "Basis minimum", "TEXT")], "-jumlah",
          [...FILTER_NOTES, "Pemakaian adalah jumlah ledger PENGELUARAN dari penyerahan nyata, menurut tanggal_serah. Jumlah diminta/disetujui, penerimaan, penyesuaian dan opname tidak menjadi konsumsi. Satuan berbeda tidak dijumlahkan; jumlah hanya dapat dibandingkan dalam satu satuan.", "Frekuensi merekonstruksi saldo total menurut urutan ID ledger untuk jenis bahan dengan penyerahan terlihat, lalu mengevaluasi penembusan menggunakan minimum sekarang. Ini bukan jumlah notifikasi/ambang historis. Frekuensi per jenis/periode diulang pada baris lokasi/bulan dan tidak dijumlahkan antarbaris. Hanya scope penuh tanpa filter pemohon dapat membaca indikator global; selainnya null."]);
    },
};
