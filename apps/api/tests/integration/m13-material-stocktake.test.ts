import { randomUUID } from "node:crypto";
import { copyFileSync,mkdtempSync,readdirSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,join,resolve } from "node:path";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import ExcelJS from "exceljs";
import { afterAll,beforeAll,describe,it,expect,vi } from "vitest";
import { MaterialStocktakeItemsSchema,StocktakeResponseSchema } from "@sigm4/schemas";
import type { MaterialStocktakeItem } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { MaterialStocktakeService,StocktakeReportService } from "../../src/modules/m13-audit-stocktake/index.js";
import { MaterialLedgerService } from "../../src/modules/m22-materials/index.js";
import { createAuthContext,setAuthContext,setAmr,AMR_OTP } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb,withTransaction } from "../../src/shared/db/index.js";
import { Logger,HealthRegistry } from "../../src/shared/observability/index.js";
import { PembangkitPdfChromium } from "../../src/shared/pdf/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate,kueri,DIR_MIGRATION } from "../helpers/db.js";

interface Actor{id:number;role:string;permissions:string[]}
const marker=randomUUID().slice(0,7),clock=new FixedClock(new Date("2026-10-14T03:00:00Z")),audit=new AuditLogger({clock}),objects=new Map<string,Buffer>();
const storage:PenyimpananObjek={urlUnduh:async key=>`https://storage.test/${key}`,urlUnggah:async()=>"https://storage.test/upload",info:async()=>null,ambil:async key=>objects.get(key)??null,simpan:async(key,bytes)=>{objects.set(key,bytes);},hapus:async key=>{objects.delete(key);},periksa:async()=>undefined};
describe.skipIf(!process.env["DATABASE_URL"])("PR-05-24: opname Bahan",()=>{
 let server:Server,base="",migrationDirectory:string|undefined,manager:Actor,second:Actor,leader:Actor,outsider:Actor,admin:Actor,room=0,room2=0,category=0,unit=0,counter=0;
 const id=async(query:string)=>Number((await kueri<{id:string}>(query))[0]!.id);
 const context=(a:Actor)=>createAuthContext({userId:a.id,roleCode:a.role,scopes:new Map(a.permissions.map(p=>[p,"all"]))});
 const actor=async(role:string,permissions:string[]):Promise<Actor>=>({id:await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('${role}-${marker}','${randomUUID()}@material-opname.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`),role,permissions});
 const send=async(path:string,a:Actor,body?:unknown,key=randomUUID(),method=body===undefined?"GET":"POST")=>{const r=await fetch(`${base}${path}`,{method,headers:{"content-type":"application/json","x-user":String(a.id),"x-role":a.role,"x-permissions":a.permissions.join(","),"Idempotency-Key":key},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,json:await r.json() as {data:Record<string,unknown>;error?:{code:string;message:string}}};};
 const material=(location=room,status="AKTIF")=>id(`INSERT INTO materials(nama,material_category_id,satuan_id,room_id_default,status) VALUES ('Bahan ${++counter}',${category},${unit},${location},'${status}') RETURNING id::text`);
 const ledger=(m:number,delta:number,location=room)=>withTransaction(context(manager),s=>new MaterialLedgerService(clock,audit).record(s,{materialId:m,roomId:location,jenis:delta>0?"PENERIMAAN":"PENGELUARAN",delta,referenceKind:"fixture",referenceId:1}),getDb());
 const create=async(location=room)=>{const r=await send("/audit-sessions",manager,{domain:"BAHAN",nama:`Opname Bahan ${++counter}`,periode_mulai:"2026-10-14",periode_selesai:"2026-10-20",cakupan:{jenis:"RUANGAN",id:location},pelaksana_ids:[manager.id,second.id]});expect(r.status,JSON.stringify(r.json)).toBe(201);return StocktakeResponseSchema.parse(r.json).data;};
 const rows=async(s:string)=>MaterialStocktakeItemsSchema.parse((await send(`/audit-sessions/${s}/material-items?per_page=500`,manager)).json).data;
 const payload=(i:MaterialStocktakeItem,n=i.saldo_sekarang,note="")=>({client_scan_id:randomUUID(),material_id:Number(i.material_id),room_id:Number(i.room_id),jumlah_fisik:n,basis:{saldo:i.saldo_sekarang,ledger_id:i.ledger_id_sekarang},revision:i.revision,keterangan:note});
 const countAll=async(s:string,change?:{m:number;qty:number;note:string})=>{for(const i of await rows(s)){const r=await send(`/audit-sessions/${s}/material-counts`,manager,payload(i,Number(i.material_id)===change?.m?change.qty:i.saldo_sekarang,Number(i.material_id)===change?.m?change.note:""));expect(r.status,JSON.stringify(r.json)).toBe(200);}};
 const submit=async(s:string)=>{expect((await send(`/audit-sessions/${s}/complete-location`,manager,{room_id:room})).status).toBe(200);expect((await send(`/audit-sessions/${s}/finalize`,manager,{})).status).toBe(200);return send(`/audit-sessions/${s}/submit`,manager,{});};
 beforeAll(async()=>{
  migrationDirectory=mkdtempSync(join(tmpdir(),"sigm4-pr0524-migrations-"));for(const name of readdirSync(DIR_MIGRATION))if(/^\d+.*\.sql$/.test(name)&&Number(name.split("_")[0])<=66)copyFileSync(join(DIR_MIGRATION,name),join(migrationDirectory,name));const migrate=(command:string)=>dbmate("--migrations-dir",migrationDirectory!,command);migrate("up");expect(migrate("down")).toContain("0066");migrate("up");
  manager=await actor("R-02",["audit.view","audit.manage","audit.execute","material.receive","material.issue"]);second=await actor("R-02",manager.permissions);leader=await actor("R-03",["audit.view","audit.approve"]);outsider=await actor("R-02",["audit.execute"]);admin=await actor("R-01",["audit.view","audit.manage","audit.approve"]);
  const g=await id(`INSERT INTO buildings(nama,kode) VALUES ('Opname Bahan','G${marker}') RETURNING id::text`),a=await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${g},'Gudang','A${marker}') RETURNING id::text`);room=await id(`INSERT INTO rooms(area_id,nama,kode,jenis,kapasitas) VALUES (${a},'Gudang A','R${marker}','GUDANG',20) RETURNING id::text`);room2=await id(`INSERT INTO rooms(area_id,nama,kode,jenis,kapasitas) VALUES (${a},'Gudang B','S${marker}','GUDANG',20) RETURNING id::text`);category=await id(`INSERT INTO material_categories(nama,kode) VALUES ('Bahan','C${marker}') RETURNING id::text`);unit=await id("SELECT id::text FROM material_units WHERE simbol='rim'");
  const app=express();app.use((req,res,next)=>{setAuthContext(res,createAuthContext({userId:Number(req.header("x-user")),roleCode:req.header("x-role")!,scopes:new Map((req.header("x-permissions")??"").split(",").filter(Boolean).map(p=>[p,"all" as const]))}));setAmr(res,["pwd",AMR_OTP]);next();});app.use(createApp({appBaseUrl:"https://opname.test",db:getDb(),clock,auth:authPalsu(),logger:new Logger({clock,tulis:()=>undefined}),health:new HealthRegistry(30),penyimpanan:storage,security:{objectStorageOrigin:"https://storage.test"},limiter:{hit:async()=>({lolos:true,batas:10000,sisa:9999,resetDetik:60})}}));server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(migrationDirectory){if(resolve(migrationDirectory)!==join(resolve(tmpdir()),basename(migrationDirectory))||!basename(migrationDirectory).startsWith("sigm4-pr0524-migrations-"))throw new Error("Direktori cleanup bukan fixture");rmSync(migrationDirectory,{recursive:true,force:true});}});
 it("zero targets, inactive positive balances and SQL/API domain separation",async()=>{
  const active=await material(),inactive=await material(room,"NONAKTIF"),emptyInactive=await material(room,"NONAKTIF"),other=await material(room2);await ledger(active,10);await ledger(inactive,2);
  const s=await create(),list=await rows(s.id);expect(list.map(i=>Number(i.material_id)).sort()).toEqual([active,inactive].sort());expect(list.map(i=>i.saldo_sistem)).toEqual([10,2]);
  const zero=await material(),s2=await create(),r2=await rows(s2.id);expect(r2.find(i=>Number(i.material_id)===zero)?.saldo_sistem).toBe(0);expect(r2.some(i=>[emptyInactive,other].includes(Number(i.material_id)))).toBe(false);
  expect((await send(`/audit-sessions/${s.id}/scan`,manager,{client_scan_id:randomUUID(),asset_id:1,room_id:room,kondisi:"BAIK"})).status).toBe(422);expect((await send(`/audit-sessions/${s.id}/items`,manager)).status).toBe(422);
  await expect(kueri(`UPDATE audit_sessions SET domain='ASET' WHERE id=${s.id}`)).rejects.toMatchObject({code:"23514"});await expect(kueri(`UPDATE audit_material_items SET saldo_sistem=9 WHERE session_id=${s.id}`)).rejects.toMatchObject({code:"23514"});
  expect((await send("/audit-sessions",manager,{domain:["BAHAN","ASET"],nama:"Campur",periode_mulai:"2026-10-14",periode_selesai:"2026-10-20",cakupan:{jenis:"SEKOLAH"},pelaksana_ids:[manager.id]})).status).toBe(422);
 });
 it("per-location QR resolver, assignee permissions, duplicate/replay and count bounds",async()=>{
  const s=await create(),item=(await rows(s.id))[0]!,b=payload(item,7,"Sebagian rusak"),key=randomUUID();expect((await send(`/audit-sessions/${s.id}/material-counts`,outsider,b)).status).toBe(404);
  const first=await send(`/audit-sessions/${s.id}/material-counts`,manager,b,key);expect(first.status).toBe(200);expect((await send(`/audit-sessions/${s.id}/material-counts`,manager,b,key)).json).toEqual(first.json);
  const race=await Promise.all([manager,second].map(a=>send(`/audit-sessions/${s.id}/material-counts`,a,{...b,client_scan_id:randomUUID()})));expect(race.every(r=>r.json.data["duplicate"]===true)).toBe(true);
  expect((await send(`/audit-sessions/${s.id}/material-resolve?uuid=${item.uuid}&room_id=${room}`,manager)).status).toBe(200);expect((await send(`/audit-sessions/${s.id}/material-resolve?uuid=${item.uuid}&room_id=${room2}`,manager)).status).toBe(404);
  for(const n of [-1,1.5,2147483648])expect((await send(`/audit-sessions/${s.id}/material-counts`,manager,{...b,client_scan_id:randomUUID(),jumlah_fisik:n})).status).toBe(422);
 });
 it("unmeasured rows never become zero; difference needs explanation; rejection leaves stock intact",async()=>{
  const s=await create();expect((await send(`/audit-sessions/${s.id}/complete-location`,manager,{room_id:room})).status).toBe(422);expect((await send(`/audit-sessions/${s.id}/finalize`,manager,{})).status).toBe(422);
  const item=(await rows(s.id))[0]!;await countAll(s.id,{m:Number(item.material_id),qty:0,note:""});expect((await submit(s.id)).status).toBe(422);
  const counted=(await rows(s.id))[0]!;expect((await send(`/audit-sessions/${s.id}/material-items/${counted.id}/reconcile`,manager,{keterangan:"Stok habis secara fisik",revision:counted.revision},randomUUID(),"PUT")).status).toBe(200);expect((await send(`/audit-sessions/${s.id}/submit`,manager,{})).status).toBe(200);
  expect((await send(`/audit-sessions/${s.id}/approve`,manager,{keputusan:"SETUJU"})).status).toBe(403);expect((await send(`/audit-sessions/${s.id}/approve`,admin,{keputusan:"SETUJU"})).status).toBe(403);
  expect((await send(`/audit-sessions/${s.id}/approve`,leader,{keputusan:"TOLAK",catatan:"Hitung ulang bersama petugas"})).status).toBe(200);expect((await rows(s.id))[0]!.saldo_sekarang).toBe(item.saldo_sekarang);expect(StocktakeResponseSchema.parse((await send(`/audit-sessions/${s.id}`,manager)).json).data.status).toBe("BERJALAN");
 });
 it("new transactions block approval, including net-zero ABA; recount applies delta against current basis",async()=>{
  const m=await material();await ledger(m,10);const s=await create();await countAll(s.id,{m,qty:8,note:"Dua rim rusak"});expect((await submit(s.id)).status).toBe(200);
  await ledger(m,2);await ledger(m,-2);expect((await send(`/audit-sessions/${s.id}/approve`,leader,{keputusan:"SETUJU"})).status).toBe(422);expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM material_transactions WHERE jenis='OPNAME' AND referensi_id=${s.id}`))[0]!.n).toBe("0");
  await send(`/audit-sessions/${s.id}/approve`,leader,{keputusan:"TOLAK",catatan:"Ada transaksi sesudah hitungan"});await ledger(m,5);const fresh=(await rows(s.id)).find(i=>Number(i.material_id)===m)!;expect(fresh).toMatchObject({saldo_sistem:10,saldo_sekarang:15,perlu_hitung_ulang:true});await countAll(s.id,{m,qty:13,note:"Hasil hitung ulang: dua rim rusak"});expect((await submit(s.id)).status).toBe(200);expect((await send(`/audit-sessions/${s.id}/approve`,leader,{keputusan:"SETUJU"})).status).toBe(200);
  expect((await rows(s.id)).find(i=>Number(i.material_id)===m)).toMatchObject({saldo_sistem:10,basis_saldo:15,jumlah_fisik:13,selisih:-2,selisih_snapshot:3,perlu_hitung_ulang:false});
  const txn=await kueri<{jumlah:number;saldo_sesudah:number}>(`SELECT jumlah,saldo_sesudah FROM material_transactions WHERE jenis='OPNAME' AND material_id=${m} AND referensi_id=${s.id}`);expect(txn).toEqual([{jumlah:-2,saldo_sesudah:13}]);expect((await send(`/audit-sessions/${s.id}/material-counts`,manager,payload(fresh,13,"Lagi"))).status).toBe(422);
 });
 it("approved snapshot produces real private PDF/XLSX and later stock does not rewrite reports",async()=>{
  const m=await material(),s=await create();await countAll(s.id,{m,qty:3,note:"Fisik ditemukan di gudang"});expect((await submit(s.id)).status).toBe(200);expect((await send(`/audit-sessions/${s.id}/approve`,leader,{keputusan:"SETUJU"})).status).toBe(200);
  await ledger(m,2);const reports=new StocktakeReportService(getDb(),clock,audit,storage),worker=createSystemAuthContext("material-stocktake-test");await reports.run(worker,s.id,new PembangkitPdfChromium(null));expect((await reports.download(context(leader),s.id)).url).toMatch(/^https:\/\/storage.test\//);const pdf=[...objects.values()].at(-1)!;expect(pdf.subarray(0,8).toString()).toBe("%PDF-1.7");
  const xlsx=await reports.exportXlsx(context(leader),s.id),book=new ExcelJS.Workbook();await book.xlsx.load(xlsx.bytes as unknown as Parameters<typeof book.xlsx.load>[0]);expect(book.getWorksheet("Bahan")).toBeDefined();expect(book.getWorksheet("Aset")).toBeUndefined();const values=book.getWorksheet("Bahan")!.getSheetValues();expect(JSON.stringify(values)).toContain("Fisik ditemukan di gudang");expect((await kueri<{status:string}>(`SELECT status FROM audit_sessions WHERE id=${s.id}`))[0]!.status).toBe("SELESAI");
 });
 it("audit failure rolls back count and dedup checkpoint",async()=>{const s=await create(),item=(await rows(s.id))[0]!,input=payload(item),spy=vi.spyOn(audit,"write").mockRejectedValueOnce(new Error("audit unavailable"));try{await expect(withTransaction(context(manager),scope=>new MaterialStocktakeService(clock,audit).count(scope,s.id,{...input,foto_file_ids:[]}),getDb())).rejects.toThrow("audit unavailable");}finally{spy.mockRestore();}expect((await rows(s.id))[0]!.jumlah_fisik).toBeNull();expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM audit_scans WHERE session_id=${s.id}`))[0]!.n).toBe("0");});
 it("competing approvals apply once; closed rows cannot be edited or deleted even via SQL",async()=>{const m=await material(),s=await create();await countAll(s.id,{m,qty:4,note:"Fisik ditemukan"});expect((await submit(s.id)).status).toBe(200);const results=await Promise.all([1,2].map(()=>send(`/audit-sessions/${s.id}/approve`,leader,{keputusan:"SETUJU"})));expect(results.map(r=>r.status).sort()).toEqual([200,422]);expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM material_transactions WHERE jenis='OPNAME' AND material_id=${m} AND referensi_id=${s.id}`))[0]!.n).toBe("1");await expect(kueri(`UPDATE audit_material_items SET jumlah_fisik=5 WHERE session_id=${s.id}`)).rejects.toMatchObject({code:"23514"});await expect(kueri(`DELETE FROM audit_material_items WHERE session_id=${s.id}`)).rejects.toMatchObject({code:"23514"});});
});
