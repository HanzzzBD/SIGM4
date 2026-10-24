import { sql } from "kysely";
import { AnalyticsExportBodySchema, AnalyticsRowSchema, ReservationExportBodySchema, ReservationListQuerySchema, DamageExportBodySchema, DamageReportListQuerySchema } from "@sigm4/schemas";
import type { AnalyticsType, AnalyticsRow, AnalyticsColumn } from "@sigm4/schemas";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import { reservationExportRows } from "../../m07-reservation-room/index.js";
import { damageExportRows } from "../../m11-damage-reports/index.js";
import { ANALYTICS_DEFINITIONS } from "../catalog.js";
import { analyticsInvalid, analyticsPeriods } from "../period.js";
import { authorizeAnalytics } from "../access.js";
import { validateColumns } from "../registry.js";
import type { AnalyticsProviderRegistry, AnalyticsPlan } from "../registry.js";
import type { ExportDataset } from "./model.js";
import { exportColumn as col, wibTime } from "./model.js";
import { authorizeExport } from "./authorization.js";
import { AssetExportBodySchema, AssetExportFilterSchema } from "@sigm4/schemas";
import { assetExportDataset } from "../../m04-assets/index.js";
export function validateExportFilter(ctx: AuthContext, jenis: string, body: unknown, clock: Clock, providers: AnalyticsProviderRegistry) {
    authorizeExport(ctx, jenis);
    if (jenis === "assets") return AssetExportBodySchema.parse(body);
    if (jenis === "reservations") return ReservationExportBodySchema.parse(body);
    if (jenis === "damage-reports") return DamageExportBodySchema.parse(body);
    const parsed = AnalyticsExportBodySchema.parse(body), query = { ...parsed.filter, page: 1, per_page: 25 };
    const periods = analyticsPeriods(clock, query, 1830);
    const anniversary = new Date(`${periods.current.tanggal_mulai}T00:00:00Z`); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 5);
    if (Date.parse(`${periods.current.tanggal_selesai}T00:00:00Z`) >= anniversary.getTime()) throw analyticsInvalid("tanggal_selesai", "Rentang ekspor maksimal lima tahun.");
    const type = jenis as AnalyticsType;
    for (const key of ["room_id", "category_id", "work_unit_id", "requester_role"] as const) if (query[key] !== undefined && !ANALYTICS_DEFINITIONS[type].filters.includes(key)) throw analyticsInvalid(key, "Filter tidak didukung laporan ini.");
    const provider = providers.get(type); if (!provider) throw new DomainError("SERVICE_NOT_READY");
    const plan = provider.prepare({ query, period: periods.current, now: clock.now(), access: authorizeAnalytics(ctx, type, "export") });
    validateColumns(plan.columns, authorizeAnalytics(ctx, type, "export"));
    if (query.sort && !plan.columns.some(c => c.key === query.sort!.replace(/^-/, ""))) throw analyticsInvalid("sort", "Kolom pengurutan tidak tersedia.");
    return parsed;
}
const validatedRow = (r: AnalyticsRow, columns: readonly AnalyticsColumn[]) => {
    const parsed = AnalyticsRowSchema.parse(r);
    if (Object.keys(parsed).length !== columns.length || columns.some(c => !(c.key in parsed))) throw new Error("Kontrak kolom ekspor tidak sesuai.");
    for (const c of columns) { const v = parsed[c.key]; if (v === null) continue;
        if (c.tipe === "DECIMAL" && (typeof v !== "string" || !/^-?\d+(\.\d+)?$/.test(v)) || c.tipe === "NUMBER" && typeof v !== "number" || c.tipe === "BOOLEAN" && typeof v !== "boolean" || ["TEXT", "DATE"].includes(c.tipe) && typeof v !== "string") throw new Error("Tipe kolom ekspor tidak sesuai.");
    } return parsed;
};
export async function readExportDataset(scope: TransactionScope, jenis: string, filter: unknown, limit: number, clock: Clock, providers: AnalyticsProviderRegistry): Promise<ExportDataset> {
    if (jenis === "assets") return assetExportDataset(scope, AssetExportFilterSchema.parse(filter), limit);
    if (jenis === "reservations") {
        const query = ReservationListQuerySchema.parse({ ...(filter as object), page: 1, per_page: 25 });
        if (scope.ctx.scopeOf("report.export") === "own") {
            if (query.pemohon !== undefined && query.pemohon !== "saya" && query.pemohon !== scope.ctx.userId) return { columns: reservationColumns, rows: [] };
            query.pemohon = "saya";
        }
        const rows = await reservationExportRows(scope, query, limit);
        return { columns: reservationColumns, rows: rows.map(r => ({ nomor: r.nomor, jenis: r.jenis, kegiatan: r.nama_kegiatan, ruangan: r.ruangan, pemohon: r.pemohon, mulai: wibTime(r.waktu_mulai), selesai: wibTime(r.waktu_selesai), status: r.status, diajukan: wibTime(r.created_at), jumlah_tanggal: Number(r.jumlah_tanggal) })) };
    }
    if (jenis === "damage-reports") {
        const query = DamageReportListQuerySchema.parse({ ...(filter as object), page: 1, per_page: 25 });
        const rows = await damageExportRows(scope, query, limit, clock);
        return { columns: damageColumns, rows: rows.map(r => ({ nomor: r.nomor, objek: r.asset_id === null ? r.ruangan : r.aset_nama, kode_aset: r.kode_barang, lokasi: [r.ruangan, r.gedung].filter(Boolean).join(", "), pelapor: r.pelapor_nama, urgensi: r.urgensi, status: r.status, dilaporkan: wibTime(r.created_at), diverifikasi: wibTime(r.diverifikasi_pada), batas_sla: wibTime(r.batas_sla), melampaui_sla: r.melampaui_sla })) };
    }
    const type = jenis as AnalyticsType, query = { ...AnalyticsExportBodySchema.parse({ format: "XLSX", filter }).filter, page: 1, per_page: 25 };
    const access = authorizeAnalytics(scope.ctx, type, "export"), periods = analyticsPeriods(clock, query, 1830), provider = providers.get(type);
    if (!provider) throw new DomainError("SERVICE_NOT_READY");
    const prepare = (period: typeof periods.current): AnalyticsPlan => { const p = provider.prepare({ query, period, access, now: clock.now() }); return { ...p, columns: validateColumns(p.columns, access), summaryFields: validateColumns(p.summaryFields, access) }; };
    const plan = prepare(periods.current), previous = periods.previous ? prepare(periods.previous) : null, sort = query.sort ?? plan.defaultSort;
    if (!plan.columns.some(c => c.key === plan.key) || !plan.columns.some(c => c.key === sort.replace(/^-/, ""))) throw new Error("Urutan ekspor tidak sah.");
    if (previous && JSON.stringify(previous.summaryFields) !== JSON.stringify(plan.summaryFields)) throw new Error("Ringkasan pembanding tidak sesuai.");
    const result = (await sql<{ rows: AnalyticsRow[]; summary: AnalyticsRow; previous: AnalyticsRow | null }>`with dataset as (${plan.rows}), summary as (${plan.summary}), previous as (${previous?.summary ?? sql`select null::jsonb placeholder where false`})
        select coalesce((select jsonb_agg(to_jsonb(t)) from (select * from dataset order by ${sql.ref(sort.replace(/^-/, ""))} ${sort.startsWith("-") ? sql`desc nulls last` : sql`asc nulls last`}, ${sql.ref(plan.key)} asc limit ${limit + 1}) t),'[]'::jsonb) rows,
        (select to_jsonb(summary) from summary) summary,(select to_jsonb(previous) from previous) previous`.execute(scope.tx)).rows[0]!;
    const label = (p: typeof periods.current) => `${p.tanggal_mulai} s.d. ${p.tanggal_selesai} (WIB)`;
    return { columns: plan.columns, rows: result.rows.map(r => validatedRow(r, plan.columns)), summary: validatedRow(result.summary, plan.summaryFields), summaryColumns: plan.summaryFields, period: label(periods.current), comparison: previous && periods.previous && result.previous ? { period: label(periods.previous), summary: validatedRow(result.previous, previous.summaryFields) } : null };
}
const reservationColumns = [col("nomor", "Nomor"), col("jenis", "Jenis"), col("kegiatan", "Kegiatan"), col("ruangan", "Ruangan"), col("pemohon", "Pemohon"), col("mulai", "Mulai WIB"), col("selesai", "Selesai WIB"), col("status", "Status"), col("diajukan", "Diajukan WIB"), col("jumlah_tanggal", "Jumlah tanggal berulang", "NUMBER")];
const damageColumns = [col("nomor", "Nomor"), col("objek", "Objek"), col("kode_aset", "Kode aset"), col("lokasi", "Lokasi"), col("pelapor", "Pelapor"), col("urgensi", "Urgensi"), col("status", "Status"), col("dilaporkan", "Dilaporkan WIB"), col("diverifikasi", "Diverifikasi WIB"), col("batas_sla", "Batas SLA WIB"), col("melampaui_sla", "Melewati SLA", "BOOLEAN")];
