import type { AnalyticsQuery, AnalyticsType } from "@sigm4/schemas";
import type { AuthContext } from "../../shared/auth/index.js";
import type { Clock } from "../../shared/clock/index.js";
import { DomainError } from "../../shared/errors/index.js";
import { authorizeAnalytics } from "./access.js";
import { analyticsPeriods, analyticsInvalid } from "./period.js";
import { validateColumns } from "./registry.js";
import type { AnalyticsProviderRegistry } from "./registry.js";
import { analyticsDataQuery } from "./repositories/report.repository.js";
/** Read-only benchmark tooling obtains the SAME scoped aggregate, summary and complete HTTP statement. */
export function analyticsExplainStatements(ctx: AuthContext, jenis: AnalyticsType, query: AnalyticsQuery, clock: Clock, providers: AnalyticsProviderRegistry) {
    const access = authorizeAnalytics(ctx, jenis), periods = analyticsPeriods(clock, query), provider = providers.get(jenis);
    if (!provider) throw new DomainError("SERVICE_NOT_READY");
    const prepare = (period: typeof periods.current) => { const p = provider.prepare({ query, period, access, now: clock.now() }); return { ...p, columns: validateColumns(p.columns, access), summaryFields: validateColumns(p.summaryFields, access) }; };
    const plan = prepare(periods.current), previous = periods.previous ? prepare(periods.previous) : null, sort = query.sort ?? plan.defaultSort;
    if (!plan.columns.some(c => c.key === sort.replace(/^-/, ""))) throw analyticsInvalid("sort", "Kolom pengurutan tidak sah.");
    return { rows: plan.rows, summary: plan.summary, http: analyticsDataQuery(plan, previous, sort, query.page, query.per_page) };
}
