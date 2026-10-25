import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { MaterialStocktakeCount,StocktakeCreate } from "@sigm4/schemas";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { MaterialLedgerService } from "../../m22-materials/index.js";
import { invalid,lockSession,requireAssignee,requireRunning } from "../access.js";
import { createStocktakeRepository } from "../repositories/stocktake.repository.js";
import { createMaterialStocktakeRepository } from "../repositories/material-stocktake.repository.js";

export class MaterialStocktakeService {
 constructor(private readonly clock:Clock,private readonly audit:AuditLogger){}
 async create(scope:TransactionScope,input:StocktakeCreate){
  if(!scope.ctx.can("audit.manage"))throw new ForbiddenError();
  await sql`select pg_advisory_xact_lock(13,1)`.execute(scope.tx);
  const c=input.cakupan;
  if(c.jenis==="KATEGORI"||c.category_id!==undefined)throw invalid("Pilih cakupan lokasi untuk opname Bahan.","cakupan");
  const people=await scope.tx.selectFrom("users as u").innerJoin("roles as r","r.id","u.role_id").select("u.id").where("u.id","in",input.pelaksana_ids.map(String)).where("u.status","=","AKTIF").where("r.kode","in",["R-01","R-02"]).forUpdate("u").execute();
  if(people.length!==input.pelaksana_ids.length)throw invalid("Pelaksana harus Administrator/Petugas aktif.","pelaksana_ids");
  const target=()=>scope.tx.selectFrom("materials as m").innerJoin("material_units as u","u.id","m.satuan_id").crossJoin("rooms as r").innerJoin("areas as a","a.id","r.area_id").innerJoin("buildings as g","g.id","a.building_id").leftJoin("material_balances as b",j=>j.onRef("b.material_id","=","m.id").onRef("b.room_id","=","r.id"))
   .where("r.status","=","AKTIF").where("g.status","=","AKTIF").where(e=>e.or([e.and([e("m.status","=","AKTIF"),e.or([e("b.id","is not",null),e("m.room_id_default","=",e.ref("r.id"))])]),e.and([e("m.status","=","NONAKTIF"),e("b.saldo",">",0)])]))
   .$if(c.jenis==="GEDUNG",q=>q.where("g.id","=",String(c.id))).$if(c.jenis==="RUANGAN",q=>q.where("r.id","=",String(c.id)))
   .select(["m.id as material_id","m.nama","m.uuid","m.satuan_id","u.nama as satuan_nama","u.simbol as satuan_simbol","r.id as room_id","r.nama as lokasi",sql<number>`coalesce(b.saldo,0)`.as("saldo_sistem")]).orderBy("m.id").orderBy("r.id");
  const initial=await target().execute(),ids=[...new Set(initial.map(i=>i.material_id))];
  if(!ids.length)throw invalid("Cakupan menghasilkan 0 target Bahan.","cakupan");
  await scope.tx.selectFrom("materials").select("id").where("id","in",ids).orderBy("id").forUpdate().execute();
  const items=await target().where("m.id","in",ids).execute();if(!items.length)throw invalid("Target berubah. Buat sesi ulang.");
  const session=await scope.tx.insertInto("audit_sessions").values({domain:"BAHAN",nomor:await new DocumentNumberService(this.clock).next(scope.tx,"OPN"),nama:input.nama,periode_mulai:input.periode_mulai,periode_selesai:input.periode_selesai,cakupan:JSON.stringify(c),created_by:pelakuId(scope.ctx),updated_by:pelakuId(scope.ctx)}).returning("id").executeTakeFirstOrThrow();
  await scope.tx.insertInto("audit_session_assignees").values(people.map(p=>({session_id:session.id,user_id:p.id}))).execute();
  const rooms=new Map(items.map(i=>[i.room_id,i.lokasi]));await scope.tx.insertInto("audit_session_rooms").values([...rooms].map(([room_id,nama])=>({session_id:session.id,room_id,nama}))).execute();
  for(let start=0;start<items.length;start+=500)await scope.tx.insertInto("audit_material_items").values(items.slice(start,start+500).map(i=>({...i,session_id:session.id}))).execute();
  await this.audit.write(scope,{modul:"m13-audit-stocktake",aksi:"AUDIT_SESSION_CREATED",entitas:"audit_sessions",entitasId:session.id,nilaiSesudah:{...input,domain:"BAHAN",target:items.length}});
  await publish(scope,{name:"AuditSessionCreated",aggregateType:"audit_session",aggregateId:session.id,payload:{session_id:Number(session.id),nama:input.nama,n:items.length,domain:"BAHAN",pelaksana_ids:input.pelaksana_ids}});
  return createStocktakeRepository(scope.tx).detail(scope.ctx,session.id);
 }
 async count(scope:TransactionScope,id:string,input:MaterialStocktakeCount){
  if(!scope.ctx.can("audit.execute"))throw new ForbiddenError();
  const session=await lockSession(scope,id);if(session.domain!=="BAHAN")throw invalid("Hitungan Bahan hanya untuk sesi domain Bahan.");await requireAssignee(scope,id);
  const hash=createHash("sha256").update(JSON.stringify(input)).digest("hex"),prior=await scope.tx.selectFrom("audit_scans").selectAll().where("session_id","=",id).where("client_scan_id","=",input.client_scan_id).executeTakeFirst();
  if(prior){if(prior.payload_hash!==hash)throw invalid("ID hitungan sudah dipakai untuk hasil berbeda.","client_scan_id");return prior.response as {item_id:string;duplicate:boolean;hasil:string};}
  requireRunning(session,true);
  const room=await scope.tx.selectFrom("audit_session_rooms").select("completed_at").where("session_id","=",id).where("room_id","=",String(input.room_id)).executeTakeFirst();
  if(!room||room.completed_at)throw invalid("Lokasi di luar cakupan atau sudah selesai.","room_id");
  const item=await scope.tx.selectFrom("audit_material_items").selectAll().where("session_id","=",id).where("material_id","=",String(input.material_id)).where("room_id","=",String(input.room_id)).forUpdate().executeTakeFirst();if(!item)throw new NotFoundError("Bahan tidak termasuk target lokasi ini.");
  if(input.revision>item.revision)throw invalid("Versi hitungan tidak sah. Muat ulang target.","revision");
  let response:{item_id:string;duplicate:boolean;hasil:string};
  if(input.revision<item.revision)response={item_id:item.id,duplicate:true,hasil:item.jumlah_fisik===item.basis_saldo?"SESUAI":"SELISIH"};
  else{
   const material=await scope.tx.selectFrom("materials").select("satuan_id").where("id","=",item.material_id).forUpdate().executeTakeFirstOrThrow();
   if(material.satuan_id!==item.satuan_id)throw invalid("Satuan berubah sejak snapshot. Batalkan dan buat sesi baru.","basis");
   const balance=await scope.tx.selectFrom("material_balances").select("saldo").where("material_id","=",item.material_id).where("room_id","=",item.room_id).forUpdate().executeTakeFirst();
   const tip=await scope.tx.selectFrom("material_transactions").select(e=>e.fn.max<string>("id").as("id")).where("material_id","=",item.material_id).where("room_id","=",item.room_id).executeTakeFirstOrThrow();
   if(input.basis.saldo!==(balance?.saldo??0)||input.basis.ledger_id!==String(tip.id??0))throw invalid("Ada transaksi baru. Muat ulang basis saldo dan hitung ulang fisik sebelum mengirim.","basis");
   await scope.tx.updateTable("audit_material_items").set({jumlah_fisik:input.jumlah_fisik,basis_saldo:input.basis.saldo,basis_ledger_id:input.basis.ledger_id,revision:item.revision+1,keterangan:input.keterangan.trim()||null,diperiksa_oleh:String(scope.ctx.userId),diperiksa_pada:this.clock.now()}).where("id","=",item.id).execute();
   response={item_id:item.id,duplicate:false,hasil:input.jumlah_fisik===input.basis.saldo?"SESUAI":"SELISIH"};
   await this.audit.write(scope,{modul:"m13-audit-stocktake",aksi:"AUDIT_MATERIAL_COUNTED",entitas:"audit_material_items",entitasId:item.id,nilaiSebelum:{jumlah_fisik:item.jumlah_fisik,revision:item.revision},nilaiSesudah:{...input,revision:item.revision+1}});
  }
  await scope.tx.insertInto("audit_scans").values({session_id:id,client_scan_id:input.client_scan_id,payload_hash:hash,response:JSON.stringify(response)}).execute();return response;
 }
 async note(scope:TransactionScope,id:string,itemId:string,keterangan:string,revision:number){
  if(!scope.ctx.can("audit.manage"))throw new ForbiddenError();
  const session=await lockSession(scope,id);if(session.domain!=="BAHAN")throw invalid("Rekonsiliasi Bahan hanya untuk domain Bahan.");requireRunning(session);if(!session.finalized_at)throw invalid("Finalisasi sebelum melengkapi rekonsiliasi.");
  const item=await scope.tx.updateTable("audit_material_items").set({keterangan}).where("session_id","=",id).where("id","=",itemId).where("revision","=",revision).returning("id").executeTakeFirst();if(!item)throw invalid("Hitungan berubah atau target tidak ditemukan. Muat ulang rekonsiliasi.");
  await this.audit.write(scope,{modul:"m13-audit-stocktake",aksi:"AUDIT_RECONCILIATION_UPDATED",entitas:"audit_material_items",entitasId:item.id,nilaiSesudah:{session_id:id,keterangan,revision}});
 }
 async ready(scope:TransactionScope,id:string,notes=true,room?:number){
  const repo=createMaterialStocktakeRepository(scope.tx),all=[];
  for(let page=1;;page++){const result=await repo.items(scope.ctx,id,page,500,room);all.push(...result.data);if(page>=result.meta.total_pages)break;}
  for(const item of all){if(item.jumlah_fisik===null)throw invalid(`Jumlah fisik ${item.nama} belum dihitung. Nol harus dicatat secara eksplisit.`);if(item.perlu_hitung_ulang)throw invalid(`Ada transaksi atau perubahan satuan pada ${item.nama}. Kembalikan ke Petugas dan hitung ulang dengan basis terbaru.`,"basis");if(notes&&item.selisih!==0&&!item.keterangan?.trim())throw invalid(`Keterangan selisih ${item.nama} wajib diisi.`,"keterangan");}
  return all;
 }
 async apply(scope:TransactionScope,id:string){
  const items=await scope.tx.selectFrom("audit_material_items").select("material_id").where("session_id","=",id).execute();
  if(!items.length)throw invalid("Sesi tidak memiliki target Bahan.");
  await scope.tx.selectFrom("materials").select("id").where("id","in",[...new Set(items.map(i=>i.material_id))]).orderBy("id").forUpdate().execute();
  const all=await this.ready(scope,id),ledger=new MaterialLedgerService(this.clock,this.audit);
  for(const item of all){if(item.selisih===0)continue;await ledger.record(scope,{materialId:Number(item.material_id),roomId:Number(item.room_id),jenis:"OPNAME",delta:item.selisih!,referenceKind:"audit_session",referenceId:Number(id),alasan:item.keterangan!});await this.audit.write(scope,{modul:"m13-audit-stocktake",aksi:"AUDIT_ADJUSTMENT_APPLIED",entitas:"materials",entitasId:item.material_id,nilaiSesudah:{session_id:id,item_id:item.id,room_id:item.room_id,selisih:item.selisih,saldo_sesudah:item.jumlah_fisik}});}
 }
}
