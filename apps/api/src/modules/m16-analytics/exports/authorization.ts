import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { AuthContext, Scope } from "../../../shared/auth/index.js";
import { createAuthContext, isSystemAuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { authorizeAnalytics } from "../access.js";
import { ANALYTICS_DEFINITIONS, SOURCE_PERMISSIONS } from "../catalog.js";
import type { AnalyticsType } from "@sigm4/schemas";
import { assetExportAccess, assetExportScopeHash } from "../../m04-assets/index.js";
export const accessHash = (ctx: AuthContext, version: string) => createHash("sha256").update(JSON.stringify([ctx.userId, ctx.roleCode, version, [...ctx.permissions].sort().map(p => [p, ctx.scopeOf(p)])])).digest("hex");
/** Fresh SQL permissions, not a cached JWT or serialized worker AuthContext. */
export async function currentExportActor(db: QueryExecutor, ctx: AuthContext, id: number) {
    if (!isSystemAuthContext(ctx) && ctx.userId !== id) throw new ForbiddenError();
    const result = await sql<{ nama: string; kode: string; version: string; grants: [string, string][] }>`select u.nama,r.kode,r.role_version::text version,
        coalesce((select jsonb_agg(jsonb_build_array(p.kode,rp.scope)) from role_permissions rp join permissions p on p.id=rp.permission_id where rp.role_id=r.id),'[]'::jsonb) grants
        from users u join roles r on r.id=u.role_id where u.id=${id} and u.status='AKTIF'`.execute(db);
    const row = result.rows[0]; if (!row) throw new ForbiddenError();
    const scopes = new Map(row.grants.map(([permission, scope]) => [permission, scope.toLowerCase() as Scope]));
    const actor = createAuthContext({ userId: id, roleCode: row.kode, scopes });
    return { ctx: actor, name: row.nama, hash: accessHash(actor, row.version) };
}
export function authorizeExport(ctx: AuthContext, jenis: string) {
    if (jenis === "assets") { assetExportAccess(ctx); return; }
    if (isSystemAuthContext(ctx) || ctx.roleCode === "R-07" || !ctx.can("report.export") || !["own", "all"].includes(ctx.scopeOf("report.export"))) throw new ForbiddenError();
    if (jenis === "reservations" || jenis === "damage-reports") {
        const permission = jenis === "reservations" ? "reservation.view" : "damage.view";
        if (!ctx.can(permission)) throw new ForbiddenError();
        const domain = ctx.scopeOf(permission);
        if (!["all", "own"].includes(domain) && !(jenis === "reservations" && domain === "restricted") && !(jenis === "damage-reports" && domain === "assigned" && ctx.roleCode === "R-04")) throw new ForbiddenError();
        // Match canonical domain access; export own additionally intersects reporter/requester ownership.
        return;
    }
    authorizeAnalytics(ctx, jenis as AnalyticsType, "export");
}
/** Changes in owner/assigned/restricted row membership invalidate an already generated private file. */
export async function exportScopeHash(db: QueryExecutor, ctx: AuthContext, jenis: string): Promise<string> {
    authorizeExport(ctx, jenis);
    if (jenis === "assets") return assetExportScopeHash(db, ctx);
    if (jenis === "reservations" || jenis === "damage-reports") {
        const condition = jenis === "reservations" ? sql`select v.id from reservations v where (${ctx.scopeOf("reservation.view") === "all"} or v.pemohon_id=${ctx.userId}) and (${ctx.scopeOf("report.export") === "all"} or v.pemohon_id=${ctx.userId})`
            : sql`select k.id from damage_reports k where (${ctx.scopeOf("damage.view") === "all"} or ${ctx.roleCode === "R-04" ? sql`exists(select 1 from work_orders w where w.damage_report_id=k.id and w.teknisi_id=${ctx.userId})` : sql`k.pelapor_id=${ctx.userId}`}) and (${ctx.scopeOf("report.export") === "all"} or k.pelapor_id=${ctx.userId})`;
        return (await sql<{ hash: string }>`select encode(digest(coalesce(string_agg(id::text,',' order by id),''),'sha256'),'hex') hash from (${condition}) scope`.execute(db)).rows[0]!.hash;
    }
    const type = jenis as AnalyticsType, def = ANALYTICS_DEFINITIONS[type], access = authorizeAnalytics(ctx, type, "export");
    if (ctx.scopeOf("report.view") === "all" && ctx.scopeOf("report.export") === "all" && def.sources.every(s => ctx.scopeOf(SOURCE_PERMISSIONS[s]) === "all") && (type !== "konsumsi-bahan" || ["R-01", "R-02", "R-03"].includes(ctx.roleCode))) return "all";
    const from = { assets: sql`assets a`, reservations: sql`reservations r`, loans: sql`loans l`, damage: sql`damage_reports d`, maintenance: sql`work_orders w`, procurement: sql`procurements p`, disposal: sql`asset_disposals ds`, material_consumption: sql`material_requests mr` };
    const alias = { assets: "a", reservations: "r", loans: "l", damage: "d", maintenance: "w", procurement: "p", disposal: "ds", material_consumption: "mr" };
    const parts = def.sources.map(s => sql`(select encode(digest(coalesce(string_agg(${sql.ref(`${alias[s]}.id`)}::text,',' order by ${sql.ref(`${alias[s]}.id`)}),''),'sha256'),'hex') from ${from[s]} where ${access.predicate(s)})`);
    return (await sql<{ hash: string }>`select encode(digest(concat_ws(':',${sql.join(parts)}),'sha256'),'hex') hash`.execute(db)).rows[0]!.hash;
}
