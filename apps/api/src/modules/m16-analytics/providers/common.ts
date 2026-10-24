import { sql } from "kysely";
import type { RawBuilder } from "kysely";
import type { AnalyticsColumn, AnalyticsRow } from "@sigm4/schemas";
import type { AnalyticsContext, AnalyticsPlan } from "../registry.js";

export const column = (key: string, label: string, tipe: AnalyticsColumn["tipe"] = "NUMBER", sensitivitas: AnalyticsColumn["sensitivitas"] = "PUBLIC", satuan?: string): AnalyticsColumn => ({ key, label, tipe, sensitivitas, ...(satuan ? { satuan } : {}) });
export const FILTER_NOTES = ["Periode dan tanggal memakai WIB. Kategori, lokasi, role, unit kerja dan scope penanggung jawab memakai data sekarang; riwayat lengkap dimensi tersebut belum tersedia."];
export const cutoff = (c: AnalyticsContext) => { if (!c.now) throw new Error("Clock laporan belum diberikan."); return new Date(Math.min(c.now.getTime()+1, c.period.endExclusive.getTime())); };
export const dimensions = (c: AnalyticsContext, alias = "a") => sql<boolean>`(${c.query.room_id ?? null}::bigint is null or ${sql.ref(`${alias}.room_id`)}=${c.query.room_id ?? null}) and (${c.query.category_id ?? null}::bigint is null or ${sql.ref(`${alias}.category_id`)}=${c.query.category_id ?? null})`;
export const requester = (c: AnalyticsContext) => sql<boolean>`(${c.query.work_unit_id ?? null}::bigint is null or u.work_unit_id=${c.query.work_unit_id ?? null}) and (${c.query.requester_role ?? null}::text is null or ur.kode=${c.query.requester_role ?? null})`;
/** FR-16.1: lifecycle at a historical boundary, independent of today's deletion flag. */
export const aliveAt = (time: RawBuilder<unknown>) => sql<boolean>`not exists(select 1 from asset_disposal_items di where di.asset_id=a.id and di.executed_at < ${time} and (di.reinstated_at is null or di.reinstated_at >= ${time}))`;
export const conditionAt = (time: RawBuilder<unknown>) => sql<string>`coalesce((select h.kondisi_baru::text from asset_condition_history h where h.asset_id=a.id and h.diubah_pada < ${time} order by h.diubah_pada desc,h.id desc limit 1),(select h.kondisi_lama::text from asset_condition_history h where h.asset_id=a.id and h.diubah_pada >= ${time} order by h.diubah_pada,h.id limit 1),a.kondisi::text)`;
export const wibDate = (value: RawBuilder<unknown>) => sql<string>`to_char(${value} at time zone 'Asia/Jakarta','YYYY-MM-DD')`;
export function plan(rows: RawBuilder<AnalyticsRow>, summary: RawBuilder<AnalyticsRow>, columns: AnalyticsColumn[], summaryFields: AnalyticsColumn[], defaultSort: string, notes: readonly string[] = FILTER_NOTES): AnalyticsPlan {
    return { rows, summary, columns, summaryFields, key: "grup", defaultSort, notes };
}

export const observation = (c: AnalyticsContext) => { if (!c.now) throw new Error("Clock laporan belum diberikan."); return new Date(Math.min(c.now.getTime(), c.period.endExclusive.getTime()-1)); };
