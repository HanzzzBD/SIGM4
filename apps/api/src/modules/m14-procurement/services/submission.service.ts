import type { ProcurementSave } from "@sigm4/schemas";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { TransactionScope } from "../../../shared/db/index.js";
import { ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { DocumentNumberService } from "../../../shared/numbering/index.js";
import { publish } from "../../../shared/events/index.js";
import { claimProcurementFiles } from "../../m06-documents/index.js";
import { procurementMaterial } from "../../m22-materials/index.js";
import { procurementRequesterOverdue } from "../../m09-loans/index.js";
import type { ApprovalService,KamusFakta } from "../../m10-approval/index.js";
import { createProcurementRepository } from "../repositories/procurement.repository.js";
import { estimatedTotal,invalid,wibDate } from "./rules.js";
import type { ProcurementPolicy } from "./rules.js";
export class ProcurementSubmissionService {
 constructor(private readonly clock:Clock,private readonly audit:AuditLogger,private readonly approval:ApprovalService,private readonly policy:ProcurementPolicy){}
 private async validate(scope:TransactionScope,b:ProcurementSave){
  if(!scope.ctx.can("procurement.create"))throw new ForbiddenError();
  if(!this.policy.allowMaterialProposals&&b.items.some(i=>i.jenis==="BAHAN"))throw invalid("items","Usulan bahan belum tersedia sampai modul Bahan diaktifkan. Pilih item Aset.");
  if(b.mode==="AJUKAN"&&(!b.justifikasi.trim()||!b.work_unit_id||!b.items.length))throw invalid("items","Pengajuan memerlukan unit kerja, justifikasi kebutuhan dan minimal satu item.");
  if(b.work_unit_id&&!await scope.tx.selectFrom("work_units").select("id").where("id","=",String(b.work_unit_id)).where("status","=","AKTIF").executeTakeFirst())throw invalid("work_unit_id","Unit kerja tidak ditemukan atau nonaktif.");
  const sources=new Map<number,Awaited<ReturnType<typeof procurementMaterial>>>();
  for(const materialId of [...new Set(b.items.filter(i=>i.jenis==="BAHAN").map(i=>i.material_id!))].sort((a,b)=>a-b))sources.set(materialId,await procurementMaterial(scope,materialId));
  for(const item of b.items.filter(i=>i.jenis==="BAHAN"))if(item.satuan!==sources.get(item.material_id!)!.simbol)throw invalid("items.satuan","Jumlah Bahan wajib memakai satuan master tanpa konversi.");
  const cats=[...new Set(b.items.flatMap(i=>i.category_id?[String(i.category_id)]:[]))];if(cats.length&&(await scope.tx.selectFrom("asset_categories").select("id").where("id","in",cats).execute()).length!==cats.length)throw invalid("items.category_id","Kategori aset tidak ditemukan.");
  if(b.source_asset_id&&!await scope.tx.selectFrom("assets").select("id").where("id","=",String(b.source_asset_id)).where("dihapuskan","=",false).executeTakeFirst())throw invalid("source_asset_id","Aset sumber tidak ditemukan.");
  return sources;
 }
 async save(scope:TransactionScope,b:ProcurementSave,id?:number){
  const repo=createProcurementRepository(scope.tx),current=id?await repo.lock(scope.ctx,id):undefined;const sources=await this.validate(scope,b);
  if(id&&(!current||current.pengusul_id!==String(scope.ctx.userId)))throw new NotFoundError("Usulan tidak ditemukan atau bukan milik Anda.");
  if(current&&!["DRAF","PERLU_REVISI"].includes(current.status))throw invalid("status","Usulan yang diajukan tidak dapat disunting sebelum diminta revisi.");
  const data={judul:b.judul,work_unit_id:b.work_unit_id?String(b.work_unit_id):null,tahun_anggaran:b.tahun_anggaran,prioritas:b.prioritas,justifikasi:b.justifikasi,total_estimasi:estimatedTotal(b.items),source_asset_id:b.source_asset_id?String(b.source_asset_id):null,updated_by:String(scope.ctx.userId)};
  let procurementId=current?.id;
  if(current)await scope.tx.updateTable("procurements").set({...data,status:b.mode==="DRAF"?"DRAF" as const:current.status}).where("id","=",current.id).execute();
  else{const r=await scope.tx.insertInto("procurements").values({...data,nomor:await new DocumentNumberService(this.clock).next(scope.tx,"PGD"),pengusul_id:String(scope.ctx.userId),created_by:String(scope.ctx.userId),status:"DRAF"}).returning("id").executeTakeFirstOrThrow();procurementId=r.id;}
  const orderId=procurementId!;
  await scope.tx.deleteFrom("procurement_items").where("procurement_id","=",orderId).execute();
  if(b.items.length)await scope.tx.insertInto("procurement_items").values(b.items.map(i=>({procurement_id:orderId,jenis:i.jenis,material_id:i.material_id?String(i.material_id):null,material_satuan_id:i.material_id?sources.get(i.material_id)!.satuan_id:null,nama_barang:i.material_id?sources.get(i.material_id)!.nama:i.nama_barang,category_id:i.category_id?String(i.category_id):null,spesifikasi:i.spesifikasi,satuan:i.satuan,jumlah_diusulkan:i.jumlah,estimasi_harga_satuan:i.estimasi_harga_satuan.toFixed(2),keterangan:i.keterangan??null}))).execute();
  const previous=await repo.attachments(scope.ctx,orderId),keep=new Set(b.lampiran.map(f=>String(f.file_id))),removed=previous.filter(f=>!keep.has(f.file_id));
  if(removed.length)await scope.tx.updateTable("stored_files").set({owner_id:null}).where("id","in",removed.map(f=>f.file_id)).where("owner_type","=","PROCUREMENT_ATTACHMENT").where("owner_id","=",orderId).execute();
  await scope.tx.deleteFrom("procurement_attachments").where("procurement_id","=",orderId).execute();
  await claimProcurementFiles(scope,"PROCUREMENT_ATTACHMENT",b.lampiran.map(f=>f.file_id),orderId,false);
  if(b.lampiran.length)await scope.tx.insertInto("procurement_attachments").values(b.lampiran.map(f=>({procurement_id:orderId,file_id:String(f.file_id),nama_berkas:f.nama_berkas,created_by:String(scope.ctx.userId)}))).execute();
  await this.audit.write(scope,{modul:"m14-procurement",aksi:current?"PROCUREMENT_UPDATED":"PROCUREMENT_CREATED",entitas:"procurements",entitasId:orderId,nilaiSesudah:{...data,items:b.items,lampiran:b.lampiran}});
  if(current?.status==="PERLU_REVISI"&&b.mode==="DRAF")await publish(scope,{name:"ProcurementDrafted",aggregateType:"procurement",aggregateId:orderId,payload:{procurement_id:Number(orderId),pengusul_id:Number(current.pengusul_id),nomor:current.nomor}});
  if(b.mode==="AJUKAN")await this.submit(scope,Number(orderId));return orderId;
 }
 async submit(scope:TransactionScope,id:number){
  if(!scope.ctx.can("procurement.create"))throw new ForbiddenError();
  const repo=createProcurementRepository(scope.tx),r=await repo.lock(scope.ctx,id);if(!r||r.pengusul_id!==String(scope.ctx.userId))throw new NotFoundError("Usulan bukan milik Anda.");
  if(!["DRAF","PERLU_REVISI"].includes(r.status))throw invalid("status","Usulan tidak dapat diajukan pada status ini.");
  const items=await repo.items(scope.ctx,r.id);if(!r.justifikasi.trim()||!r.work_unit_id||!items.length)throw invalid("items","Isi unit kerja, justifikasi dan minimal satu item sebelum mengajukan.");
  if(!await scope.tx.selectFrom("work_units").select("id").where("id","=",r.work_unit_id).where("status","=","AKTIF").executeTakeFirst())throw invalid("work_unit_id","Unit kerja sudah nonaktif.");
  if(!this.policy.allowMaterialProposals&&items.some(i=>i.jenis==="BAHAN"))throw invalid("items","Pengajuan bahan belum tersedia.");
  for(const item of items.filter(i=>i.jenis==="BAHAN")){if(!item.material_id||!item.material_satuan_id)throw invalid("items","Pemetaan master bahan wajib.");const material=await procurementMaterial(scope,Number(item.material_id));if(material.satuan_id!==item.material_satuan_id)throw invalid("items.satuan","Satuan bahan berubah sejak draf dibuat.");}
  const attachments=await repo.attachments(scope.ctx,r.id);if(attachments.some(f=>f.checksum===null||["INFECTED","FAILED"].includes(f.scan_status)))throw invalid("lampiran","Lampiran belum terkonfirmasi atau tidak lolos pemeriksaan. Lepas/ganti lampiran sebelum mengajukan.");
  await scope.tx.updateTable("procurement_items").set({jumlah_disetujui:null}).where("procurement_id","=",r.id).execute();
  const role=await scope.tx.selectFrom("users as u").innerJoin("roles as ro","ro.id","u.role_id").select("ro.kode").where("u.id","=",r.pengusul_id).executeTakeFirstOrThrow();
  const facts:KamusFakta={requester_role:role.kode,requester_id:Number(r.pengusul_id),requester_has_overdue:await procurementRequesterOverdue(scope,Number(r.pengusul_id),this.clock.now()),total_value:Number(r.total_estimasi),item_count:items.length,priority:r.prioritas};
  const instance=await this.approval.createInstance(scope,{jenis:"PENGADAAN_BARANG",referensiId:id,pemohonId:Number(r.pengusul_id),fakta:facts});
  await scope.tx.updateTable("procurements").set({status:"MENUNGGU_PERSETUJUAN",approval_instance_id:String(instance.instanceId),updated_by:String(scope.ctx.userId)}).where("id","=",r.id).execute();
  await this.audit.write(scope,{modul:"m14-procurement",aksi:"PROCUREMENT_SUBMITTED",entitas:"procurements",entitasId:r.id,nilaiSesudah:{status:"MENUNGGU_PERSETUJUAN",approval_instance_id:instance.instanceId,fakta:facts}});
  await publish(scope,{name:"ProcurementSubmitted",aggregateType:"procurement",aggregateId:r.id,payload:{procurement_id:id,instance_id:instance.instanceId,langkah_aktif:instance.langkahAktif,nomor:r.nomor,total:r.total_estimasi,pengusul_id:Number(r.pengusul_id)}});
 }
 async close(scope:TransactionScope,id:number,reason:string){
  if(!scope.ctx.can("procurement.receive"))throw new ForbiddenError();
  const r=await createProcurementRepository(scope.tx).lock(scope.ctx,id);if(!r)throw new NotFoundError();
  if(!["DISETUJUI","DISETUJUI_SEBAGIAN","DITERIMA_SEBAGIAN"].includes(r.status))throw invalid("status","Hanya usulan disetujui yang belum selesai dapat ditutup.");
  if(Number(wibDate(this.clock.now()).slice(0,4))<=r.tahun_anggaran)throw invalid("tahun_anggaran","Penutupan Tidak Direalisasikan hanya tersedia sesudah tahun anggaran berakhir.");
  await scope.tx.updateTable("procurements").set({status:"TIDAK_DIREALISASIKAN",alasan_penutupan:reason,updated_by:String(scope.ctx.userId)}).where("id","=",r.id).execute();
  await this.audit.write(scope,{modul:"m14-procurement",aksi:"PROCUREMENT_CLOSED",entitas:"procurements",entitasId:r.id,nilaiSebelum:{status:r.status},nilaiSesudah:{status:"TIDAK_DIREALISASIKAN",alasan:reason}});
  await publish(scope,{name:"ProcurementClosed",aggregateType:"procurement",aggregateId:r.id,payload:{procurement_id:id,pengusul_id:Number(r.pengusul_id),nomor:r.nomor,status:"TIDAK_DIREALISASIKAN",alasan:reason}});
 }
}
