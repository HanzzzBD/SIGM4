import { facilityAggregation } from "./facility-aggregation.js";
import { sql } from "kysely";
import type { AnalyticsContext, AnalyticsProvider } from "../registry.js";
import { column, cutoff, dimensions, requester, plan, FILTER_NOTES } from "./common.js";

export const facilitiesProvider: AnalyticsProvider = {
    jenis: "pemanfaatan-fasilitas",
    prepare(c: AnalyticsContext) {
        const end = cutoff(c);
        // Loan holds/extensions are not realizations: only the original loan_item slot is used.
        const usage = sql`select 'RUANGAN'::text jenis,bs.resource_id,u.id pemohon_id,lower(bs.slot_range) mulai,least(upper(bs.slot_range),${end}::timestamptz) selesai
          from booking_slots bs join reservations r on r.id=bs.reservation_id join users u on u.id=r.pemohon_id join roles ur on ur.id=u.role_id
          where bs.resource_type='room' and bs.origin='reservation' and bs.status='ACTIVE' and r.status in ('BERLANGSUNG','SELESAI')
          and ${c.access.predicate("reservations")} and ${requester(c)} and ${c.query.category_id ?? null}::bigint is null
          union all
          select 'ASET',bs.resource_id,u.id,lower(bs.slot_range),least(coalesce(li.tanggal_kembali,${end}::timestamptz),${end}::timestamptz)
          from booking_slots bs join loan_items li on li.slot_id=bs.id join loans l on l.id=li.loan_id join reservations r on r.id=l.reservation_id
          join assets a on a.id=li.asset_id join users u on u.id=l.peminjam_id join roles ur on ur.id=u.role_id
          where bs.resource_type='asset' and bs.origin='loan' and bs.status in ('ACTIVE','RELEASED')
          and ${c.access.predicate("assets")} and ${c.access.predicate("reservations")} and ${c.access.predicate("loans")} and ${dimensions(c)} and ${requester(c)}`;
        const resources = sql`select 'RUANGAN'::text jenis,rm.id,rm.nama nama,rm.nama lokasi,null::text kategori,rm.created_at awal
          from rooms rm where rm.created_at < ${end} and ${c.period.start}::timestamptz < ${end}::timestamptz and (${c.query.room_id ?? null}::bigint is null or rm.id=${c.query.room_id ?? null}) and ${c.query.category_id ?? null}::bigint is null
          and (rm.dapat_direservasi or exists(select 1 from (${usage}) v where v.jenis='RUANGAN' and v.resource_id=rm.id))
          and (${!c.access.restrictedSubjects && !c.query.work_unit_id && !c.query.requester_role} or exists(select 1 from (${usage}) v where v.jenis='RUANGAN' and v.resource_id=rm.id))
          union all
          select 'ASET',a.id,a.nama,rm.nama,ac.nama,a.created_at from assets a join rooms rm on rm.id=a.room_id join asset_categories ac on ac.id=a.category_id
          where ${c.access.predicate("assets")} and ${dimensions(c)} and a.created_at < ${end} and ${c.period.start}::timestamptz < ${end}::timestamptz
          and (a.dapat_dipinjam or exists(select 1 from (${usage}) v where v.jenis='ASET' and v.resource_id=a.id))
          and (${!c.access.restrictedSubjects && !c.query.work_unit_id && !c.query.requester_role} or exists(select 1 from (${usage}) v where v.jenis='ASET' and v.resource_id=a.id))`;
        const calendar = sql`select greatest((d.day::date+(select value#>>'{}' from system_settings where key='reservasi.jam_operasional_mulai')::time) at time zone 'Asia/Jakarta',${c.period.start}::timestamptz) mulai,
          least((d.day::date+(select value#>>'{}' from system_settings where key='reservasi.jam_operasional_selesai')::time) at time zone 'Asia/Jakarta',${end}::timestamptz) selesai
          from generate_series(${c.period.tanggal_mulai}::date::timestamp,${c.period.tanggal_selesai}::date::timestamp,interval '1 day') d(day)
          join work_days wd on wd.hari=extract(isodow from d.day) and wd.aktif where not exists(select 1 from holidays h where h.tanggal=d.day::date)`;
        const data = facilityAggregation(usage, resources, calendar);
        return plan(data, sql`select count(*)::int objek,coalesce(sum(jam_operasional::numeric),0)::text jam_operasional,coalesce(sum(jam_terpakai::numeric),0)::text jam_terpakai,round(sum(jam_terpakai::numeric)*100/nullif(sum(jam_operasional::numeric),0),2)::text utilisasi_persen from (${data}) d`,
          [column("grup", "Grup objek", "TEXT"), column("jenis", "Jenis", "TEXT"), column("objek_id", "ID objek", "TEXT"), column("nama", "Objek", "TEXT"), column("lokasi", "Lokasi", "TEXT"), column("kategori", "Kategori", "TEXT"), column("jam_operasional", "Jam operasional", "DECIMAL", "PUBLIC", "jam"), column("jam_terpakai", "Jam terpakai", "DECIMAL", "PUBLIC", "jam"), column("utilisasi_persen", "Utilisasi", "DECIMAL", "PUBLIC", "%")],
          [column("objek", "Objek terlihat"), column("jam_operasional", "Total jam operasional", "DECIMAL", "PUBLIC", "jam"), column("jam_terpakai", "Total jam terpakai", "DECIMAL", "PUBLIC", "jam"), column("utilisasi_persen", "Utilisasi tertimbang", "DECIMAL", "PUBLIC", "%")], "-jam_terpakai",
          [...FILTER_NOTES, "Pemakaian terealisasi dari slot ruangan ACTIVE dan slot loan_item; slot induk, tentatif, blokade, pembatalan dan Tidak Digunakan tidak dihitung. Pengembalian dini/overdue memakai waktu pengembalian atau Clock, tanpa menghitung hold perpanjangan sebagai pemakaian kedua.", "Interval digabung per objek dan dipotong jam operasional/hari kerja/libur. Kalender memakai konfigurasi sekarang. Kapasitas nol menghasilkan persentase null. Pada scope subjek/filter pemohon terbatas, hanya objek terkait pemakaian yang terlihat yang dihitung."]);
    },
};
