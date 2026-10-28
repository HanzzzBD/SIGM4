import { randomUUID } from "node:crypto";
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { ProcurementDetail } from "@sigm4/schemas";
import { ProcurementDetailResponseSchema } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { pasangKonsumenNotifikasi, fcmCheck } from "../../src/modules/m17-notifications/index.js";
import { createAuthContext, setAuthContext, setAmr, AMR_OTP } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import type { PenyimpananObjek } from "../../src/shared/storage/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate, kueri, DIR_MIGRATION } from "../helpers/db.js";

// Run this acceptance suite on the disposable database runner, never application data.
interface Actor { id: number; role: string; permissions: string[] }
const clock = new FixedClock(new Date("2026-10-14T03:00:00Z")), marker = randomUUID().slice(0, 7);
const storage:PenyimpananObjek={urlUnduh:async key=>`https://storage.test/${key}`,urlUnggah:async()=>"https://storage.test/upload",info:async()=>null,ambil:async()=>Buffer.alloc(0),simpan:async()=>undefined,hapus:async()=>undefined,periksa:async()=>undefined};
const logger = new Logger({ clock, tulis: () => undefined });
describe.skipIf(!process.env["DATABASE_URL"])("PR-03-17/18/19: procurement HTTP acceptance", () => {
 let server: Server, base = "", category = "", room = "", unit = "", requester: Actor, other: Actor, manager: Actor, second: Actor;
 let migrationDirectory: string | undefined;
 const id = async (query: string) => (await kueri<{id:string}>(query))[0]!.id;
 const actor = async (role:string, permissions:string[]) => ({id:Number(await id(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('${marker}','${randomUUID()}@pgd.test','x','${randomUUID()}',(SELECT id FROM roles WHERE kode='${role}'),'AKTIF',false) RETURNING id::text`)),role,permissions});
 const send = async(path:string,who:Actor,body?:unknown,key=randomUUID(),method=body===undefined?"GET":"POST") => {
  const r=await fetch(`${base}${path}`,{method,headers:{"content-type":"application/json","x-user":String(who.id),"x-role":who.role,"x-permissions":who.permissions.join(","),"Idempotency-Key":key},...(body===undefined?{}:{body:JSON.stringify(body)})});
  return {status:r.status,json:await r.json() as {data:ProcurementDetail;meta:{total:number};error?:unknown}};
 };
 const body=(mode="AJUKAN",jumlah=10,year=2026)=>({mode,judul:"Kursi laboratorium",work_unit_id:Number(unit),tahun_anggaran:year,prioritas:"TINGGI",justifikasi:"Kursi lama rusak",items:[{jenis:"ASET",nama_barang:"Kursi",category_id:Number(category),spesifikasi:"Kayu",jumlah,satuan:"unit",estimasi_harga_satuan:123.45}]});
 const create=async(mode="AJUKAN",jumlah=10,year=2026)=>{const r=await send("/procurements",requester,body(mode,jumlah,year));expect(r.status,JSON.stringify(r.json)).toBe(201);return ProcurementDetailResponseSchema.parse(r.json).data;};
 const decide=(p:ProcurementDetail,who:Actor,urutan:number,keputusan="DISETUJUI",jumlah?:number,catatan="Kebutuhan sudah diperiksa")=>send(`/approvals/${p.approval_instance_id}/decide`,who,{urutan,keputusan,catatan,...(jumlah===undefined?{}:{rincian_keputusan:{items:p.items.map(item=>({item_id:Number(item.id),jumlah_disetujui:jumlah}))}})});
 const approve=async(p:ProcurementDetail)=>{expect((await decide(p,manager,1)).status).toBe(200);expect((await decide(p,second,2)).status).toBe(200);return (await send(`/procurements/${p.id}`,manager)).json.data;};
 const file=(kind="PROCUREMENT_RECEIPT_DOCUMENT",owner=manager.id,status="CLEAN")=>id(`INSERT INTO stored_files(object_key,mime,ukuran,checksum,scan_status,owner_type,uploaded_by) VALUES ('${randomUUID()}','${kind==='PROCUREMENT_REJECTION_PHOTO'?'image/jpeg':'application/pdf'}',100,'${"a".repeat(64)}','${status}','${kind}',${owner}) RETURNING id::text`);
 const receipt=async(p:ProcurementDetail,jumlah:number,rejected=false)=>({tanggal_terima:"2026-10-14",nomor_dokumen:`INV-${randomUUID()}`,dokumen:[{file_id:Number(await file()),nama_berkas:"Faktur.pdf",jenis:"FAKTUR"}],items:[{item_id:Number(p.items[0]!.id),jumlah,status:rejected?"DITOLAK_SAAT_PENERIMAAN":"DITERIMA",...(rejected?{alasan:"Tidak sesuai spesifikasi",foto_file_ids:[Number(await file("PROCUREMENT_REJECTION_PHOTO"))]}:{room_id:Number(room),nilai_perolehan:120,kondisi:"BAIK"})}]});
 beforeAll(async()=>{
  // Pin rollback to this PR's expand migration even when another session adds 0063+.
  migrationDirectory=mkdtempSync(join(tmpdir(),"sigm4-pr0317-migrations-"));
  for(const name of readdirSync(DIR_MIGRATION))if(/^\d+.*\.sql$/.test(name)&&Number(name.split("_")[0])<=62)copyFileSync(join(DIR_MIGRATION,name),join(migrationDirectory,name));
  const migrate=(command:string)=>dbmate("--migrations-dir",migrationDirectory!,command);
  const later=(await kueri<{n:string}>("SELECT count(*)::text n FROM information_schema.tables WHERE table_name='procurement_receipt_materials'"))[0]!.n!=="0";
  migrate("up");
  // Exercise rollback before creating any procurement business data.
  if(!later){expect(migrate("down")).toContain("0062"); expect((await kueri<{n:string}>("SELECT count(*)::text n FROM information_schema.tables WHERE table_name='procurements'"))[0]!.n).toBe("0"); migrate("up");}dbmate("up");
  requester=await actor("R-05",["procurement.create","procurement.view:own","approval.view:own","asset.view"]);other=await actor("R-05",requester.permissions);
  manager=await actor("R-02",["procurement.create","procurement.view","procurement.approve","procurement.receive","approval.view","approval.decide","asset.view","asset.view_financial","asset_document.view"]);
  second=await actor("R-03",["procurement.view:own","procurement.approve","approval.view","approval.decide"]);
  const building=await id(`INSERT INTO buildings(nama,kode) VALUES ('PGD','G${marker}') RETURNING id::text`),area=await id(`INSERT INTO areas(building_id,nama,kode) VALUES (${building},'PGD','A${marker}') RETURNING id::text`);
  room=await id(`INSERT INTO rooms(area_id,nama,kode,jenis,kapasitas) VALUES (${area},'PGD','R${marker}','KELAS',20) RETURNING id::text`);
  category=await id(`INSERT INTO asset_categories(nama,kode) VALUES ('Kursi','C${marker}') RETURNING id::text`);unit=await id(`INSERT INTO work_units(nama,kode,jenis) VALUES ('PGD${marker}','U${marker}','MANAJEMEN') RETURNING id::text`);
  await kueri("UPDATE approval_rules SET status_aktif=false WHERE jenis_pengajuan='PENGADAAN_BARANG'");
  const rule=await id("INSERT INTO approval_rules(jenis_pengajuan,kondisi,prioritas) VALUES ('PENGADAAN_BARANG','{}',1000) RETURNING id::text");
  for(const [i,who] of [manager,second].entries())await kueri(`INSERT INTO approval_rule_steps(rule_id,urutan,approver_type,approver_user_id,sla_jam) VALUES (${rule},${i+1},'user',${who.id},8)`);
  const app=express();app.use((req,res,next)=>{setAuthContext(res,createAuthContext({userId:Number(req.header("x-user")),roleCode:req.header("x-role")!,scopes:new Map<string,Scope>((req.header("x-permissions")??"").split(",").filter(Boolean).map(p=>{const [name,scope]=p.split(":");return [name!,(scope??"all") as Scope];}))}));setAmr(res,["pwd",AMR_OTP]);next();});
  app.use(createApp({appBaseUrl:"https://pgd.test",db:getDb(),clock,logger,penyimpanan:storage,auth:authPalsu(),health:new HealthRegistry(30).register(fcmCheck(null)),security:{objectStorageOrigin:"http://minio:9000"},limiter:{hit:async()=>({lolos:true,batas:1000,sisa:999,resetDetik:60})}}));
  server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
 });
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(migrationDirectory){if(resolve(migrationDirectory)!==join(resolve(tmpdir()),basename(migrationDirectory))||!basename(migrationDirectory).startsWith("sigm4-pr0317-migrations-"))throw new Error("Direktori cleanup tidak sesuai fixture");rmSync(migrationDirectory,{recursive:true,force:true});}});
 it("private drafts, ownership, Aset-only and server totals",async()=>{
  const p=await create("DRAF");expect(p.total_estimasi).toBe("1234.50");expect(p.nomor).toMatch(/^PGD-2026-/);
  expect((await send(`/procurements/${p.id}`,manager)).status).toBe(404);expect((await send(`/procurements/${p.id}`,other)).status).toBe(404);
  expect((await send(`/procurements/${p.id}`,other,body("DRAF"),randomUUID(),"PUT")).status).toBe(404);
  expect((await send("/procurements",requester,{...body(),items:[{...body().items[0],jenis:"BAHAN"}]})).status).toBe(422);
  expect((await send("/procurements",requester,{...body(),items:[]})).status).toBe(422);
  expect((await send(`/procurements/${p.id}/submit`,requester,{})).status).toBe(200);
 });
 it("attachments are private and confirmed, pending scans block approval only",async()=>{
  const foreign=Number(await file("PROCUREMENT_ATTACHMENT",other.id));expect((await send("/procurements",requester,{...body(),lampiran:[{file_id:foreign,nama_berkas:"Asing.pdf"}]})).status).toBe(422);
  const pendingFile=Number(await file("PROCUREMENT_ATTACHMENT",requester.id,"PENDING"));const r=await send("/procurements",requester,{...body(),lampiran:[{file_id:pendingFile,nama_berkas:"Brosur.pdf"}]});expect(r.status).toBe(201);const p=r.json.data;expect(p.lampiran[0]!.url).toBeNull();
  const review=await send(`/procurements/${p.id}/review`,manager);expect(review.json.data.dukungan[0]).toMatchObject({category_id:category,jumlah_aset:0});
  expect((await decide(p,manager,1)).status).toBe(422);await kueri(`UPDATE stored_files SET scan_status='CLEAN' WHERE id=${pendingFile}`);expect((await decide(p,manager,1)).status).toBe(200);
 });
 it("partial quantities cannot increase across steps; snapshots and review access",async()=>{
  const p=await create();expect((await send(`/procurements/${p.id}/review`,second)).status).toBe(403);
  expect((await decide(p,manager,1,"DISETUJUI",6," ")).status).toBe(422);
  expect((await decide(p,manager,1,"DISETUJUI",0)).status).toBe(422);expect((await decide(p,manager,1,"DISETUJUI",6)).status).toBe(200);
  expect((await send(`/procurements/${p.id}`,second)).status).toBe(404);expect((await send(`/procurements/${p.id}/review`,second)).status).toBe(200);
  expect((await decide(p,second,2,"DISETUJUI",7)).status).toBe(422);expect((await decide(p,second,2,"DISETUJUI",5)).status).toBe(200);
  const d=(await send(`/procurements/${p.id}`,requester)).json.data;expect(d.status).toBe("DISETUJUI_SEBAGIAN");expect(d.items[0]!.jumlah_disetujui).toBe(5);
  const rows=await kueri<{rincian_keputusan:{items:{jumlah_disetujui:number}[]}}>(`SELECT rincian_keputusan FROM approval_steps WHERE instance_id=${p.approval_instance_id} ORDER BY urutan`);expect(rows.map(r=>r.rincian_keputusan.items[0]!.jumlah_disetujui)).toEqual([6,5]);
 });
 it("revision creates a new instance and restarts quantities",async()=>{
  const p=await create();expect((await decide(p,manager,1,"PERLU_REVISI")).status).toBe(200);
  const edited=await send(`/procurements/${p.id}`,requester,body("DRAF",3),randomUUID(),"PUT");expect(edited.status).toBe(200);expect(edited.json.data.status).toBe("DRAF");
  const r=await send(`/procurements/${p.id}/submit`,requester,{});expect(r.status).toBe(200);expect(r.json.data.approval_instance_id).not.toBe(p.approval_instance_id);expect(r.json.data.approval_ids).toHaveLength(2);expect(r.json.data.items[0]!.jumlah_disetujui).toBeNull();
 });
 it("concurrent responders: only one decision and snapshot survives",async()=>{
  const p=await create();const results=await Promise.all([1,2].map(()=>decide(p,manager,1,"DISETUJUI",8)));expect(results.map(r=>r.status).sort()).toEqual([200,409]);expect((await send(`/procurements/${p.id}`,requester)).json.data.items[0]!.jumlah_disetujui).toBe(8);
 });
 it("ten units create unique assets/UUIDs, FK and shared invoice; replay creates none",async()=>{
  const p=await approve(await create()),b=await receipt(p,10),key=randomUUID();const r=await send(`/procurements/${p.id}/receipts`,manager,b,key);expect(r.status,JSON.stringify(r.json)).toBe(200);expect(r.json.data.status).toBe("SELESAI");
  expect((await send(`/procurements/${p.id}/receipts`,manager,b,key)).json.data.penerimaan).toHaveLength(1);
  const assets=await kueri<{id:string;kode_barang:string;uuid:string}>(`SELECT id::text,kode_barang,uuid FROM assets WHERE procurement_id=${p.id}`);expect(assets).toHaveLength(10);expect(new Set(assets.map(a=>a.kode_barang)).size).toBe(10);expect(new Set(assets.map(a=>a.uuid)).size).toBe(10);
  expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM asset_document_links WHERE asset_id IN (SELECT id FROM assets WHERE procurement_id=${p.id})`))[0]!.n).toBe("10");
  const detail=await send(`/assets/${assets[0]!.id}`,manager);expect(detail.status).toBe(200);expect((detail.json.data as unknown as {pengadaan:{id:string}}).pengadaan.id).toBe(p.id);
 });
 it("rejected goods do not consume quota; staged replacement completes",async()=>{
  const p=await approve(await create("AJUKAN",3)),b=await receipt(p,2,true);const rejected=await send(`/procurements/${p.id}/receipts`,manager,b);expect(rejected.status,JSON.stringify(rejected.json)).toBe(200);expect(rejected.json.data.items[0]!.jumlah_diterima).toBe(0);
  const first=await send(`/procurements/${p.id}/receipts`,manager,await receipt(p,1));expect(first.status).toBe(200);expect(first.json.data.status).toBe("DITERIMA_SEBAGIAN");
  const replacement=await send(`/procurements/${p.id}/receipts`,manager,await receipt(p,2));expect(replacement.status).toBe(200);expect(replacement.json.data.status).toBe("SELESAI");expect(replacement.json.data.items[0]!.jumlah_diterima).toBe(3);
 });
 it("unclean/foreign/missing documents and invalid serials roll back receipts/assets",async()=>{
  const p=await approve(await create("AJUKAN",2)),b=await receipt(p,2);
  for(const fileId of [await file("PROCUREMENT_RECEIPT_DOCUMENT",other.id),await file("PROCUREMENT_RECEIPT_DOCUMENT",manager.id,"PENDING")])expect((await send(`/procurements/${p.id}/receipts`,manager,{...b,dokumen:[{...b.dokumen[0],file_id:Number(fileId)}]})).status).toBe(422);
  expect((await send(`/procurements/${p.id}/receipts`,manager,{...b,dokumen:[]})).status).toBe(422);
  expect((await send(`/procurements/${p.id}/receipts`,manager,{...b,items:[{...b.items[0],nomor_seri:["only-one"]}]})).status).toBe(422);
  expect((await send(`/procurements/${p.id}/receipts`,manager,{...b,items:[{...b.items[0],room_id:999999999}]})).status).toBe(422);
  expect((await send(`/procurements/${p.id}/receipts`,manager,{...b,items:[{...b.items[0],nomor_seri:["DUPLICATE-SERIAL","DUPLICATE-SERIAL"]}]})).status).toBe(409);
  expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM procurement_receipts WHERE procurement_id=${p.id}`))[0]!.n).toBe("0");expect((await kueri<{n:string}>(`SELECT count(*)::text n FROM assets WHERE procurement_id=${p.id}`))[0]!.n).toBe("0");
 });
 it("concurrent receipts cannot exceed approved quota; year-end closing and legacy NULL",async()=>{
  const p=await approve(await create("AJUKAN",2)),a=await receipt(p,2),b=await receipt(p,2);const results=await Promise.all([a,b].map(body=>send(`/procurements/${p.id}/receipts`,manager,body)));expect(results.map(r=>r.status).sort()).toEqual([200,422]);
  const old=await approve(await create("AJUKAN",1,2025));expect((await send(`/procurements/${old.id}/close`,manager,{alasan:"Anggaran tidak direalisasikan"})).json.data.status).toBe("TIDAK_DIREALISASIKAN");
  const current=await approve(await create("AJUKAN",1));expect((await send(`/procurements/${current.id}/close`,manager,{alasan:"Belum akhir tahun"})).status).toBe(422);
  const asset=await id(`INSERT INTO assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi) VALUES ('MANUAL${marker}','Manual',${category},2026,'PEMBELIAN',${room},'BAIK') RETURNING id::text`);expect((await kueri<{procurement_id:null}>(`SELECT procurement_id FROM assets WHERE id=${asset}`))[0]!.procurement_id).toBeNull();expect((await send(`/assets/${asset}`,manager)).status).toBe(200);
 });
 it("outbox notifications NT-34/35/36 are delivered once",async()=>{
  const registry=new EventHandlerRegistry();pasangKonsumenNotifikasi(registry,{db:getDb,clock,ctx:()=>createSystemAuthContext("test-procurement")});const dispatcher=new OutboxDispatcher({registry,clock,db:getDb(),logger});expect((await dispatcher.drain()).failed).toBe(0);expect((await dispatcher.drain()).processed).toBe(0);
  const rows=await kueri<{kode:string;n:string}>(`SELECT kode,count(*)::text n FROM notifications WHERE user_id IN (${requester.id},${manager.id}) AND kode IN ('NT-34','NT-35','NT-36') GROUP BY kode`);expect(rows.map(r=>r.kode).sort()).toEqual(["NT-34","NT-35","NT-36"]);
 });
 it("approval rules select the tier from server-calculated proposal value",async()=>{
  const rule=await id(`INSERT INTO approval_rules(jenis_pengajuan,kondisi,prioritas) VALUES ('PENGADAAN_BARANG','{"field":"total_value","op":"gt","value":5000}',2000) RETURNING id::text`);
  await kueri(`INSERT INTO approval_rule_steps(rule_id,urutan,approver_type,approver_user_id,sla_jam) VALUES (${rule},1,'user',${second.id},8)`);
  const p=await create("AJUKAN",100);expect(p.total_estimasi).toBe("12345.00");expect((await kueri<{rule_id:string}>(`SELECT rule_id::text FROM approval_instances WHERE id=${p.approval_instance_id}`))[0]!.rule_id).toBe(rule);expect((await send(`/procurements/${p.id}/review`,second)).status).toBe(200);expect((await decide(p,manager,1)).status).toBe(403);expect((await decide(p,second,1)).status).toBe(200);
 });
});
