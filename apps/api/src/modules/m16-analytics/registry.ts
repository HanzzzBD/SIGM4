import { ANALYTICS_TYPES, AnalyticsColumnSchema } from "@sigm4/schemas";
import type { AnalyticsColumn, AnalyticsQuery, AnalyticsRow, AnalyticsType } from "@sigm4/schemas";
import type { RawBuilder } from "kysely";
import type { AnalyticsAccess } from "./access.js";
import type { ReportPeriod } from "./period.js";
/** Dates belong to period so comparison providers cannot reuse the current input dates. */
export interface AnalyticsContext { readonly query: Omit<AnalyticsQuery, "tanggal_mulai" | "tanggal_selesai">; readonly period: ReportPeriod; readonly access: AnalyticsAccess; readonly now?: Date }
export interface AnalyticsPlan {
    /** Full grouped rowset. The framework derives pagination and total from this SAME rowset. */
    readonly rows: RawBuilder<AnalyticsRow>;
    readonly summary: RawBuilder<AnalyticsRow>;
    readonly columns: readonly AnalyticsColumn[];
    /** Uniquely identifies a group; stable tie-breaker for pagination. */
    readonly key: string;
    readonly defaultSort: string;
    readonly summaryFields: readonly AnalyticsColumn[];
    readonly notes?: readonly string[];
}
export interface AnalyticsProvider { readonly jenis: AnalyticsType; prepare(context: AnalyticsContext): AnalyticsPlan }
/** Providers can be replaced explicitly for contract tests; production uses createAnalyticsProviders. */
export class AnalyticsProviderRegistry {
    private readonly providers = new Map<AnalyticsType, AnalyticsProvider>();
    register(provider: AnalyticsProvider): this {
        if (!ANALYTICS_TYPES.includes(provider.jenis) || this.providers.has(provider.jenis)) throw new Error("Jenis penyedia analitik tidak sah atau sudah terdaftar.");
        this.providers.set(provider.jenis, Object.freeze({ jenis: provider.jenis, prepare: provider.prepare.bind(provider) })); return this;
    }
    get(jenis: AnalyticsType): AnalyticsProvider | undefined { return this.providers.get(jenis); }
}
export function validateColumns(columns: readonly AnalyticsColumn[], access: AnalyticsAccess): AnalyticsColumn[] {
    const parsed = columns.map(c => AnalyticsColumnSchema.parse(c));
    if (new Set(parsed.map(c => c.key)).size !== parsed.length) throw new Error("Kolom laporan tidak unik.");
    for (const c of parsed) if (c.sensitivitas === "ASSET_FINANCIAL" && !access.assetFinancial || c.sensitivitas === "MAINTENANCE_COST" && !access.maintenanceCost) throw new Error("Penyedia mencoba memilih kolom laporan tanpa hak finansial.");
    return parsed;
}
