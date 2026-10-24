// Providers below are test-only aggregate probes, not production report calculations.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { sql } from "kysely";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { AnalyticsQuerySchema,AnalyticsResponseSchema,AnalyticsCatalogResponseSchema } from "@sigm4/schemas";
import type { AnalyticsColumn } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { AnalyticsProviderRegistry,AnalyticsService,authorizeAnalytics } from "../../src/modules/m16-analytics/index.js";
import type { AnalyticsProvider } from "../../src/modules/m16-analytics/index.js";
import { createAuthContext,setAuthContext,setAmr,AMR_OTP } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger,HealthRegistry } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate,kueri } from "../helpers/db.js";
const clock=new FixedClock(new Date("2026-10-14T03:00:00Z")),marker=randomUUID().slice(0,7);
interface Actor {id:number;role:string;permissions:Record<string,Scope>}
const publicColumn=(key:string,tipe:"TEXT"|"NUMBER"="NUMBER"):AnalyticsColumn=>({key,label:key,tipe,sensitivitas:"PUBLIC"});
describe.skipIf(!process.env["DATABASE_URL"])("PR-06-01/02 scope before SQL aggregates",()=>{
 let servers:Server[]=[],base:string,unavailable:string,room:string,otherRoom:string,category:string,ownAsset:string,foreignAsset:string,a:Actor,b:Actor,admin:Actor;
 const id=async(q:string)=>(await kueri<{id:string}>(q))[0]!.id;
 const actor=async(role:string,permissions:Record<string,Scope>):Promise<Actor>=>({id:Number(await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Analytics-${marker}','${randomUUID()}@analytics.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`)),role,permissions});
 const ctx=(who:Actor)=>createAuthContext({userId:who.id,roleCode:who.role,scopes:new Map(Object.entries(who.permissions))});
 const send=async(path:string,who=a,origin=base)=>{const r=await fetch(origin+path,{headers:{"x-user":String(who.id),"x-role":who.role,"x-permissions":JSON.stringify(who.permissions)}});return {status:r.status,headers:r.headers,json:await r.json() as unknown};};
 const query="?tanggal_mulai=2026-10-01&tanggal_selesai=2026-10-14&bandingkan=true";
 const provider:AnalyticsProvider={jenis:"kondisi-aset",prepare:({access,period,query:q})=>{
  const financial=access.assetFinancial,columns=[publicColumn("kondisi","TEXT"),publicColumn("jumlah")],summaryFields=[publicColumn("jumlah_aset")];
  if(financial){columns.push({key:"nilai_perolehan",label:"Nilai perolehan",tipe:"DECIMAL",sensitivitas:"ASSET_FINANCIAL"});summaryFields.push({key:"nilai_perolehan",label:"Nilai perolehan",tipe:"DECIMAL",sensitivitas:"ASSET_FINANCIAL"});}
  const data=sql`select a.kondisi ${financial?sql`,a.nilai_perolehan`:sql``} from assets a where ${access.predicate("assets")} and a.category_id=${category} and a.created_at>=${period.start} and a.created_at<${period.endExclusive} and (${q.room_id??null}::bigint is null or a.room_id=${q.room_id??null}) and (${q.category_id??null}::bigint is null or a.category_id=${q.category_id??null})`;
  return {rows:sql`select kondisi,count(*)::int jumlah ${financial?sql`,coalesce(sum(nilai_perolehan),0)::numeric(15,2)::text nilai_perolehan`:sql``} from (${data}) visible group by kondisi`,summary:sql`select count(*)::int jumlah_aset ${financial?sql`,coalesce(sum(nilai_perolehan),0)::numeric(15,2)::text nilai_perolehan`:sql``} from (${data}) visible`,columns,summaryFields,key:"kondisi",defaultSort:"kondisi"};
 }};
 const serve=async(providers?:AnalyticsProviderRegistry)=>{
  const app=express();app.use((req,res,next)=>{setAuthContext(res,ctx({id:Number(req.header("x-user")),role:req.header("x-role")!,permissions:JSON.parse(req.header("x-permissions")??"{}") as Record<string,Scope>}));setAmr(res,["pwd",AMR_OTP]);next();});
  app.use(createApp({appBaseUrl:"https://analytics.test",db:getDb(),clock,logger:new Logger({clock,tulis:()=>undefined}),auth:authPalsu(),health:new HealthRegistry(30),security:{objectStorageOrigin:"http://storage.test"},limiter:{hit:async()=>({lolos:true,batas:1000,sisa:999,resetDetik:60})},analyticsProviders:providers??new AnalyticsProviderRegistry()}));
  const server=createServer(app);servers.push(server);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
 };
 const asset=async(who:Actor,condition="BAIK",date="2026-10-10T03:00:00Z",location=room,value="1.25")=>id(`INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,status,nilai_perolehan,penanggung_jawab_id,created_by,created_at) VALUES ('ANA-${randomUUID()}','Uji agregat',${category},2026,'PEMBELIAN',${location},'${condition}','TERSEDIA',${value},${who.id},${who.id===a.id?b.id:a.id},'${date}') RETURNING id::text`);
 beforeAll(async()=>{
  dbmate("up");a=await actor("R-02",{"report.view":"own","asset.view":"all"});b=await actor("R-03",{"report.view":"all","asset.view":"own"});admin=await actor("R-01",{"report.view":"all","report.export":"all","asset.view":"all","asset.view_financial":"all"});
  const building=await id(`INSERT INTO buildings(nama,kode) VALUES ('Analitik','G${marker}') RETURNING id::text`),area=await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Analitik','A${marker}') RETURNING id::text`);
  room=await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Satu','R${marker}','KELAS') RETURNING id::text`);otherRoom=await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Dua','S${marker}','KELAS') RETURNING id::text`);category=await id(`INSERT INTO asset_categories(nama,kode) VALUES ('Analitik','C${marker}') RETURNING id::text`);
  ownAsset=await asset(a);await asset(a);await asset(a,"RUSAK_RINGAN");await asset(a,"RUSAK_BERAT",undefined,otherRoom);
  foreignAsset=await asset(b,"BAIK",undefined,room,"999999.95");for(let n=0;n<2;n++)await asset(b,"BAIK",undefined,room,"999999.95");
  await asset(a,"BAIK","2026-09-30T17:00:00Z"); // Inclusive WIB start.
  await asset(a,"BAIK","2026-09-30T16:59:59.999Z"); // Previous period.
  await asset(b,"RUSAK_BERAT","2026-09-20T03:00:00Z");
  await asset(a,"HILANG","2026-10-14T17:00:00Z"); // Exclusive next midnight, never current.
  base=await serve(new AnalyticsProviderRegistry().register(provider));unavailable=await serve();
 });
 afterAll(async()=>{for(const s of servers)await new Promise<void>(r=>s.close(()=>r()));servers=[];});
 it("catalogue/domain gates and unavailable production reports are honest; students denied even with permissions",async()=>{
  const catalog=AnalyticsCatalogResponseSchema.parse((await send("/analytics",a,unavailable)).json);expect(catalog.data.map(i=>i.jenis)).toEqual(["kondisi-aset","rekapitulasi-aset"]);expect(catalog.data.every(i=>i.status==="BELUM_TERSEDIA")).toBe(true);
  expect((await send("/analytics/kondisi-aset",a,unavailable)).status).toBe(503);expect((await send("/analytics/kondisi-aset",{...a,permissions:{"report.view":"all"}},unavailable)).status).toBe(403);
  expect((await send("/analytics/kondisi-aset",{...admin,role:"R-07"})).status).toBe(403);expect((await send("/analytics",{...a,permissions:{"asset.view":"all"}})).status).toBe(403);
  const ready=AnalyticsCatalogResponseSchema.parse((await send("/analytics",a)).json);expect(ready.data[0]!.status).toBe("SIAP");expect(ready.data[0]!.kolom.map(c=>c.key)).toEqual(["kondisi","jumlah"]);
 });
 it("three actors see their SQL row scope in rows, totals and previous period, not the creator's assets",async()=>{
  const read=async(who:Actor)=>{const r=await send("/analytics/kondisi-aset"+query,who);expect(r.status,JSON.stringify(r.json)).toBe(200);expect(r.headers.get("cache-control")).toBe("private, no-store");return AnalyticsResponseSchema.parse(r.json);};
  const one=await read(a),two=await read(b),all=await read(admin);expect(one.report.ringkasan.jumlah_aset).toBe(5);expect(two.report.ringkasan.jumlah_aset).toBe(3);expect(all.report.ringkasan.jumlah_aset).toBe(8);
  expect(one.report.pembanding!.ringkasan.jumlah_aset).toBe(1);expect(two.report.pembanding!.ringkasan.jumlah_aset).toBe(1);expect(all.report.pembanding!.ringkasan.jumlah_aset).toBe(2);
  expect(one.meta.total).toBe(3);expect(two.meta.total).toBe(1);expect(one.data.find(r=>r.kondisi==="BAIK")!.jumlah).toBe(3);expect(two.data.find(r=>r.kondisi==="BAIK")!.jumlah).toBe(3);expect(JSON.stringify(one)).not.toContain("999999");
  expect(all.report.ringkasan.nilai_perolehan).toBe("3000006.10");
 });
 it("pagination and filters use the same visible grouped rowset, including empty/out of range pages",async()=>{
  const first=AnalyticsResponseSchema.parse((await send("/analytics/kondisi-aset"+query+"&per_page=1&page=1&sort=-jumlah")).json),second=AnalyticsResponseSchema.parse((await send("/analytics/kondisi-aset"+query+"&per_page=1&page=2&sort=-jumlah")).json);expect(first.meta).toEqual({page:1,per_page:1,total:3,total_pages:3});expect(first.data).toHaveLength(1);expect(first.data[0]!.jumlah).toBe(3);expect(second.meta.total).toBe(3);expect(second.data[0]!.kondisi).not.toBe(first.data[0]!.kondisi);
  const far=AnalyticsResponseSchema.parse((await send("/analytics/kondisi-aset"+query+"&page=9")).json);expect(far.data).toEqual([]);expect(far.meta.total).toBe(3);
  const filtered=AnalyticsResponseSchema.parse((await send("/analytics/kondisi-aset"+query+`&room_id=${otherRoom}`)).json);expect(filtered.meta.total).toBe(1);expect(filtered.report.ringkasan.jumlah_aset).toBe(1);expect(filtered.report.filter.room_id).toBe(Number(otherRoom));
  const foreign=AnalyticsResponseSchema.parse((await send("/analytics/kondisi-aset"+query+`&room_id=${otherRoom}`,b)).json);expect(foreign.data).toEqual([]);expect(foreign.meta.total).toBe(0);expect(foreign.report.ringkasan.jumlah_aset).toBe(0);
 });
 it("financial fields are never in SELECT without a sufficient financial scope; export narrows report all",async()=>{
  const p=provider.prepare({query:AnalyticsQuerySchema.parse({}),period:{tanggal_mulai:"2026-10-01",tanggal_selesai:"2026-10-14",jumlah_hari:14,start:new Date("2026-09-30T17:00:00Z"),endExclusive:new Date("2026-10-14T17:00:00Z")},access:authorizeAnalytics(ctx(a),"kondisi-aset")});
  expect(p.rows.compile(getDb()).sql).not.toContain("nilai_perolehan");expect(p.summary.compile(getDb()).sql).not.toContain("nilai_perolehan");
  const hidden=AnalyticsResponseSchema.parse((await send("/analytics/kondisi-aset"+query,{...admin,permissions:{...admin.permissions,"asset.view_financial":"own"}})).json);expect(hidden.report.kolom.some(c=>c.key==="nilai_perolehan")).toBe(false);expect(hidden.report.ringkasan).not.toHaveProperty("nilai_perolehan");
  const exporter={...a,permissions:{"report.view":"all","report.export":"own","asset.view":"all","asset.view_financial":"own"} as Record<string,Scope>},service=new AnalyticsService(getDb(),clock,new AnalyticsProviderRegistry().register(provider));
  const exported=await service.report(ctx(exporter),"kondisi-aset",AnalyticsQuerySchema.parse({tanggal_mulai:"2026-10-01",tanggal_selesai:"2026-10-14"}),"export");expect(exported.report.ringkasan.jumlah_aset).toBe(5);expect(exported.report.ringkasan.nilai_perolehan).toBe("6.25");
 });
 it("validation denies unsafe sort, unsupported filters, invalid ranges and invented scope",async()=>{
  for(const suffix of ["&per_page=101","&scope=all","&sort=jumlah%3Bdelete","&tanggal_mulai=bad"]){const r=await send("/analytics/kondisi-aset"+query+suffix);expect(r.status).toBe(400);}
  expect((await send("/analytics/kondisi-aset"+query+"&work_unit_id=1")).status).toBe(422);expect((await send("/analytics/kondisi-aset"+query+"&sort=nilai_perolehan")).status).toBe(422);
  expect((await send("/analytics/kondisi-aset?tanggal_mulai=2024-01-01&tanggal_selesai=2026-01-01")).status).toBe(422);
  for(const scope of ["assigned","restricted"] as const)expect((await send("/analytics/kondisi-aset",{...a,permissions:{...a.permissions,"report.view":scope}})).status).toBe(403);
 });
 it("read-only transaction blocks provider writes; declaring unauthorized financial columns fails before execution",async()=>{
  const fn=`analytics_probe_${marker}`;await kueri(`CREATE FUNCTION ${fn}() RETURNS int LANGUAGE plpgsql VOLATILE AS $$ BEGIN UPDATE assets SET nama='Changed' WHERE category_id=${category}; RETURN 1; END $$`);
  const write:AnalyticsProvider={jenis:"kondisi-aset",prepare:c=>({...provider.prepare(c),rows:sql`select 'BAIK'::text kondisi,${sql.raw(fn)}() jumlah`})};
  const service=new AnalyticsService(getDb(),clock,new AnalyticsProviderRegistry().register(write));try{await expect(service.report(ctx(a),"kondisi-aset",AnalyticsQuerySchema.parse({}))).rejects.toThrow("read-only");}finally{await kueri(`DROP FUNCTION ${fn}()`);}expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM assets WHERE category_id=${category} AND nama='Changed'`))[0]!.n).toBe("0");
  const bad:AnalyticsProvider={jenis:"kondisi-aset",prepare:c=>({...provider.prepare(c),columns:[{key:"nilai_perolehan",label:"Nilai",tipe:"DECIMAL",sensitivitas:"ASSET_FINANCIAL"}]})};await expect(new AnalyticsService(getDb(),clock,new AnalyticsProviderRegistry().register(bad)).report(ctx(a),"kondisi-aset",AnalyticsQuerySchema.parse({}))).rejects.toThrow("tanpa hak finansial");
 });
 it("report own follows the subject; domain scope still limits joined asset dimensions",async()=>{
  const context=ctx({...a,permissions:{"report.view":"own","loan.view":"all","asset.view":"all"}}),access=authorizeAnalytics(context,"aktivitas-peminjaman");
  const count=async(p:ReturnType<typeof authorizeAnalytics>)=>Number((await sql<{n:number}>`select count(*)::int n from (values(1::bigint,${a.id}::bigint,${foreignAsset}::bigint),(2::bigint,${b.id}::bigint,${ownAsset}::bigint)) l(id,peminjam_id,asset_id) join assets a on a.id=l.asset_id where ${p.predicate("loans")} and ${p.predicate("assets")}`.execute(getDb())).rows[0]!.n);
  expect(await count(access)).toBe(1);expect(await count(authorizeAnalytics(ctx({...a,permissions:{"report.view":"own","loan.view":"all","asset.view":"own"}}),"aktivitas-peminjaman"))).toBe(0);
 });
});
