import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { AnalyticsPlan } from "../registry.js";
import type { AnalyticsRow } from "@sigm4/schemas";
/** Shared SQL statement used by HTTP and EXPLAIN; only validated plans/sorts are passed here. */
export function analyticsDataQuery(plan: AnalyticsPlan, previous: AnalyticsPlan | null, sort: string, page: number, size: number) {
        const column = sort.replace(/^-/, ""), direction = sort.startsWith("-") ? sql`desc nulls last` : sql`asc nulls last`;
        // FR-16.1: DECIMAL travels as text for precision, but must sort numerically.
        const orderColumn = plan.columns.find(c => c.key === column)?.tipe === "DECIMAL" ? sql`(${sql.ref(column)})::numeric` : sql.ref(column);
        // Only validated provider column keys enter sql.ref; no user-supplied SQL fragments.
        const query = sql<{ total: string; rows: AnalyticsRow[]; summary: AnalyticsRow | null; previous: AnalyticsRow | null }>`
          with dataset as (${plan.rows}), summary as (${plan.summary}), previous as (${previous?.summary ?? sql`select null::jsonb placeholder where false`})
          select (select count(*)::text from dataset) total,
            coalesce((select jsonb_agg(to_jsonb(paged)) from (select * from dataset order by ${orderColumn} ${direction}, ${sql.ref(plan.key)} asc limit ${size} offset ${(page - 1) * size}) paged),'[]'::jsonb) rows,
            (select to_jsonb(summary) from summary) summary,
            (select to_jsonb(previous) from previous) previous`;
        return query;
}
class AnalyticsRepository extends BaseRepository {
    constructor(db: QueryExecutor) { super(db); }
    async read(ctx: AuthContext, plan: AnalyticsPlan, previous: AnalyticsPlan | null, sort: string, page: number, size: number) {
        const result = await analyticsDataQuery(plan, previous, sort, page, size).execute(this.query(ctx)); return result.rows[0]!;
    }
}
export const analyticsRepository = (db: QueryExecutor) => defineRepository(new AnalyticsRepository(db));
