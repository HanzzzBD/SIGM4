import { sql } from "kysely";
import type { RawBuilder } from "kysely";
import type { AnalyticsType } from "@sigm4/schemas";
import { assertAuthContext, isSystemAuthContext } from "../../shared/auth/index.js";
import type { AuthContext, Scope } from "../../shared/auth/index.js";
import { ForbiddenError } from "../../shared/errors/index.js";
import { materialRequestReadScopeAll } from "../m22-materials/index.js";
import { ANALYTICS_DEFINITIONS, SOURCE_PERMISSIONS } from "./catalog.js";
import type { AnalyticsSource } from "./catalog.js";
const own = (ctx: AuthContext): Record<AnalyticsSource, RawBuilder<boolean>> => ({
    assets: sql<boolean>`a.penanggung_jawab_id=${ctx.userId}`,
    reservations: sql<boolean>`r.pemohon_id=${ctx.userId}`,
    loans: sql<boolean>`l.peminjam_id=${ctx.userId}`,
    damage: sql<boolean>`d.pelapor_id=${ctx.userId}`,
    maintenance: sql<boolean>`w.teknisi_id=${ctx.userId}`,
    procurement: sql<boolean>`p.pengusul_id=${ctx.userId}`,
    disposal: sql<boolean>`ds.pengusul_id=${ctx.userId}`,
    material_consumption: sql<boolean>`mr.pemohon_id=${ctx.userId}`,
});
const supported = (source: AnalyticsSource, scope: Scope) => scope === "all" || scope === "own" || source === "assets" && scope === "restricted" || ["damage", "maintenance"].includes(source) && scope === "assigned";
export interface AnalyticsAccess {
    readonly assetFinancial: boolean;
    readonly maintenanceCost: boolean;
    readonly restrictedSubjects: boolean;
    readonly restrictedAssets: boolean;
    /** Optional companion statistics are omitted when their domain cannot be read. */
    optionalPredicate(source: "procurement" | "disposal"): RawBuilder<boolean> | null;
    /** Aliases are fixed and documented. Apply to the rowset BEFORE aggregate/count/window/pagination. */
    predicate(source: AnalyticsSource): RawBuilder<boolean>;
}
export function authorizeAnalytics(ctx: AuthContext, jenis: AnalyticsType, action: "view" | "export" = "view"): AnalyticsAccess {
    assertAuthContext(ctx);
    if (isSystemAuthContext(ctx) || ctx.roleCode === "R-07" || !ctx.can("report.view") || action === "export" && !ctx.can("report.export")) throw new ForbiddenError();
    const reportScopes = [ctx.scopeOf("report.view"), ...(action === "export" ? [ctx.scopeOf("report.export")] : [])];
    if (reportScopes.some(s => s !== "all" && s !== "own")) throw new ForbiddenError();
    const definition = ANALYTICS_DEFINITIONS[jenis], predicates = new Map<AnalyticsSource, RawBuilder<boolean>>(), owners = own(ctx);
    let assetOwn = false;
    for (const source of definition.sources) {
        const permission = SOURCE_PERMISSIONS[source];
        if (!ctx.can(permission)) throw new ForbiddenError();
        const scope = ctx.scopeOf(permission); if (!supported(source, scope)) throw new ForbiddenError();
        const conditions: RawBuilder<boolean>[] = [];
        // report own applies to the report's subject, not to every joined dimension.
        // A borrower's own loan may involve an asset owned by somebody else.
        const isOwn = reportScopes.includes("own") && source === definition.primary || scope === "own" || source === "material_consumption" && !materialRequestReadScopeAll(ctx);
        if (isOwn) conditions.push(owners[source]);
        if (source === "assets") { assetOwn = isOwn; if (scope === "restricted") conditions.push(sql<boolean>`a.boleh_dipinjam_siswa=true`); }
        if (scope === "assigned") conditions.push(source === "damage" ? sql<boolean>`exists(select 1 from work_orders aw where aw.damage_report_id=d.id and aw.teknisi_id=${ctx.userId})` : owners.maintenance);
        // Even scope all does not expose somebody else's private draft procurement.
        if (source === "procurement") conditions.push(sql<boolean>`(p.status<>'DRAF' or p.pengusul_id=${ctx.userId})`);
        predicates.set(source, conditions.length ? sql<boolean>`(${sql.join(conditions, sql` and `)})` : sql<boolean>`true`);
    }
    const financial = ctx.can("asset.view_financial") && (ctx.scopeOf("asset.view_financial") === "all" || ctx.scopeOf("asset.view_financial") === "own" && assetOwn);
    const optionalPredicate = (source: "procurement" | "disposal") => {
        const permission = SOURCE_PERMISSIONS[source];
        if (!ctx.can(permission) || !["all", "own"].includes(ctx.scopeOf(permission))) return null;
        const conditions = [reportScopes.includes("own") || ctx.scopeOf(permission) === "own" ? owners[source] : sql<boolean>`true`];
        if (source === "procurement") conditions.push(sql<boolean>`(p.status<>'DRAF' or p.pengusul_id=${ctx.userId})`);
        return sql<boolean>`(${sql.join(conditions, sql` and `)})`;
    };
    return Object.freeze({ assetFinancial: definition.sources.includes("assets") && financial, maintenanceCost: definition.sources.includes("maintenance"), restrictedSubjects: reportScopes.includes("own") || ctx.scopeOf(SOURCE_PERMISSIONS[definition.primary]) !== "all" || definition.primary === "material_consumption" && !materialRequestReadScopeAll(ctx), restrictedAssets: assetOwn || definition.sources.includes("assets") && ctx.scopeOf("asset.view") !== "all", optionalPredicate, predicate: (source: AnalyticsSource) => { const p = predicates.get(source); if (!p) throw new ForbiddenError(); return p; } });
}
