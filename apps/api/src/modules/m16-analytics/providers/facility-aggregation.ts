import { sql } from "kysely";
import type { RawBuilder } from "kysely";
import type { AnalyticsRow } from "@sigm4/schemas";
/** PR-06-09 EXPLAIN: aggregate shared calendar and scoped usage once, avoiding per-resource calendar joins/scans. */
export function facilityAggregation(usage: RawBuilder<unknown>, resources: RawBuilder<unknown>, calendar: RawBuilder<unknown>): RawBuilder<AnalyticsRow> {
    return sql<AnalyticsRow>`with usage as materialized (${usage}), resources as materialized (${resources}), calendar as (${calendar}),
      calendar_ranges as materialized (
        select min(mulai) first_start,coalesce(range_agg(tstzrange(mulai,selesai,'[)')),'{}'::tstzmultirange) ranges from calendar where selesai>mulai),
      usage_ranges as materialized (
        select jenis,resource_id,range_agg(tstzrange(mulai,selesai,'[)')) ranges from usage where selesai>mulai group by jenis,resource_id),
      disposal_ranges as materialized (
        select di.asset_id,range_agg(tstzrange(di.executed_at,di.reinstated_at,'[)')) ranges from asset_disposal_items di
        join resources s on s.jenis='ASET' and s.id=di.asset_id where di.executed_at is not null group by di.asset_id),
      capacity_inputs as materialized (
        select distinct greatest(s.awal,cal.first_start) begin_at,coalesce(d.ranges,'{}'::tstzmultirange) outage
        from resources s cross join calendar_ranges cal left join disposal_ranges d on s.jenis='ASET' and d.asset_id=s.id),
      capacity_ranges as materialized (
        select c.*,cal.ranges * tstzmultirange(tstzrange(c.begin_at,null,'[)')) - c.outage ranges
        from capacity_inputs c cross join calendar_ranges cal),
      capacities as materialized (
        select c.*,coalesce((select sum(extract(epoch from upper(r)-lower(r))) from unnest(c.ranges) r),0) kapasitas from capacity_ranges c),
      available as (
        select s.*,c.ranges,c.kapasitas from resources s cross join calendar_ranges cal
        left join disposal_ranges d on s.jenis='ASET' and d.asset_id=s.id
        join capacities c on c.begin_at=greatest(s.awal,cal.first_start) and c.outage=coalesce(d.ranges,'{}'::tstzmultirange)),
      measured as materialized (
        select s.*,
          coalesce((select sum(extract(epoch from upper(r)-lower(r))) from unnest(s.ranges * coalesce(u.ranges,'{}'::tstzmultirange)) r),0) terpakai
        from available s left join usage_ranges u on u.jenis=s.jenis and u.resource_id=s.id)
      select jenis||':'||id grup,jenis,id::text objek_id,nama,lokasi,kategori,round(kapasitas/3600,4)::text jam_operasional,
        round(terpakai/3600,4)::text jam_terpakai,round(terpakai*100/nullif(kapasitas,0),2)::text utilisasi_persen from measured`;
}
