import { sql } from "kysely";
import type { AnalyticsContext, AnalyticsProvider } from "../registry.js";
import { column, cutoff, observation, dimensions, aliveAt, conditionAt, wibDate, plan, FILTER_NOTES } from "./common.js";

export const conditionProvider: AnalyticsProvider = {
    jenis: "kondisi-aset",
    prepare(c) {
        const end = cutoff(c), condition = conditionAt(sql`${end}`);
        const final = sql`select ${condition} kondisi from assets a where ${c.access.predicate("assets")} and ${dimensions(c)} and ${c.period.start}::timestamptz < ${end}::timestamptz and a.created_at < ${end} and ${aliveAt(sql`${end}`)}`;
        const monthly = sql`select to_char(m.day,'YYYY-MM') bulan,least((m.day+interval '1 month') at time zone 'Asia/Jakarta',${end}::timestamptz) batas
          from generate_series(date_trunc('month',${c.period.start}::timestamptz at time zone 'Asia/Jakarta'),date_trunc('month',(${end}::timestamptz-interval '1 microsecond') at time zone 'Asia/Jakarta'),interval '1 month') m(day) where ${end}::timestamptz > ${c.period.start}::timestamptz`;
        const monthlyData = sql`select m.bulan,a.category_id,a.room_id,ac.nama kategori,rm.nama lokasi,${conditionAt(sql`m.batas`)} kondisi
          from (${monthly}) m join assets a on a.created_at < m.batas join asset_categories ac on ac.id=a.category_id join rooms rm on rm.id=a.room_id
          where ${c.access.predicate("assets")} and ${dimensions(c)} and ${aliveAt(sql`m.batas`)}`;
        return plan(sql`select bulan||':'||category_id||':'||room_id||':'||kondisi grup,bulan,kategori,lokasi,kondisi,count(*)::int jumlah_aset from (${monthlyData}) d group by bulan,category_id,room_id,kategori,lokasi,kondisi`,
        sql`select count(*)::int jumlah_aset,count(*) filter(where kondisi='BAIK')::int baik,count(*) filter(where kondisi='RUSAK_RINGAN')::int rusak_ringan,count(*) filter(where kondisi='RUSAK_BERAT')::int rusak_berat,count(*) filter(where kondisi='HILANG')::int hilang from (${final}) f`,
        [column("grup", "Grup", "TEXT"), column("bulan", "Bulan", "TEXT"), column("kategori", "Kategori", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("kondisi", "Kondisi", "TEXT"), column("jumlah_aset", "Jumlah aset")],
        [column("jumlah_aset", "Aset aktif pada akhir periode"), column("baik", "Baik"), column("rusak_ringan", "Rusak ringan"), column("rusak_berat", "Rusak berat"), column("hilang", "Hilang")], "bulan", [...FILTER_NOTES, "Komposisi pada akhir setiap bulan, dibatasi akhir periode/Clock. Kondisi direkonstruksi dari riwayat; aset belum terdaftar atau telah dihapus pada batas snapshot tidak dihitung."]);
    },
};

export const needsProvider: AnalyticsProvider = {
    jenis: "kebutuhan-pengadaan",
    prepare(c) {
        const end = cutoff(c), condition = conditionAt(sql`${end}`);
        const data = sql`select a.id,a.kode_barang,a.nama,ac.nama kategori,rm.nama lokasi,${condition} kondisi,a.tahun_perolehan,ac.umur_teknis_tahun,
          (${condition}='RUSAK_BERAT') rusak_berat,(ac.umur_teknis_tahun is not null and extract(year from ${observation(c)}::timestamptz at time zone 'Asia/Jakarta')-a.tahun_perolehan > ac.umur_teknis_tahun) lewat_umur
          from assets a join asset_categories ac on ac.id=a.category_id join rooms rm on rm.id=a.room_id where ${c.access.predicate("assets")} and ${dimensions(c)} and ${c.period.start}::timestamptz < ${end}::timestamptz and a.created_at < ${end} and ${aliveAt(sql`${end}`)}`;
        return plan(sql`select id::text grup,kode_barang,nama,kategori,lokasi,kondisi,tahun_perolehan,umur_teknis_tahun,rusak_berat,lewat_umur,'BELUM_TERUKUR'::text permintaan_tidak_terpenuhi from (${data}) d where rusak_berat or lewat_umur`,
          sql`select count(*) filter(where rusak_berat or lewat_umur)::int kandidat,count(*) filter(where rusak_berat)::int rusak_berat,count(*) filter(where lewat_umur)::int lewat_umur,null::int permintaan_tidak_terpenuhi,'BELUM_TERUKUR'::text status_indikator from (${data}) d`,
          [column("grup", "ID aset", "TEXT"), column("kode_barang", "Kode barang", "TEXT"), column("nama", "Aset", "TEXT"), column("kategori", "Kategori", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("kondisi", "Kondisi akhir", "TEXT"), column("tahun_perolehan", "Tahun perolehan"), column("umur_teknis_tahun", "Umur teknis", "NUMBER", "PUBLIC", "tahun"), column("rusak_berat", "Rusak berat", "BOOLEAN"), column("lewat_umur", "Melewati umur teknis", "BOOLEAN"), column("permintaan_tidak_terpenuhi", "Kekurangan permintaan", "TEXT")],
          [column("kandidat", "Kandidat unik"), column("rusak_berat", "Rusak berat"), column("lewat_umur", "Melewati umur teknis"), column("permintaan_tidak_terpenuhi", "Permintaan tidak terpenuhi"), column("status_indikator", "Kesiapan indikator", "TEXT")], "kode_barang",
          [...FILTER_NOTES, "Rekomendasi pada akhir periode/Clock. Umur berupa selisih tahun karena tanggal perolehan tidak tersedia; umur teknis kosong tidak dianggap habis. Permintaan tak terpenuhi belum memiliki histori penyebab yang sah dan tidak diubah menjadi angka nol."]);
    },
};

export const recapProvider: AnalyticsProvider = {
    jenis: "rekapitulasi-aset",
    prepare(c) {
        const end = cutoff(c), financial = c.access.assetFinancial;
        const population = sql`select a.id,a.kode_barang,a.nama,a.category_id,a.room_id,a.tahun_perolehan,${conditionAt(sql`${end}`)} kondisi,not(${aliveAt(sql`${end}`)}) dihapuskan,
          ${wibDate(sql`a.created_at`)} terdaftar,
          ${wibDate(sql`(select max(di.executed_at) from asset_disposal_items di where di.asset_id=a.id and di.executed_at < ${end})`)} terakhir_dihapus,
          ${wibDate(sql`(select max(di.reinstated_at) from asset_disposal_items di where di.asset_id=a.id and di.reinstated_at < ${end})`)} terakhir_dipulihkan
          ${financial ? sql`,a.nilai_perolehan,a.sumber_perolehan::text` : sql``}
          from assets a where ${c.access.predicate("assets")} and ${dimensions(c)} and ${c.period.start}::timestamptz < ${end}::timestamptz and a.created_at < ${end}
          and (a.created_at >= ${c.period.start} or ${aliveAt(sql`${c.period.start}`)} or exists(select 1 from asset_disposal_items di where di.asset_id=a.id and di.reinstated_at >= ${c.period.start} and di.reinstated_at < ${end}))`;
        const columns = [column("grup", "ID aset", "TEXT"), column("kode_barang", "Kode barang", "TEXT"), column("nama", "Aset", "TEXT"), column("kategori", "Kategori", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("tahun_perolehan", "Tahun perolehan"), column("kondisi", "Kondisi akhir", "TEXT"), column("dihapuskan", "Dihapus pada akhir periode", "BOOLEAN"), column("terdaftar", "Terdaftar", "DATE"), column("terakhir_dihapus", "Penghapusan terakhir", "DATE"), column("terakhir_dipulihkan", "Pemulihan terakhir", "DATE")];
        const summaries = [column("jumlah_aset", "Aset dalam populasi periode"), column("aktif_akhir", "Aktif akhir"), column("dihapus_akhir", "Dihapus akhir")];
        if (financial) { columns.push(column("nilai_perolehan", "Nilai perolehan", "DECIMAL", "ASSET_FINANCIAL", "Rp"), column("sumber_perolehan", "Sumber perolehan", "TEXT", "ASSET_FINANCIAL")); summaries.push(column("nilai_perolehan", "Total nilai perolehan", "DECIMAL", "ASSET_FINANCIAL", "Rp"), column("nilai_tidak_diketahui", "Aset tanpa nilai", "NUMBER", "ASSET_FINANCIAL")); }
        const extra = disposalSummary(c), procurement = procurementSummary(c);
        summaries.push(...extra.columns, ...procurement.columns);
        return plan(sql`select a.id::text grup,a.kode_barang,a.nama,ac.nama kategori,rm.nama lokasi,a.tahun_perolehan,a.kondisi,a.dihapuskan,a.terdaftar,a.terakhir_dihapus,a.terakhir_dipulihkan ${financial ? sql`,a.nilai_perolehan::text,a.sumber_perolehan` : sql``} from (${population}) a join asset_categories ac on ac.id=a.category_id join rooms rm on rm.id=a.room_id`,
          sql`select count(*)::int jumlah_aset,count(*) filter(where not dihapuskan)::int aktif_akhir,count(*) filter(where dihapuskan)::int dihapus_akhir ${financial ? sql`,coalesce(sum(nilai_perolehan),0)::text nilai_perolehan,count(*) filter(where nilai_perolehan is null)::int nilai_tidak_diketahui` : sql``} ${extra.select} ${procurement.select} from (${population}) a`, columns, summaries, "kode_barang", [...FILTER_NOTES, "Populasi mencakup aset aktif pada awal periode, terdaftar atau dipulihkan selama periode. Penghapusan dalam periode tidak menghapus aset dari rekap. Nilai perolehan memakai nilai tercatat sekarang; bukan valuasi historis.", "Ringkasan pengadaan/penghapusan hanya tersedia dengan izin masing-masing domain. Usulan pengadaan memakai kohor tanggal dibuat dan status sekarang; aset dari pengadaan memakai tanggal registrasi."]);
    },
};

function disposalSummary(c: AnalyticsContext) {
    const permission = c.access.optionalPredicate("disposal"); if (!permission) return { select: sql``, columns: [] };
    const data = sql`select i.executed_at,i.reinstated_at from asset_disposal_items i join asset_disposals ds on ds.id=i.disposal_id join assets a on a.id=i.asset_id
      where ${permission} and ${c.access.predicate("assets")} and ${dimensions(c)}`;
    return { columns: [column("dieksekusi_periode", "Unit penghapusan periode"), column("dipulihkan_periode", "Unit pemulihan periode")],
      select: sql`,(select count(*)::int from (${data}) x where executed_at >= ${c.period.start} and executed_at < ${cutoff(c)}) dieksekusi_periode,(select count(*)::int from (${data}) x where reinstated_at >= ${c.period.start} and reinstated_at < ${cutoff(c)}) dipulihkan_periode` };
}
function procurementSummary(c: AnalyticsContext) {
    const permission = c.access.optionalPredicate("procurement"); if (!permission) return { select: sql``, columns: [] };
    // Scoped asset readers see only proposals linked to a visible asset.
    const related = sql`exists(select 1 from assets a where (a.procurement_id=p.id or p.source_asset_id=a.id) and ${c.access.predicate("assets")} and ${dimensions(c)})`;
    const data = sql`select p.id,p.status from procurements p where ${permission} and p.created_at >= ${c.period.start} and p.created_at < ${cutoff(c)}
      and (${related} or (${!c.access.restrictedAssets} and ${c.query.room_id ?? null}::bigint is null
        and exists(select 1 from procurement_items pi where pi.procurement_id=p.id and pi.jenis='ASET' and (${c.query.category_id ?? null}::bigint is null or pi.category_id=${c.query.category_id ?? null}))))`;
    const acquisitions = sql`select count(*)::int from assets a join procurements p on p.id=a.procurement_id where ${permission} and ${c.access.predicate("assets")} and ${dimensions(c)} and a.created_at >= ${c.period.start} and a.created_at < ${cutoff(c)}`;
    return { columns: [column("usulan_pengadaan_aset", "Usulan pengadaan aset terlihat"), column("pengadaan_selesai", "Usulan selesai saat ini"), column("aset_pengadaan_terdaftar", "Aset terdaftar dari pengadaan")], select: sql`,(select count(*)::int from (${data}) p) usulan_pengadaan_aset,(select count(*)::int from (${data}) p where status='SELESAI') pengadaan_selesai,(${acquisitions}) aset_pengadaan_terdaftar` };
}
