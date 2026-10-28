import { sql } from "kysely";
import type { RawBuilder } from "kysely";

/** CAL-02/BR-028c: SQL equivalent of countCalendarDays, including non-working weekdays. */
export function calendarDaysSql(from: RawBuilder<unknown>, to: RawBuilder<unknown>, excludeHolidays: RawBuilder<unknown>) {
    return sql<number>`case when ${to} <= ${from} then 0
      when not coalesce(${excludeHolidays},false) then greatest(0,(${to} at time zone 'Asia/Jakarta')::date-(${from} at time zone 'Asia/Jakarta')::date)
      else (select count(*)::int from generate_series(((${from} at time zone 'Asia/Jakarta')::date+1)::timestamp,(${to} at time zone 'Asia/Jakarta')::date::timestamp,interval '1 day') cd(day)
        join work_days wd on wd.hari=extract(isodow from cd.day) and wd.aktif
        where not exists(select 1 from holidays h where h.tanggal=cd.day::date)) end`;
}
