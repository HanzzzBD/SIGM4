import { randomUUID } from "node:crypto";
import { copyFileSync,mkdtempSync,readdirSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,join,resolve } from "node:path";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { MaterialRequestDetailResponseSchema, MaterialRequestListResponseSchema, MaterialReceiptHistoryResponseSchema, ProcurementDetailResponseSchema } from "@sigm4/schemas";
import type { MaterialRequestDetail } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { createAuthContext, setAuthContext, setAmr, AMR_OTP } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { MaterialLedgerService } from "../../src/modules/m22-materials/index.js";
import { EventHandlerRegistry } from "../../src/shared/events/index.js";
import { pasangKonsumenNotifikasi, fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { Logger, HealthRegistry } from "../../src/shared/observability/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { kueri, dbmate, DIR_MIGRATION } from "../helpers/db.js";
import { authPalsu } from "../helpers/auth.js";
interface Actor { id: number; role: string; permissions: string[] }
const marker=randomUUID().slice(0,7),clock=new FixedClock(new Date("2026-10-14T03:00:00Z")),audit=new AuditLogger({clock});
const storage:PenyimpananObjek={urlUnduh:async key=>`https://storage.test/${key}`,urlUnggah:async()=>"https://storage.test/upload",info:async()=>null,ambil:async()=>null,simpan:async()=>undefined,hapus:async()=>undefined,periksa:async()=>undefined};
describe.skipIf(!process.env["DATABASE_URL"])("PR-05-18..22/31 material HTTP transactions",()=>{
 let server:Server,base:string,room:string,otherRoom:string,unit:string,category:string,workUnit:string,teacher:Actor,stranger:Actor,manager:Actor,leader:Actor,admin:Actor,serial=0,migrationDirectory:string|undefined;
 const id=async(q:string)=>(await kueri<{id:string}>(q))[0]!.id;
 const actor=async(role:string,permissions:string[]):Promise<Actor>=>({id:Number(await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('${role}-${marker}','${randomUUID()}@material.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`)),role,permissions});
 const ctx=(a:Actor)=>createAuthContext({userId:a.id,roleCode:a.role,scopes:new Map<string,Scope>(a.permissions.map(p=>{const [name,scope]=p.split(":");return [name!,(scope??"all") as Scope];}))});
 const send=async(path:string,who:Actor,body?:unknown,key=randomUUID(),method=body===undefined?"GET":"POST")=>{const r=await fetch(base+path,{method,headers:{"content-type":"application/json","x-user":String(who.id),"x-role":who.role,"x-permissions":who.permissions.join(","),"Idempotency-Key":key},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,json:await r.json() as {data:MaterialRequestDetail;error?:unknown}};};
 const material=async(qty=30,minimum=2)=>{const m=await id(`INSERT INTO materials(nama,material_category_id,satuan_id,room_id_default,stok_minimum) VALUES ('Kertas ${marker}-${++serial}',${category},${unit},${room},${minimum}) RETURNING id::text`);if(qty)await withTransaction(ctx(manager),s=>new MaterialLedgerService(clock,audit).record(s,{materialId:Number(m),roomId:Number(room),delta:qty,jenis:"PENERIMAAN",referenceKind:"fixture",referenceId:++serial}),getDb());return m;};
 const file=(kind="MATERIAL_RECEIPT_DOCUMENT",who=manager.id,status="CLEAN")=>id(`INSERT INTO stored_files(object_key,mime,ukuran,checksum,scan_status,owner_type,uploaded_by) VALUES ('${randomUUID()}','application/pdf',100,'${"a".repeat(64)}','${status}','${kind}',${who}) RETURNING id::text`);
 const requestBody=(m:string,qty=3,r=room)=>({keperluan:"Kegiatan belajar",items:[{material_id:Number(m),room_id:Number(r),jumlah:qty}]});
 const create=async(m:string,qty=3)=>{const r=await send("/material-requests",teacher,requestBody(m,qty));expect(r.status,JSON.stringify(r.json)).toBe(201);return MaterialRequestDetailResponseSchema.parse(r.json).data;};
 const detail=async(d:MaterialRequestDetail)=>MaterialRequestDetailResponseSchema.parse((await send(`/material-requests/${d.id}`,teacher)).json).data;
 const decision=(d:MaterialRequestDetail,who:Actor,step:number,qty?:number,action="DISETUJUI")=>send(`/approvals/${d.approval_instance_id}/decide`,who,{urutan:step,keputusan:action,catatan:"Sudah diperiksa",...(qty===undefined?{}:{rincian_keputusan:{items:d.items.map(i=>({item_id:Number(i.id),jumlah_disetujui:qty}))}})});
 const issue=(d:MaterialRequestDetail,qty=1)=>({nama_penerima:"Guru kelas",tanggal_serah:"2026-10-14",items:[{item_id:Number(d.items[0]!.id),jumlah:qty}]});
 const saldo=async(m:string)=>Number((await kueri<{saldo:number}>(`SELECT saldo FROM material_balances WHERE material_id=${m} AND room_id=${room}`))[0]?.saldo??0);
 beforeAll(async()=>{
  migrationDirectory=mkdtempSync(join(tmpdir(),"sigm4-pr0518-migrations-"));
  for(const name of readdirSync(DIR_MIGRATION))if(/^\d+.*\.sql$/.test(name)&&Number(name.split("_")[0])<=68)copyFileSync(join(DIR_MIGRATION,name),join(migrationDirectory,name));
  const migrate=(command:string)=>dbmate("--migrations-dir",migrationDirectory!,command);
  migrate("up");expect(migrate("down")).toContain("0068");expect(migrate("down")).toContain("0067");migrate("up");dbmate("up");
  teacher=await actor("R-05",["material.view","material.request","procurement.view:own","procurement.create"]);stranger=await actor("R-05",teacher.permissions);
  manager=await actor("R-02",["material.view","material.receive","material.issue","material.adjust","material.manage","approval.view","approval.decide","approval.view_history","procurement.view","procurement.receive","procurement.approve"]);
  leader=await actor("R-03",["material.view","approval.view","approval.decide","approval.view_history"]);admin=await actor("R-01",[...manager.permissions,"material.request","setting.view","setting.manage"]);
  const building=await id(`INSERT INTO buildings(nama,kode) VALUES ('Bahan','G${marker}') RETURNING id::text`),area=await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'Bahan','A${marker}') RETURNING id::text`);
  room=await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Gudang','R${marker}','GUDANG') RETURNING id::text`);otherRoom=await id(`INSERT INTO rooms(area_id,nama,kode,jenis) VALUES (${area},'Gudang lain','S${marker}','GUDANG') RETURNING id::text`);
  unit=await id(`INSERT INTO material_units(nama,simbol) VALUES ('Rim ${marker}','rim${marker}') RETURNING id::text`);category=await id(`INSERT INTO material_categories(nama,kode) VALUES ('Kertas','C${marker}') RETURNING id::text`);workUnit=await id(`INSERT INTO work_units(nama,kode,jenis) VALUES ('Kelas${marker}','U${marker}','MANAJEMEN') RETURNING id::text`);
  await kueri("UPDATE system_settings SET value='1000000' WHERE key='denda.ambang_blokir'");
  const app=express();app.use((req,res,next)=>{setAuthContext(res,ctx({id:Number(req.header("x-user")),role:req.header("x-role")!,permissions:(req.header("x-permissions")??"").split(",").filter(Boolean)}));setAmr(res,["pwd",AMR_OTP]);next();});
  app.use(createApp({appBaseUrl:"https://material.test",db:getDb(),clock,logger:new Logger({clock,tulis:()=>undefined}),penyimpanan:storage,auth:authPalsu(),health:new HealthRegistry(30).register(fcmCheck(null)),security:{objectStorageOrigin:"https://storage.test"},limiter:{hit:async()=>({lolos:true,batas:10000,sisa:9999,resetDetik:60})}}));server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(migrationDirectory){if(resolve(migrationDirectory)!==join(resolve(tmpdir()),basename(migrationDirectory))||!basename(migrationDirectory).startsWith("sigm4-pr0518-migrations-"))throw new Error("Unsafe fixture cleanup path");rmSync(migrationDirectory,{recursive:true,force:true});}});
 it("requires configured quantity thresholds; equality autoapproves without stock holds; own scope",async()=>{
  const m=await material(10);expect((await send("/material-requests",teacher,requestBody(m))).status).toBe(422);
  await kueri("UPDATE system_settings SET value='3' WHERE key='bahan.ambang_permintaan_default'");const key=randomUUID(),first=await send("/material-requests",teacher,requestBody(m),key);expect(first.status,JSON.stringify(first.json)).toBe(201);const d=MaterialRequestDetailResponseSchema.parse(first.json).data;
  expect(d.status).toBe("DISETUJUI");expect(d.approval_instance_id).toBeNull();expect(d.nomor).toMatch(/^PMB-2026-/);expect(await saldo(m)).toBe(10);expect((await send("/material-requests",teacher,requestBody(m),key)).json.data.id).toBe(d.id);
  expect((await send(`/material-requests/${d.id}`,stranger)).status).toBe(404);expect((await send(`/material-requests/${d.id}`,manager)).status).toBe(200);
  const list=MaterialRequestListResponseSchema.parse((await send("/material-requests?tab=SEMUA",stranger)).json);expect(list.data).toHaveLength(0);
  await expect(kueri(`UPDATE material_request_cycles SET threshold_snapshot='[]' WHERE request_id=${d.id}`)).rejects.toThrow("tidak dapat diubah");
 });
 it("aggregates a material across locations; admin overrides; fallback Petugas approval",async()=>{
  const m=await material();await withTransaction(ctx(manager),s=>new MaterialLedgerService(clock,audit).record(s,{materialId:Number(m),roomId:Number(otherRoom),delta:10,jenis:"PENERIMAAN",referenceKind:"fixture",referenceId:++serial}),getDb());
  const b=requestBody(m,2);b.items.push({material_id:Number(m),room_id:Number(otherRoom),jumlah:2});const r=await send("/material-requests",teacher,b);expect(r.status,JSON.stringify(r.json)).toBe(201);expect(r.json.data.status).toBe("MENUNGGU_PERSETUJUAN");expect(r.json.data.cycles[0]!.thresholds[0]!.jumlah).toBe(4);
  expect((await decision(r.json.data,manager,1)).status).toBe(200);expect((await detail(r.json.data)).status).toBe("DISETUJUI");
  expect((await send(`/materials/${m}/request-threshold`,manager,{batas:5},randomUUID(),"PUT")).status).toBe(403);expect((await send(`/materials/${m}/request-threshold`,admin,{batas:5},randomUUID(),"PUT")).status).toBe(200);
  expect((await create(m,5)).status).toBe("DISETUJUI");expect((await send(`/materials/${m}/request-threshold`,admin,{},randomUUID(),"DELETE")).status).toBe(200);
 });
 it("partial decisions only reduce across levels; malformed decisions and self approval rejected",async()=>{
  const rule=await id("INSERT INTO approval_rules(jenis_pengajuan,kondisi,prioritas) VALUES ('PERMINTAAN_BAHAN','{}',100000) RETURNING id::text");
  for(const [i,a]of [manager,leader].entries())await kueri(`INSERT INTO approval_rule_steps(rule_id,urutan,approver_type,approver_user_id,sla_jam) VALUES (${rule},${i+1},'user',${a.id},8)`);
  const d=await create(await material(),10);expect((await decision(d,teacher,1)).status).toBe(403);
  expect((await send(`/approvals/${d.approval_instance_id}/decide`,manager,{urutan:1,keputusan:"DISETUJUI",catatan:"OK",rincian_keputusan:{items:[]}})).status).toBe(422);
  const ownManager={...manager,permissions:["material.view","approval.view:own","approval.decide"]};
  expect((await send(`/material-requests/${d.id}`,ownManager)).status).toBe(200);
  expect((await decision(d,ownManager,1,6)).status).toBe(200);expect((await send(`/material-requests/${d.id}`,ownManager)).status).toBe(200);expect((await decision(d,leader,2,7)).status).toBe(422);
  const race=await Promise.all([decision(d,leader,2,5),decision(d,leader,2,5)]);expect(race.map(r=>r.status).sort()).toEqual([200,409]);const approved=await detail(d);expect(approved.status).toBe("DISETUJUI_SEBAGIAN");expect(approved.items[0]!.jumlah_disetujui).toBe(5);
  await kueri(`UPDATE approval_rules SET status_aktif=false WHERE id=${rule}`);
 });
 it("revision creates a new immutable cycle using current thresholds; creator and reasons enforced",async()=>{
  const d=await create(await material(),5);expect((await decision(d,manager,1,undefined,"PERLU_REVISI")).status).toBe(200);
  expect((await send(`/material-requests/${d.id}`,{...manager,permissions:[...manager.permissions,"material.request"]},requestBody(d.items[0]!.material_id,2),randomUUID(),"PUT")).status).toBe(422);
  const r=await send(`/material-requests/${d.id}`,teacher,requestBody(d.items[0]!.material_id,2),randomUUID(),"PUT");expect(r.status,JSON.stringify(r.json)).toBe(200);expect(r.json.data.revision).toBe(2);expect(r.json.data.status).toBe("DISETUJUI");expect(r.json.data.cycles).toHaveLength(2);
  expect((await send(`/material-requests/${d.id}/cancel`,teacher,{alasan:" "})).status).toBe(422);expect((await send(`/material-requests/${d.id}/cancel`,stranger,{alasan:"Batal"})).status).toBe(404);expect((await send(`/material-requests/${d.id}/cancel`,admin,{alasan:"Kegiatan batal"})).status).toBe(200);
 });
 it("partial issue records actual quantity and recipient; remaining can close, cannot cancel",async()=>{
  const m=await material(5),d=await create(m);const b=issue(d,1),key=randomUUID();expect((await send(`/material-requests/${d.id}/issue`,teacher,b)).status).toBe(403);
  expect((await send(`/material-requests/${d.id}/issue`,manager,{...b,tanggal_serah:"2026-10-15"})).status).toBe(422);expect((await send(`/material-requests/${d.id}/issue`,manager,{...b,tanggal_serah:"2026-10-13"})).status).toBe(422);
  const r=await send(`/material-requests/${d.id}/issue`,manager,b,key);expect(r.status,JSON.stringify(r.json)).toBe(200);expect(r.json.data.status).toBe("DISERAHKAN_SEBAGIAN");expect(r.json.data.penyerahan[0]!.nama_penerima).toBe("Guru kelas");expect((await send(`/material-requests/${d.id}/issue`,manager,b,key)).json.data.penyerahan).toHaveLength(1);expect(await saldo(m)).toBe(4);
  expect((await send(`/material-requests/${d.id}/cancel`,teacher,{alasan:"Batal"})).status).toBe(422);expect((await send(`/material-requests/${d.id}/close`,manager,{alasan:"Kebutuhan cukup"})).json.data.status).toBe("DITUTUP");expect((await send(`/material-requests/${d.id}/issue`,manager,b)).status).toBe(422);
 });
 it("20 approved requests against stock ten allow ten issues and ten validation errors",async()=>{
  const m=await material(10),requests=await Promise.all(Array.from({length:20},()=>create(m,1)));expect(await saldo(m)).toBe(10);
  const result=await Promise.all(requests.map(d=>send(`/material-requests/${d.id}/issue`,manager,issue(d))));expect(result.filter(r=>r.status===200)).toHaveLength(10);expect(result.filter(r=>r.status===422)).toHaveLength(10);expect(await saldo(m)).toBe(0);
  expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM material_issues WHERE request_id IN (${requests.map(d=>d.id).join(",")})`))[0]!.n).toBe("10");
 });
 it("direct receipts require own CLEAN documents, correct dates and locations; adjustment cannot edit ledger",async()=>{
  const m=await material(0),b={room_id:Number(room),jumlah:10,tanggal_terima:"2026-10-14",nomor_dokumen:"INV-BHN",dokumen:[{file_id:Number(await file()),nama_berkas:"Faktur.pdf"}]};
  for(const bad of [{...b,dokumen:[]},{...b,tanggal_terima:"2026-10-15"},{...b,room_id:2147483647},{...b,dokumen:[{file_id:Number(await file(undefined,teacher.id)),nama_berkas:"Asing.pdf"}]},{...b,dokumen:[{file_id:Number(await file(undefined,manager.id,"PENDING")),nama_berkas:"Pending.pdf"}]}])expect((await send(`/materials/${m}/receipts`,manager,bad)).status).toBe(422);
  const key=randomUUID();expect((await send(`/materials/${m}/receipts`,manager,b,key)).status).toBe(201);expect((await send(`/materials/${m}/receipts`,manager,b,key)).status).toBe(201);expect(await saldo(m)).toBe(10);
  const history=MaterialReceiptHistoryResponseSchema.parse((await send(`/materials/${m}/receipts`,teacher)).json);expect(history.data).toHaveLength(1);expect(history.data[0]!.dokumen[0]!.url).toContain("https://storage.test/");
  const adjustment={room_id:Number(room),arah:"KURANG",jumlah:2,alasan:"Rusak terkena air"};expect((await send(`/materials/${m}/adjustments`,manager,{...adjustment,alasan:""})).status).toBe(422);expect((await send(`/materials/${m}/adjustments`,manager,{...adjustment,jumlah:11})).status).toBe(422);expect((await send(`/materials/${m}/adjustments`,manager,adjustment)).status).toBe(201);expect(await saldo(m)).toBe(8);
  await expect(kueri(`UPDATE material_transactions SET jumlah=1 WHERE material_id=${m}`)).rejects.toThrow();
  const broken=vi.spyOn(AuditLogger.prototype,"write").mockRejectedValueOnce(new Error("Audit unavailable"));try{expect((await send(`/materials/${m}/adjustments`,manager,adjustment)).status).toBe(500);}finally{broken.mockRestore();}expect(await saldo(m)).toBe(8);
 });
 it("M14 maps material at submission, accepts shared invoice, adds stock and creates no asset",async()=>{
  const m=await material(0),b={mode:"AJUKAN",judul:"Beli kertas",work_unit_id:Number(workUnit),tahun_anggaran:2026,prioritas:"SEDANG",justifikasi:"Bahan pembelajaran",items:[{jenis:"BAHAN",material_id:Number(m),nama_barang:"Kertas",spesifikasi:"A4",jumlah:12,satuan:`rim${marker}`,estimasi_harga_satuan:5000}]};
  expect((await send("/procurements",teacher,{...b,items:[{...b.items[0],material_id:undefined}]})).status).toBe(422);expect((await send("/procurements",teacher,{...b,items:[{...b.items[0],satuan:"pak"}]})).status).toBe(422);
  const result=await send("/procurements",teacher,b);expect(result.status,JSON.stringify(result.json)).toBe(201);const p=ProcurementDetailResponseSchema.parse(result.json).data;
  expect((await send(`/approvals/${p.approval_instance_id}/decide`,manager,{urutan:1,keputusan:"DISETUJUI",catatan:"Diperlukan"})).status).toBe(200);
  const invoice={tanggal_terima:"2026-10-14",nomor_dokumen:"INV-PGD",dokumen:[{file_id:Number(await file("PROCUREMENT_RECEIPT_DOCUMENT")),nama_berkas:"Faktur.pdf",jenis:"FAKTUR"}],items:[{item_id:Number(p.items[0]!.id),jumlah:12,status:"DITERIMA",room_id:Number(room)}]};
  expect((await send(`/procurements/${p.id}/receipts`,{...manager,permissions:manager.permissions.filter(x=>x!=="material.receive")},invoice)).status).toBe(403);
  const key=randomUUID(),r=await send(`/procurements/${p.id}/receipts`,manager,invoice,key);expect(r.status,JSON.stringify(r.json)).toBe(200);const received=ProcurementDetailResponseSchema.parse(r.json).data;expect(received.penerimaan[0]!.items[0]!.assets).toHaveLength(0);expect(received.penerimaan[0]!.items[0]!.bahan?.material_id).toBe(m);expect(await saldo(m)).toBe(12);expect((await send(`/procurements/${p.id}/receipts`,manager,invoice,key)).status).toBe(200);expect(await saldo(m)).toBe(12);
  expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM assets WHERE procurement_id=${p.id}`))[0]!.n).toBe("0");
  const event=(await kueri<{payload:{jumlah:number;bahan:string}}>(`SELECT payload FROM event_outbox WHERE event_name='ProcurementReceived' AND aggregate_id=${p.id}`))[0]!;
  expect(event.payload.jumlah).toBe(12);expect(event.payload.bahan).toContain(`12 rim${marker}`);
 });
 it("outbox request and issue notification replay is idempotent and includes units",async()=>{
  const d=await create(await material(),1);expect((await send(`/material-requests/${d.id}/issue`,manager,issue(d))).status).toBe(200);
  const registry=new EventHandlerRegistry();pasangKonsumenNotifikasi(registry,{db:getDb,clock,ctx:()=>createSystemAuthContext("material-tests")});
  const events=await kueri<{id:string;event_name:string;aggregate_id:string;payload:unknown}>(`SELECT id::text,event_name,aggregate_id::text,payload FROM event_outbox WHERE aggregate_type='material_request' AND aggregate_id=${d.id}`);
  for(const e of events){const h=registry.handlersFor(e.event_name)[0];if(h){const event={id:e.id,name:e.event_name,aggregateType:"material_request",aggregateId:e.aggregate_id,payload:e.payload,actorId:null,requestId:null,occurredAt:clock.now(),attempts:0};await h(event);await h(event);}}
  const rows=await kueri<{kode:string;isi:string}>(`SELECT kode,isi FROM notifications WHERE user_id=${teacher.id} AND referensi_jenis='material_request' AND referensi_id=${d.id} ORDER BY kode`);expect(rows.map(r=>r.kode)).toEqual(["NT-50","NT-51"]);expect(rows[1]!.isi).toContain(`rim${marker}`);
 });
 it("new approval cycles retain old snapshots; an applicant cannot approve own request",async()=>{
  const m=await material(),d=await create(m,5);expect((await decision(d,manager,1,undefined,"PERLU_REVISI")).status).toBe(200);
  const revision=await send(`/material-requests/${d.id}`,teacher,requestBody(m,6),randomUUID(),"PUT");expect(revision.status).toBe(200);expect(revision.json.data.approval_instance_id).not.toBe(d.approval_instance_id);expect(revision.json.data.cycles.map(c=>c.thresholds[0]!.jumlah)).toEqual([5,6]);
  const self=await send("/material-requests",{...manager,permissions:[...manager.permissions,"material.request"]},requestBody(m,5));expect(self.status).toBe(201);expect((await decision(self.json.data,manager,1)).status).toBe(403);
 });
 it("multi-material issue rolls back every line on shortage; mixed procurement creates only asset units",async()=>{
  const first=await material(5),second=await material(2),b=requestBody(first,2);b.items.push({material_id:Number(second),room_id:Number(room),jumlah:2});const result=await send("/material-requests",teacher,b);expect(result.status).toBe(201);const d=result.json.data;
  expect((await send(`/materials/${second}/adjustments`,manager,{room_id:Number(room),arah:"KURANG",jumlah:2,alasan:"Rusak"})).status).toBe(201);
  const failed=await send(`/material-requests/${d.id}/issue`,manager,{...issue(d),items:d.items.map(i=>({item_id:Number(i.id),jumlah:2}))});expect(failed.status).toBe(422);expect(await saldo(first)).toBe(5);expect((await detail(d)).penyerahan).toHaveLength(0);
  const assetCategory=await id(`INSERT INTO asset_categories(nama,kode) VALUES ('Campur','X${marker}') RETURNING id::text`),m=await material(0),proposal={mode:"AJUKAN",judul:"Pengadaan campuran",work_unit_id:Number(workUnit),tahun_anggaran:2026,prioritas:"SEDANG",justifikasi:"Kebutuhan kelas",items:[{jenis:"ASET",nama_barang:"Kursi",category_id:Number(assetCategory),spesifikasi:"Kayu",jumlah:2,satuan:"unit",estimasi_harga_satuan:100},{jenis:"BAHAN",material_id:Number(m),nama_barang:"Kertas",spesifikasi:"A4",jumlah:5,satuan:`rim${marker}`,estimasi_harga_satuan:10}]};
  const response=await send("/procurements",teacher,proposal);expect(response.status).toBe(201);const p=ProcurementDetailResponseSchema.parse(response.json).data;
  expect((await send(`/approvals/${p.approval_instance_id}/decide`,manager,{urutan:1,keputusan:"DISETUJUI",catatan:"Sesuai"})).status).toBe(200);
  const invoice={tanggal_terima:"2026-10-14",nomor_dokumen:"INV-MIX",dokumen:[{file_id:Number(await file("PROCUREMENT_RECEIPT_DOCUMENT")),nama_berkas:"Faktur.pdf",jenis:"FAKTUR"}],items:p.items.map(i=>({item_id:Number(i.id),jumlah:i.jumlah_diusulkan,status:"DITERIMA",room_id:Number(room),...(i.jenis==="ASET"?{kondisi:"BAIK",nilai_perolehan:100}:{})}))};
  const accepted=await send(`/procurements/${p.id}/receipts`,manager,invoice);expect(accepted.status,JSON.stringify(accepted.json)).toBe(200);expect(await saldo(m)).toBe(5);expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM assets WHERE procurement_id=${p.id}`))[0]!.n).toBe("2");
 });
});
