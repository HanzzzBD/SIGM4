import { WorkOrderChecklistSchema } from "@sigm4/schemas";
import type { WorkOrderProgress } from "@sigm4/schemas";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { pelakuId } from "../../../shared/auth/index.js";
import { ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { attachWorkOrderPhotos,detachWorkOrderPhoto } from "../../m06-documents/index.js";
import { AssetService } from "../../m04-assets/index.js";
import { TitikWorkOrderKerusakan } from "../../m11-damage-reports/index.js";
import { createExecutionRepository } from "../repositories/execution.repository.js";
import { createMaintenanceRepository } from "../repositories/maintenance.repository.js";
import { editable,requireCompletion,costRows,workOrderError as invalid } from "./execution-model.js";
import { tanggalWib } from "./work-order.service.js";
import { runMaintenanceCompletionHooks } from "./completion-hooks.js";

export class ExecutionService {
 constructor(private readonly clock:Clock,private readonly audit:AuditLogger){}
 private async lock(scope:TransactionScope,id:number,execute=true){
  if(!scope.ctx.can(execute?"workorder.execute":"workorder.verify"))throw new ForbiddenError();
  const row=await createExecutionRepository(scope.tx).lock(scope.ctx,id,execute||scope.ctx.scopeOf("workorder.verify")!=="all");
  if(!row)throw new NotFoundError("Work order tidak ditemukan.");return row;
 }
 private async log(scope:TransactionScope,id:string,aksi:string,before:unknown,after:unknown){await this.audit.write(scope,{modul:"m12-maintenance",aksi,entitas:"work_orders",entitasId:id,nilaiSebelum:before,nilaiSesudah:after});}
 private async event(scope:TransactionScope,row:{id:string;nomor:string;teknisi_id:string;damage_report_id:string|null},name:string,params:Record<string,unknown>={}){
  await publish(scope,{name,aggregateType:"work_order",aggregateId:row.id,payload:{work_order_id:Number(row.id),nomor:row.nomor,teknisi_id:Number(row.teknisi_id),damage_report_id:row.damage_report_id===null?null:Number(row.damage_report_id),...params}});
 }
 async start(scope:TransactionScope,id:number){
  const row=await this.lock(scope,id);if(row.status==="DIKERJAKAN")return;
  if(row.menunggu_ketersediaan_aset)throw invalid("asset_id","Work order menunggu ketersediaan aset sebelum dapat dimulai.");
  if(!["DITUGASKAN","TERTUNDA"].includes(row.status))throw invalid("status","Work order harus Ditugaskan atau Tertunda untuk mulai/resume.");
  if(row.jenis==="PREVENTIF"&&row.asset_id){const asset=await scope.tx.selectFrom("assets").select(["status","dihapuskan"]).where("id","=",row.asset_id).forUpdate().executeTakeFirst();if(!asset||asset.dihapuskan||asset.status!=="TERSEDIA")throw invalid("asset_id","Pekerjaan preventif menunggu aset kembali Tersedia.");}
  if(row.status_estimasi==="MENUNGGU")throw invalid("estimasi","Tunggu persetujuan estimasi sebelum melanjutkan.");
  await scope.tx.updateTable("work_orders").set({status:"DIKERJAKAN",waktu_mulai:row.waktu_mulai??this.clock.now(),alasan_tertunda:null,tanggal_lanjut:null,menunggu_ketersediaan_aset:false,updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
  await this.log(scope,row.id,"WORKORDER_STARTED",{status:row.status},{status:"DIKERJAKAN"});
 }
 async progress(scope:TransactionScope,id:number,input:WorkOrderProgress){
  const row=await this.lock(scope,id);editable(row.status);
  const checklist=WorkOrderChecklistSchema.parse(row.checklist);
  if(input.checklist){const known=new Set(checklist.map(i=>i.id));if(input.checklist.some(i=>!known.has(i.id))||new Set(input.checklist.map(i=>i.id)).size!==input.checklist.length)throw invalid("checklist","Checklist harus berasal dari work order dan tidak berulang.");for(const item of input.checklist){const original=checklist.find(i=>i.id===item.id)!;original.selesai=item.selesai;}}
  let total=row.biaya;
  if(input.biaya){
   const costs=costRows(input.biaya);total=costs.total;
   if(Number(total)>Number(row.estimasi_biaya))throw invalid("biaya","Biaya melebihi estimasi disetujui. Ajukan revisi estimasi terlebih dahulu.");
   await scope.tx.deleteFrom("work_order_costs").where("work_order_id","=",row.id).execute();
   if(costs.rows.length)await scope.tx.insertInto("work_order_costs").values(costs.rows.map(c=>({...c,work_order_id:row.id}))).execute();
  }
  await scope.tx.updateTable("work_orders").set({checklist:JSON.stringify(checklist),biaya:total,...(input.catatan_teknisi===undefined?{}:{catatan_teknisi:input.catatan_teknisi}),updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
  await this.log(scope,row.id,"WORKORDER_PROGRESS_UPDATED",{biaya:row.biaya,checklist:row.checklist},{...input,biaya:total});
 }
 async photos(scope:TransactionScope,id:number,fileIds:readonly number[]){
  const row=await this.lock(scope,id);editable(row.status);
  const existing=await createExecutionRepository(scope.tx).photos(scope.ctx,row.id),ids=new Set(existing.map(p=>p.file_id));
  const fresh=fileIds.filter(f=>!ids.has(String(f)));
  if(existing.length+fresh.length>20)throw invalid("foto_file_ids","Maksimal 20 foto hasil per work order.");
  await attachWorkOrderPhotos(scope,fileIds,id);
  if(!fresh.length)return;
  const next=existing.length?Math.max(...existing.map(p=>p.urutan))+1:0;
  await scope.tx.insertInto("work_order_photos").values(fresh.map((f,i)=>({work_order_id:row.id,file_id:String(f),urutan:next+i,created_by:pelakuId(scope.ctx)}))).execute();
  await this.log(scope,row.id,"WORKORDER_PROGRESS_UPDATED",{foto:existing.map(p=>p.file_id)},{foto_file_ids:fileIds});
 }
 async removePhoto(scope:TransactionScope,id:number,fileId:number){
  const row=await this.lock(scope,id);editable(row.status);
  const photo=await scope.tx.selectFrom("work_order_photos").select("id").where("work_order_id","=",row.id).where("file_id","=",String(fileId)).executeTakeFirst();
  if(!photo)throw new NotFoundError("Foto hasil tidak ditemukan.");
  await scope.tx.deleteFrom("work_order_photos").where("id","=",photo.id).execute();await detachWorkOrderPhoto(scope,String(fileId),row.id);
  await this.log(scope,row.id,"WORKORDER_PROGRESS_UPDATED",{foto_file_id:fileId},{foto_dilepas:true});
 }
 async pause(scope:TransactionScope,id:number,input:{alasan:string;tanggal_lanjut:string}){
  const row=await this.lock(scope,id);if(row.status!=="DIKERJAKAN")throw invalid("status","Hanya pekerjaan Dikerjakan yang dapat ditunda.");
  if(input.tanggal_lanjut<tanggalWib(this.clock.now()))throw invalid("tanggal_lanjut","Tanggal lanjut tidak boleh sebelum hari ini.");
  await scope.tx.updateTable("work_orders").set({status:"TERTUNDA",alasan_tertunda:input.alasan,tanggal_lanjut:input.tanggal_lanjut,updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
  await this.log(scope,row.id,"WORKORDER_PROGRESS_UPDATED",{status:row.status},{status:"TERTUNDA",...input});await this.event(scope,row,"WorkOrderPaused",input);
 }
 async complete(scope:TransactionScope,id:number,input:{hasil:string},irreparable=false){
  const row=await this.lock(scope,id);editable(row.status);
  requireCompletion(irreparable?[]:WorkOrderChecklistSchema.parse(row.checklist),await createExecutionRepository(scope.tx).photos(scope.ctx,row.id),row.status_estimasi==="MENUNGGU");
  const status=irreparable?"TIDAK_DAPAT_DIPERBAIKI":"MENUNGGU_VERIFIKASI";
  await scope.tx.updateTable("work_orders").set({status,hasil:input.hasil,rekomendasi:irreparable?input.hasil:null,waktu_selesai:this.clock.now(),updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
  await this.log(scope,row.id,"WORKORDER_COMPLETED",{status:row.status},{status,hasil:input.hasil});await this.event(scope,row,"WorkOrderCompleted",{tidak_dapat_diperbaiki:irreparable});
 }
 async verify(scope:TransactionScope,id:number,input:{keputusan:"TUTUP"|"KEMBALIKAN";catatan?:string|undefined;kondisi_pasca?:"BAIK"|"RUSAK_RINGAN"|"RUSAK_BERAT"|undefined}){
  // Urutan tiket -> WO -> aset sesuai pembentukan WO dari event M-11.
  const reference=await scope.tx.selectFrom("work_orders").select("damage_report_id").where("id","=",String(id)).executeTakeFirst();
  if(reference?.damage_report_id)await scope.tx.selectFrom("damage_reports").select("id").where("id","=",reference.damage_report_id).forUpdate().execute();
  const row=await this.lock(scope,id,false);
  if(!["MENUNGGU_VERIFIKASI","TIDAK_DAPAT_DIPERBAIKI"].includes(row.status))throw invalid("status","Work order belum menunggu verifikasi hasil.");
  if(input.keputusan==="KEMBALIKAN"){
   if(!input.catatan)throw invalid("catatan","Catatan pengembalian wajib diisi.");
   await scope.tx.updateTable("work_orders").set({status:"DIKERJAKAN",waktu_selesai:null,catatan_verifikasi:input.catatan,updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
   await this.log(scope,row.id,"WORKORDER_RETURNED",{status:row.status},{status:"DIKERJAKAN",catatan:input.catatan});await this.event(scope,row,"WorkOrderReturned",{catatan:input.catatan});return;
  }
  if(row.asset_id&&!input.kondisi_pasca)throw invalid("kondisi_pasca","Tetapkan kondisi aset pasca-perbaikan sebelum menutup.");
  if(row.status==="TIDAK_DAPAT_DIPERBAIKI"&&row.asset_id&&input.kondisi_pasca!=="RUSAK_BERAT")throw invalid("kondisi_pasca","Aset Tidak Dapat Diperbaiki harus ditetapkan Rusak Berat.");
  requireCompletion(row.status==="TIDAK_DAPAT_DIPERBAIKI"?[]:WorkOrderChecklistSchema.parse(row.checklist),await createExecutionRepository(scope.tx).photos(scope.ctx,row.id),row.status_estimasi==="MENUNGGU");
  if(row.asset_id&&input.kondisi_pasca)await new AssetService(scope.tx,this.audit,this.clock).ubahKondisiDalam(scope,Number(row.asset_id),{kondisi:input.kondisi_pasca,alasan:input.catatan??`Penutupan ${row.nomor}`,referensiJenis:"work_order",referensiId:id});
  const now=this.clock.now();
  await scope.tx.updateTable("work_orders").set({status:"SELESAI",kondisi_pasca:input.kondisi_pasca??null,diverifikasi_oleh:scope.ctx.userId,diverifikasi_pada:now,catatan_verifikasi:input.catatan??null,updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
  if(row.asset_id){const status=await createMaintenanceRepository(scope.tx).restoreAfterRepair(scope.ctx,row.asset_id,now);if(status.sebelum!==status.sesudah)await this.audit.write(scope,{modul:"m04-assets",aksi:"ASSET_STATUS_CHANGED",entitas:"assets",entitasId:row.asset_id,nilaiSebelum:{status:status.sebelum},nilaiSesudah:{status:status.sesudah}});}
  if(row.damage_report_id)await new TitikWorkOrderKerusakan(this.audit).tutupDariWorkOrder(scope,Number(row.damage_report_id),id);
  if(row.jenis==="PREVENTIF")await runMaintenanceCompletionHooks(scope,id,now);
  await this.log(scope,row.id,"WORKORDER_VERIFIED",{status:row.status},{status:"SELESAI",...input});await this.event(scope,row,"WorkOrderClosed",{aset:row.asset_id,hasil:row.hasil});
 }
 async proposeEstimate(scope:TransactionScope,id:number,input:{estimasi:number;alasan:string}){
  const row=await this.lock(scope,id);editable(row.status);
  if(row.status_estimasi==="MENUNGGU")throw invalid("estimasi","Masih ada estimasi menunggu keputusan.");
  if(input.estimasi<Number(row.biaya))throw invalid("estimasi","Estimasi tidak boleh kurang dari biaya yang sudah dicatat.");
  const threshold=(await createExecutionRepository(scope.tx).setting(scope.ctx,"maintenance.ambang_persetujuan_estimasi"))?.value;
  if(typeof threshold!=="number"||!Number.isFinite(threshold)||threshold<0)throw invalid("estimasi","Ambang persetujuan estimasi belum dikonfigurasi Administrator.");
  const pending=input.estimasi>threshold;
  await scope.tx.updateTable("work_orders").set({estimasi_diusulkan:input.estimasi.toFixed(2),alasan_estimasi:input.alasan,status_estimasi:pending?"MENUNGGU":"DISETUJUI",...(pending?{}:{estimasi_biaya:input.estimasi.toFixed(2)}),estimasi_diputuskan_oleh:null,estimasi_diputuskan_pada:pending?null:this.clock.now(),updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
  await this.log(scope,row.id,"WORKORDER_PROGRESS_UPDATED",{estimasi:row.estimasi_biaya},{...input,status_estimasi:pending?"MENUNGGU":"DISETUJUI"});if(pending)await this.event(scope,row,"WorkOrderEstimateRequested");
 }
 async decideEstimate(scope:TransactionScope,id:number,input:{keputusan:"DISETUJUI"|"DITOLAK";catatan:string}){
  const row=await this.lock(scope,id,false);if(row.status_estimasi!=="MENUNGGU"||row.estimasi_diusulkan===null)throw invalid("estimasi","Tidak ada estimasi yang menunggu keputusan.");
  if(!["DIKERJAKAN","TERTUNDA"].includes(row.status))throw invalid("status","Work order sudah tidak menerima perubahan estimasi.");
  await scope.tx.updateTable("work_orders").set({status_estimasi:input.keputusan,...(input.keputusan==="DISETUJUI"?{estimasi_biaya:row.estimasi_diusulkan}:{}),estimasi_diputuskan_oleh:scope.ctx.userId,estimasi_diputuskan_pada:this.clock.now(),updated_by:pelakuId(scope.ctx)}).where("id","=",row.id).execute();
  await this.log(scope,row.id,"WORKORDER_PROGRESS_UPDATED",{status_estimasi:"MENUNGGU"},input);
 }
}
