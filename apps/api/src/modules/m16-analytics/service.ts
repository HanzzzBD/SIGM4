import { AnalyticsPeriodSchema, AnalyticsResponseSchema, AnalyticsRowSchema, AnalyticsQuerySchema, ANALYTICS_TYPES } from "@sigm4/schemas";
import type { AnalyticsQuery, AnalyticsType, AnalyticsColumn, AnalyticsRow } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { Database } from "../../shared/db/index.js";
import { withTransaction } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuthContext } from "../../shared/auth/index.js";
import { isSystemAuthContext } from "../../shared/auth/index.js";
import { DomainError, ForbiddenError } from "../../shared/errors/index.js";
import { ANALYTICS_DEFINITIONS } from "./catalog.js";
import { authorizeAnalytics } from "./access.js";
import { analyticsInvalid, analyticsPeriods } from "./period.js";
import { createAnalyticsProviders } from "./providers/production.js";
import { AnalyticsProviderRegistry, validateColumns } from "./registry.js";
import type { AnalyticsPlan } from "./registry.js";
import { analyticsRepository } from "./repositories/report.repository.js";
const definitionTitle = (jenis: AnalyticsType) => ANALYTICS_DEFINITIONS[jenis].judul;
function validateRow(row: AnalyticsRow, columns: readonly AnalyticsColumn[]) {
    const parsed = AnalyticsRowSchema.parse(row);
    if (Object.keys(parsed).some(key => !columns.some(c => c.key === key))) throw new Error("Kolom di luar kontrak laporan.");
    for (const c of columns) {
        if (!(c.key in parsed)) throw new Error("Kolom laporan wajib tersedia.");
        const value = parsed[c.key]; if (value === null) continue;
        const valid = c.tipe === "NUMBER" ? typeof value === "number" : c.tipe === "BOOLEAN" ? typeof value === "boolean" : c.tipe === "DECIMAL" ? typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value) : c.tipe === "DATE" ? typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) : typeof value === "string";
        if (!valid) throw new Error("Tipe nilai laporan tidak sesuai kontrak.");
    }
    return parsed;
}
export class AnalyticsService {
    constructor(private readonly db: Kysely<Database>, private readonly clock: Clock, private readonly providers: AnalyticsProviderRegistry = createAnalyticsProviders()) {}
    catalog(ctx: AuthContext) {
        if (isSystemAuthContext(ctx) || !ctx.can("report.view") || ctx.roleCode === "R-07" || !["all", "own"].includes(ctx.scopeOf("report.view"))) throw new ForbiddenError();
        return ANALYTICS_TYPES.flatMap(jenis => { let access; try { access = authorizeAnalytics(ctx, jenis); } catch (e) { if (e instanceof ForbiddenError) return []; throw e; }
            // Provider layouts can depend on current permissions; no counts or data are queried here.
            const provider = this.providers.get(jenis), query = AnalyticsQuerySchema.parse({});
            const kolom = provider ? validateColumns(provider.prepare({ query, period: analyticsPeriods(this.clock, query).current, access, now: this.clock.now() }).columns, access) : [];
            return [{ jenis, judul: definitionTitle(jenis), status: provider ? "SIAP" as const : "BELUM_TERSEDIA" as const, filter: [...ANALYTICS_DEFINITIONS[jenis].filters], kolom }];
        });
    }
    async report(ctx: AuthContext, jenis: AnalyticsType, query: AnalyticsQuery, action: "view" | "export" = "view") {
        const access = authorizeAnalytics(ctx, jenis, action), periods = analyticsPeriods(this.clock, query), definition = ANALYTICS_DEFINITIONS[jenis];
        for (const key of ["room_id", "category_id", "work_unit_id", "requester_role"] as const) if (query[key] !== undefined && !definition.filters.includes(key)) throw analyticsInvalid(key, "Filter tidak didukung laporan ini.");
        const provider = this.providers.get(jenis); if (!provider) throw new DomainError("SERVICE_NOT_READY");
        const providerQuery = { room_id: query.room_id, category_id: query.category_id, work_unit_id: query.work_unit_id, requester_role: query.requester_role, bandingkan: query.bandingkan, page: query.page, per_page: query.per_page, sort: query.sort };
        const prepare = (period: typeof periods.current): AnalyticsPlan => {
            const p = provider.prepare({ query: providerQuery, period, access, now: this.clock.now() }), columns = validateColumns(p.columns, access), summaryFields = validateColumns(p.summaryFields, access);
            if (!columns.length || !columns.some(c => c.key === p.key) || !columns.some(c => c.key === p.defaultSort.replace(/^-/, ""))) throw new Error("Layout/sort laporan tidak sah.");
            return { ...p, columns, summaryFields };
        };
        const plan = prepare(periods.current), previous = periods.previous ? prepare(periods.previous) : null, sort = query.sort ?? plan.defaultSort;
        if (previous && JSON.stringify(previous.summaryFields) !== JSON.stringify(plan.summaryFields)) throw new Error("Kontrak ringkasan pembanding harus sama dengan periode utama.");
        if (!plan.columns.some(c => c.key === sort.replace(/^-/, ""))) throw analyticsInvalid("sort", "Kolom pengurutan tidak tersedia pada laporan ini.");
        const result = await withTransaction(ctx, async scope => { await sql`set transaction read only`.execute(scope.tx); await sql`set local statement_timeout='4500ms'`.execute(scope.tx); return analyticsRepository(scope.tx).read(scope.ctx, plan, previous, sort, query.page, query.per_page); }, this.db);
        const total = Number(result.total); if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total laporan melampaui batas kontrak.");
        return AnalyticsResponseSchema.parse({ success: true, data: result.rows.map(r => validateRow(r, plan.columns)), meta: { page: query.page, per_page: query.per_page, total, total_pages: Math.max(1, Math.ceil(total / query.per_page)) }, report: { jenis, judul: definition.judul, periode: AnalyticsPeriodSchema.parse(periods.current), filter: { room_id: query.room_id, category_id: query.category_id, work_unit_id: query.work_unit_id, requester_role: query.requester_role, bandingkan: query.bandingkan === "true" }, zona_waktu: "Asia/Jakarta", dibuat_pada: this.clock.now().toISOString(), kolom: plan.columns, kolom_ringkasan: plan.summaryFields, ...(plan.notes ? {metodologi: plan.notes} : {}), ringkasan: validateRow(result.summary ?? {}, plan.summaryFields), pembanding: previous && periods.previous ? { periode: AnalyticsPeriodSchema.parse(periods.previous), ringkasan: validateRow(result.previous ?? {}, previous.summaryFields) } : null } });
    }
}
