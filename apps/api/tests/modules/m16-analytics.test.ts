import { describe,it,expect } from "vitest";
import { AnalyticsQuerySchema,AnalyticsExportBodySchema,AnalyticsColumnSchema } from "@sigm4/schemas";
import { AnalyticsProviderRegistry,AnalyticsService,analyticsPeriods,authorizeAnalytics } from "../../src/modules/m16-analytics/index.js";
import type { AnalyticsProvider } from "../../src/modules/m16-analytics/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import type { Database } from "../../src/shared/db/index.js";
import type { Kysely } from "kysely";
const clock=new FixedClock(new Date("2026-10-14T17:30:00Z"));
const ctx=(permissions:Record<string,Scope>,roleCode="R-02")=>createAuthContext({userId:12,roleCode,scopes:new Map(Object.entries(permissions))});
describe("PR-06-01/02 analytics contracts",()=>{
 it("validates paired dates, pagination caps, SQL sort identifiers and rejects unknown input",()=>{
  expect(AnalyticsQuerySchema.parse({})).toEqual({page:1,per_page:25,bandingkan:"false"});
  for(const q of [{tanggal_mulai:"2026-01-01"},{tanggal_mulai:"2026-02-31",tanggal_selesai:"2026-03-01"},{per_page:101},{page:0},{page:1000001},{sort:"count); drop table assets"},{scope:"all"},{user_id:3},{bandingkan:true}])expect(AnalyticsQuerySchema.safeParse(q).success).toBe(false);
  expect(AnalyticsExportBodySchema.safeParse({format:"PDF",filter:{tanggal_mulai:"2020-01-01",tanggal_selesai:"2026-01-01"}}).success).toBe(true);
  expect(AnalyticsExportBodySchema.safeParse({format:"XLSX",filter:{page:1}}).success).toBe(false);
  expect(AnalyticsColumnSchema.safeParse({key:"__proto__",label:"x",tipe:"TEXT",sensitivitas:"PUBLIC"}).success).toBe(false);
 });
 it("uses WIB today and previous adjacent period with exactly equal days",()=>{
  const p=analyticsPeriods(clock,AnalyticsQuerySchema.parse({bandingkan:"true"}));expect(p.current).toMatchObject({tanggal_mulai:"2026-09-16",tanggal_selesai:"2026-10-15",jumlah_hari:30});expect(p.current.start.toISOString()).toBe("2026-09-15T17:00:00.000Z");expect(p.current.endExclusive.toISOString()).toBe("2026-10-15T17:00:00.000Z");expect(p.previous!.endExclusive.toISOString()).toBe(p.current.start.toISOString());expect(p.previous!.jumlah_hari).toBe(30);
  const leap=analyticsPeriods(clock,AnalyticsQuerySchema.parse({tanggal_mulai:"2024-01-01",tanggal_selesai:"2024-12-31"}));expect(leap.current.jumlah_hari).toBe(366);
  for(const q of [{tanggal_mulai:"2024-01-01",tanggal_selesai:"2025-01-01"},{tanggal_mulai:"2026-10-02",tanggal_selesai:"2026-10-01"}])expect(()=>analyticsPeriods(clock,AnalyticsQuerySchema.parse(q))).toThrow();
 });
 it("report permission does not grant a domain or any student access",()=>{
  expect(()=>authorizeAnalytics(createSystemAuthContext("analytics-export"),"kondisi-aset","export")).toThrow("FORBIDDEN");
  expect(()=>authorizeAnalytics(ctx({"report.view":"all"}),"kondisi-aset")).toThrow("FORBIDDEN");
  expect(()=>authorizeAnalytics(ctx({"report.view":"all","asset.view":"all"},"R-07"),"kondisi-aset")).toThrow("FORBIDDEN");
  for(const s of ["assigned","restricted"] as const)expect(()=>authorizeAnalytics(ctx({"report.view":s,"asset.view":"all"}),"kondisi-aset")).toThrow("FORBIDDEN");
  expect(()=>authorizeAnalytics(ctx({"report.view":"all","asset.view":"assigned"}),"kondisi-aset")).toThrow("FORBIDDEN");
  expect(()=>authorizeAnalytics(ctx({"report.view":"all","asset.view":"all"}),"biaya-pemeliharaan")).toThrow("FORBIDDEN");
 });
 it("financial scope own is not widened by report all; export scope cannot widen visibility",()=>{
  expect(authorizeAnalytics(ctx({"report.view":"all","asset.view":"all","asset.view_financial":"own"}),"kondisi-aset").assetFinancial).toBe(false);
  expect(authorizeAnalytics(ctx({"report.view":"own","asset.view":"all","asset.view_financial":"own"}),"kondisi-aset").assetFinancial).toBe(true);
  expect(()=>authorizeAnalytics(ctx({"report.view":"all","asset.view":"all"}),"kondisi-aset","export")).toThrow();
  expect(()=>authorizeAnalytics(ctx({"report.view":"all","report.export":"restricted","asset.view":"all"}),"kondisi-aset","export")).toThrow();
  expect(()=>authorizeAnalytics(ctx({"report.view":"all","asset.view":"all"}),"kondisi-aset").predicate("loans")).toThrow();
 });
 it("catalogue exposes only permitted report definitions; unavailable reports do not return empty fabricated data",async()=>{
  const untouched={transaction:()=>{throw new Error("Unexpected database access");}} as unknown as Kysely<Database>;
  const s=new AnalyticsService(untouched,clock,new AnalyticsProviderRegistry());expect(s.catalog(ctx({"report.view":"all","asset.view":"all"})).map(i=>i.jenis)).toEqual(["kondisi-aset","rekapitulasi-aset"]);
  await expect(s.report(ctx({"report.view":"all","asset.view":"all"}),"kondisi-aset",AnalyticsQuerySchema.parse({}))).rejects.toMatchObject({kode:"SERVICE_NOT_READY"});
  await expect(s.report(ctx({"report.view":"all"}),"kondisi-aset",AnalyticsQuerySchema.parse({}))).rejects.toMatchObject({kode:"FORBIDDEN"});
 });
 it("duplicate providers are rejected, prototype methods remain callable",()=>{class Provider implements AnalyticsProvider{readonly jenis="kondisi-aset";prepare():never{throw new Error("Prepared");}}const p=new Provider(),r=new AnalyticsProviderRegistry().register(p);expect(()=>r.get(p.jenis)!.prepare({} as never)).toThrow("Prepared");expect(()=>r.register(p)).toThrow("sudah terdaftar");});
});
