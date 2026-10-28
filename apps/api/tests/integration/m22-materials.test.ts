import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { MaterialDetailResponseSchema,MaterialListResponseSchema,MaterialTransactionsResponseSchema } from "@sigm4/schemas";
import type { MaterialDetail } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { MaterialLedgerService } from "../../src/modules/m22-materials/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createAuthContext,setAuthContext,setAmr,AMR_OTP } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb,withTransaction } from "../../src/shared/db/index.js";
import { HealthRegistry,Logger } from "../../src/shared/observability/index.js";
import { PembangkitPdfChromium } from "../../src/shared/pdf/index.js";
import { svgQr } from "../../src/shared/qr/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate,kueri } from "../helpers/db.js";

interface Actor{id:number;role:string;permissions:string[]}
const clock=new FixedClock(new Date("2026-10-14T03:00:00Z")),marker=randomUUID().slice(0,7),origin="https://material.test";
describe.skipIf(!process.env["DATABASE_URL"])("PR-05-15/16/17/23: master Bahan HTTP acceptance",()=>{
 let server:Server,base="",baseAnonim="",room=0,room2=0,category=0,unit=0,counter=0,html="",realPdf=false,admin:Actor,manager:Actor,viewer:Actor,denied:Actor;
 const id=async(query:string)=>Number((await kueri<{id:string}>(query))[0]!.id);
 const actor=async(role:string,permissions:string[]):Promise<Actor>=>({id:await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('Material ${marker}','${randomUUID()}@material.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`),role,permissions});
 const request=async(path:string,who:Actor|null,body?:unknown,key=randomUUID(),method=body===undefined?"GET":"POST")=>fetch(`${who?base:baseAnonim}${path}`,{method,headers:{"content-type":"application/json","Idempotency-Key":key,...(who?{"x-user":String(who.id),"x-role":who.role,"x-permissions":who.permissions.join(",")}: {})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const send=async(path:string,who:Actor|null,body?:unknown,key=randomUUID(),method?:string)=>{const r=await request(path,who,body,key,method);return {status:r.status,json:await r.json() as {success:boolean;data:unknown;error?:{code:string;message:string}}};};
 const body=(nama=`Bahan ${++counter}`)=>({nama,material_category_id:category,satuan_id:unit,room_id_default:room,stok_minimum:5});
 const create=async(b=body()):Promise<MaterialDetail>=>{const r=await send("/materials",manager,b);expect(r.status,JSON.stringify(r.json)).toBe(201);return MaterialDetailResponseSchema.parse(r.json).data;};
 const write=(m:MaterialDetail,delta:number,location=room)=>withTransaction(createAuthContext({userId:manager.id,roleCode:manager.role,scopes:new Map([["material.receive","all"],["material.issue","all"]])}),s=>new MaterialLedgerService(clock,new AuditLogger({clock})).record(s,{materialId:Number(m.id),roomId:location,jenis:delta>0?"PENERIMAAN":"PENGELUARAN",delta,referenceKind:"procurement",referenceId:23}),getDb());
 beforeAll(async()=>{
  dbmate("up");
  manager=await actor("R-02",["material.view","material.manage","material.qr_print","setting.view","setting.manage"]);
  admin=await actor("R-01",manager.permissions);viewer=await actor("R-05",["material.view"]);denied=await actor("R-07",["asset.view"]);
  const building=await id(`INSERT INTO buildings(nama,kode) VALUES ('Bahan','G${marker}') RETURNING id::text`),area=await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Bahan','A${marker}') RETURNING id::text`);
  room=await id(`INSERT INTO rooms(area_id,nama,kode,jenis,kapasitas) VALUES (${area},'Gudang Utama','R${marker}','GUDANG',20) RETURNING id::text`);room2=await id(`INSERT INTO rooms(area_id,nama,kode,jenis,kapasitas) VALUES (${area},'Gudang Cadangan','S${marker}','GUDANG',20) RETURNING id::text`);
  category=await id(`INSERT INTO material_categories(nama,kode) VALUES ('ATK ${marker}','C${marker}') RETURNING id::text`);unit=await id("SELECT id::text FROM material_units WHERE simbol='rim'");
  // Dua pintu ke aplikasi yang sama: `/anon` tanpa AuthContext (kasus 401), pintu biasa selalu memasang konteks.
  const inner=createApp({appBaseUrl:origin,db:getDb(),clock,logger:new Logger({clock,tulis:()=>undefined}),auth:authPalsu(),health:new HealthRegistry(30),pdf:{render:async source=>{html=source;return realPdf?new PembangkitPdfChromium(null).render(source):Buffer.from("%PDF-1.4\n%%EOF");}},security:{objectStorageOrigin:"http://minio:9000"},limiter:{hit:async()=>({lolos:true,batas:10000,sisa:9999,resetDetik:60})}});
  const app=express();app.use("/anon",inner);app.use((req,res,next)=>{setAuthContext(res,createAuthContext({userId:Number(req.header("x-user")),roleCode:req.header("x-role")??"",scopes:new Map((req.header("x-permissions")??"").split(",").filter(Boolean).map(p=>[p,"all" as const]))}));setAmr(res,["pwd",AMR_OTP]);next();},inner);
  server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const host=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;base=`${host}/api/v1`;baseAnonim=`${host}/anon/api/v1`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));});
 it("create starts at zero, does not create assets; replay and payload mismatch are deterministic",async()=>{
  const before=(await kueri<{n:string}>("SELECT count(*)::text n FROM assets"))[0]!.n,b=body("Kertas A4"),key=randomUUID(),r=await send("/materials",manager,b,key),m=MaterialDetailResponseSchema.parse(r.json).data;
  expect(r.status).toBe(201);expect(m).toMatchObject({saldo_total:0,saldo_lokasi:[],satuan_terkunci:false,stok_menipis:true});expect(m.qr_url).toBe(`${origin}/b/${m.uuid}`);
  expect((await send("/materials",manager,b,key)).json).toEqual(r.json);expect((await send("/materials",manager,{...b,nama:"Berbeda"},key)).status).toBe(409);
  expect((await kueri<{n:string}>("SELECT count(*)::text n FROM assets"))[0]!.n).toBe(before);
  expect((await send("/materials",manager,{...b,nama:"kertas a4"})).status).toBe(409);
  for(const extra of [{saldo:5},{uuid:randomUUID()},{stok_minimum:-1},{stok_minimum:1.5}])expect((await send("/materials",manager,{...body(),...extra})).status).toBe(422);
 });
 it("only allowed roles write; QR resolution and stock cards require login + material.view",async()=>{
  const m=await create();expect((await send("/materials",viewer,body())).status).toBe(403);
  for(const p of [`/materials/${m.id}`,`/materials/by-uuid/${m.uuid}`,`/materials/${m.id}/transactions`]){expect((await send(p,null)).status).toBe(401);expect((await send(p,denied)).status).toBe(403);expect((await send(p,viewer)).status).toBe(200);}
  expect((await send(`/public/materials/${m.uuid}`,null)).status).toBe(404);
  expect((await send("/materials/by-uuid/not-a-uuid",viewer)).status).toBe(422);
 });
 it("same UUID in asset and material resolves exclusively within the selected namespace",async()=>{
  const m=await create(),assetCategory=await id(`INSERT INTO asset_categories(nama,kode) VALUES ('ATK ${marker}','C${marker}') RETURNING id::text`);
  await kueri(`INSERT INTO assets(kode_barang,nama,uuid,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi) VALUES ('AST${marker}','Printer','${m.uuid}',${assetCategory},2026,'PEMBELIAN',${room},'BAIK')`);
  const result=await send(`/materials/by-uuid/${m.uuid}`,viewer);expect(MaterialDetailResponseSchema.parse(result.json).data.nama).toBe(m.nama);
  expect((await send(`/assets/by-uuid/${m.uuid}`,viewer)).status).toBe(403);
 });
 it("unit may change before any transaction, then service and SQL forbid it",async()=>{
  const m=await create(),pcs=await id("SELECT id::text FROM material_units WHERE simbol='pcs'");
  expect((await send(`/materials/${m.id}`,manager,{satuan_id:pcs},randomUUID(),"PATCH")).status).toBe(200);await write(m,8);
  const d=MaterialDetailResponseSchema.parse((await send(`/materials/${m.id}`,viewer)).json).data;expect(d.satuan_terkunci).toBe(true);expect(d.satuan.simbol).toBe("pcs");
  expect((await send(`/materials/${m.id}`,manager,{satuan_id:unit},randomUUID(),"PATCH")).status).toBe(422);
  await expect(kueri(`UPDATE materials SET satuan_id=${unit} WHERE id=${m.id}`)).rejects.toMatchObject({code:"23514"});
 });
 it("deactivation with stock preserves balances/history; partial rename keeps NONAKTIF",async()=>{
  const m=await create();await write(m,3);
  expect((await send(`/materials/${m.id}`,manager,{status:"NONAKTIF"},randomUUID(),"PATCH")).status).toBe(200);
  const r=await send(`/materials/${m.id}`,manager,{nama:`Nonaktif ${++counter}`},randomUUID(),"PATCH"),d=MaterialDetailResponseSchema.parse(r.json).data;
  expect(d).toMatchObject({status:"NONAKTIF",saldo_total:3,stok_menipis:false});expect(MaterialTransactionsResponseSchema.parse((await send(`/materials/${m.id}/transactions`,viewer)).json).data).toHaveLength(1);
 });
 it("total minimum is global, stock card is chronological per location and includes source",async()=>{
  const m=await create(body("Multi Gudang"));await write(m,4);await write(m,7,room2);await write(m,-2);
  const d=MaterialDetailResponseSchema.parse((await send(`/materials/${m.id}`,viewer)).json).data;expect(d.saldo_total).toBe(9);expect(d.stok_menipis).toBe(false);expect(d.saldo_lokasi.map(r=>r.saldo).sort()).toEqual([2,7]);
  const card=MaterialTransactionsResponseSchema.parse((await send(`/materials/${m.id}/transactions?per_page=2`,viewer)).json);expect(card.meta).toMatchObject({total:3,total_pages:2});expect(card.data[0]).toMatchObject({jenis:"PENGELUARAN",jumlah:-2,saldo_sesudah:2,referensi_jenis:"procurement",referensi_id:"23",created_at:clock.now().toISOString()});
  const filtered=MaterialTransactionsResponseSchema.parse((await send(`/materials/${m.id}/transactions?room_id=${room2}`,viewer)).json);expect(filtered.data).toHaveLength(1);
  expect(MaterialListResponseSchema.parse((await send("/materials?q=Multi%20Gudang&stok=MENIPIS",viewer)).json).data).toEqual([]);
  await send(`/materials/${m.id}`,manager,{stok_minimum:9},randomUUID(),"PATCH");expect(MaterialListResponseSchema.parse((await send("/materials?q=Multi%20Gudang&stok=MENIPIS",viewer)).json).data).toHaveLength(1);
  await send(`/materials/${m.id}`,manager,{stok_minimum:0},randomUUID(),"PATCH");expect(MaterialListResponseSchema.parse((await send("/materials?q=Multi%20Gudang&stok=MENIPIS",viewer)).json).data).toHaveLength(0);
  expect(MaterialListResponseSchema.parse((await send(`/materials?room_id=${room2}&urut=saldo&per_page=1`,viewer)).json).data[0]?.id).toBe(m.id);
 });
 it("category duplicates, used-category deletion and unused deletion cannot orphan materials",async()=>{
  const b={nama:`Baru ${marker}`,kode:`BAR${marker}`},r=await send("/material-categories",manager,b),c=r.json.data as {id:string};expect(r.status).toBe(201);
  expect((await send("/material-categories",manager,{...b,kode:b.kode.toLowerCase()})).status).toBe(409);
  expect((await send(`/material-categories/${c.id}`,manager,{},randomUUID(),"DELETE")).status).toBe(200);
  const used=await send(`/material-categories/${category}`,manager,{},randomUUID(),"DELETE");expect(used.status).toBe(422);expect(used.json.error?.message).toContain("nonaktif");
  const rows=(await send("/material-categories",viewer)).json.data as {id:string;jumlah_bahan:number}[];expect(rows.find(c=>c.id===String(category))?.jumlah_bahan).toBeGreaterThan(0);
 });
 it("M20 unit management is Admin-only; inactive masters cannot be selected for new materials",async()=>{
  const b={nama:`Karung ${marker}`,simbol:`krg${marker}`};expect((await send("/material-units",manager,b)).status).toBe(403);
  const r=await send("/material-units",admin,b);expect(r.status).toBe(201);const u=r.json.data as {id:string};
  expect((await send("/material-units",admin,b)).status).toBe(409);expect((await send(`/material-units/${u.id}/status`,admin,{status:"NONAKTIF"},randomUUID(),"PATCH")).status).toBe(200);
  expect((await send("/materials",manager,{...body(),satuan_id:Number(u.id)})).status).toBe(422);
  const c=await send("/material-categories",manager,{nama:`Nonaktif ${marker}`,kode:`NA${marker}`,status:"NONAKTIF"});expect((await send("/materials",manager,{...body(),material_category_id:Number((c.json.data as {id:string}).id)})).status).toBe(422);
  await kueri(`UPDATE rooms SET status='NONAKTIF' WHERE id=${room2}`);expect((await send("/materials",manager,{...body(),room_id_default:room2})).status).toBe(422);
 });
 it("PDF prints QR for the material type, escapes names and enforces its own permission/batch limits",async()=>{
  const m=await create(body("Kertas <script>alert(1)</script>")),b={material_ids:[Number(m.id)],tata_letak:"A4_3X8",nama:true};
  expect((await request("/materials/qr/print",viewer,b)).status).toBe(403);const r=await request("/materials/qr/print",manager,b);expect(r.status).toBe(200);expect(r.headers.get("content-type")).toContain("application/pdf");expect(await r.text()).toContain("%PDF");
  expect(html).toContain(svgQr(`${origin}/b/${m.uuid}`));expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");expect(html).not.toContain(svgQr(`${origin}/a/${m.uuid}`));
  for(const ids of [[],[Number(m.id),Number(m.id)],Array.from({length:201},(_,i)=>i+1)])expect((await request("/materials/qr/print",manager,{...b,material_ids:ids})).status).toBe(422);
  expect((await request("/materials/qr/print",manager,{...b,material_ids:[999999999]})).status).toBe(422);
  const audit=await kueri<{aksi:string}>(`SELECT aksi FROM activity_logs WHERE user_id=${manager.id} AND aksi IN ('MATERIAL_CREATED','MATERIAL_DEACTIVATED','MATERIAL_QR_PRINTED','MATERIAL_TRANSACTION_RECORDED')`);expect(new Set(audit.map(r=>r.aksi))).toEqual(new Set(["MATERIAL_CREATED","MATERIAL_DEACTIVATED","MATERIAL_QR_PRINTED","MATERIAL_TRANSACTION_RECORDED"]));
 });
 it("200 material types produce a real PDF within 30 seconds, without per-unit assets",async()=>{
  const before=(await kueri<{n:string}>("SELECT count(*)::text n FROM assets"))[0]!.n;
  const ids=await kueri<{id:string}>(`INSERT INTO materials(nama,material_category_id,satuan_id,room_id_default) SELECT 'Batch ${marker} '||n,${category},${unit},${room} FROM generate_series(1,200) n RETURNING id::text`);
  realPdf=true;const started=performance.now();try{
   const r=await request("/materials/qr/print",manager,{material_ids:ids.map(r=>Number(r.id)),tata_letak:"A4_3X8",nama:true});expect(r.status).toBe(200);const pdf=Buffer.from(await r.arrayBuffer());expect(pdf.subarray(0,8).toString()).toBe("%PDF-1.7");expect(pdf.length).toBeGreaterThan(1000);expect(html.match(/<svg /g)).toHaveLength(200);expect(performance.now()-started).toBeLessThan(30000);
  }finally{realPdf=false;}
  expect((await kueri<{n:string}>("SELECT count(*)::text n FROM assets"))[0]!.n).toBe(before);
 },40000);
});
