import type { ProcurementReceipt } from "@sigm4/schemas";
import { sql } from "kysely";
import type { TransactionScope } from "../../../shared/db/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import { ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { publish } from "../../../shared/events/index.js";
import { receiveProcurementMaterial } from "../../m22-materials/index.js";
import { AssetService } from "../../m04-assets/index.js";
import { claimProcurementFiles,createProcurementAssetDocument } from "../../m06-documents/index.js";
import { createProcurementRepository } from "../repositories/procurement.repository.js";
import { invalid,wibDate } from "./rules.js";
import type { ProcurementPolicy } from "./rules.js";
export class ProcurementReceiptService{
 constructor(private readonly clock:Clock,private readonly audit:AuditLogger,private readonly policy:ProcurementPolicy){}
 async receive(scope:TransactionScope,id:number,b:ProcurementReceipt){
  if(!scope.ctx.can("procurement.receive"))throw new ForbiddenError();
  const repo=createProcurementRepository(scope.tx),r=await repo.lock(scope.ctx,id);if(!r)throw new NotFoundError();
  if(!["DISETUJUI","DISETUJUI_SEBAGIAN","DITERIMA_SEBAGIAN"].includes(r.status))throw invalid("status","Usulan belum disetujui atau sudah ditutup.");
  if(b.tanggal_terima>wibDate(this.clock.now()))throw invalid("tanggal_terima","Tanggal penerimaan tidak boleh di masa mendatang.");
  const items=await repo.items(scope.ctx,r.id),seen=new Set<number>(),fileIds=b.dokumen.map(f=>f.file_id);
  for(const received of b.items){
   const item=items.find(i=>i.id===String(received.item_id));if(!item||seen.has(received.item_id))throw invalid("items","Item harus berasal dari usulan ini dan tidak boleh berulang.");seen.add(received.item_id);
   if(item.jenis==="BAHAN"&&!scope.ctx.can("material.receive"))throw new ForbiddenError();
   if(item.jenis==="BAHAN"&&(!item.material_id||!item.material_satuan_id))throw invalid("items","Master bahan belum dipetakan pada pengajuan.");
   if(item.jenis==="ASET"&&received.jumlah>500)throw invalid("items.jumlah","Penerimaan Aset maksimal 500 unit per baris dalam satu batch.");
   const rejected=await this.rejected(scope,item.id),remaining=(item.jumlah_disetujui??0)-item.jumlah_diterima-(this.policy.rejectedCountsAsFinal?rejected:0);
   if(received.jumlah>remaining)throw invalid("items.jumlah",`Jumlah barang melampaui sisa ${remaining} unit yang disetujui.`);
   if(received.status==="DITOLAK_SAAT_PENERIMAAN"){
    if(!received.alasan?.trim()||!received.foto_file_ids.length)throw invalid("items.alasan","Penolakan penerimaan memerlukan alasan dan minimal satu foto.");
    fileIds.push(...received.foto_file_ids);
   }else{
    if(!received.room_id||item.jenis==="ASET"&&received.nilai_perolehan===undefined)throw invalid("items","Lengkapi lokasi dan nilai perolehan aktual setiap item diterima.");
    if(item.jenis==="BAHAN"&&received.nomor_seri.length)throw invalid("items.nomor_seri","Bahan tidak memiliki nomor seri per unit.");
    if(received.nomor_seri.length&&received.nomor_seri.length!==received.jumlah)throw invalid("items.nomor_seri","Isi satu nomor seri atau kosong untuk setiap unit yang diterima.");
    if(received.foto_file_ids.length||received.alasan)throw invalid("items","Foto penolakan dan alasan hanya untuk barang ditolak.");
   }
  }
  if(new Set(fileIds).size!==fileIds.length)throw invalid("dokumen","Dokumen dan foto tidak boleh dipakai berulang dalam penerimaan.");
  const materialIds=[...new Set(b.items.filter(i=>i.status==="DITERIMA").flatMap(i=>{const p=items.find(r=>r.id===String(i.item_id))!;return p.jenis==="BAHAN"&&p.material_id?[p.material_id]:[]}))];
  if(materialIds.length)await scope.tx.selectFrom("materials").select("id").where("id","in",materialIds).orderBy("id").forUpdate().execute();
  const receipt=await scope.tx.insertInto("procurement_receipts").values({procurement_id:r.id,tanggal_terima:b.tanggal_terima,nomor_dokumen:b.nomor_dokumen,diterima_oleh:String(scope.ctx.userId),catatan:b.catatan??null}).returning("id").executeTakeFirstOrThrow();
  await claimProcurementFiles(scope,"PROCUREMENT_RECEIPT_DOCUMENT",b.dokumen.map(f=>f.file_id),receipt.id,true);
  const assets:string[]=[];
  for(const received of b.items){
   const item=items.find(i=>i.id===String(received.item_id))!;
   const row=await scope.tx.insertInto("procurement_receipt_items").values({receipt_id:receipt.id,item_id:item.id,jumlah:received.jumlah,status:received.status,alasan:received.alasan??null}).returning("id").executeTakeFirstOrThrow();
   if(received.status==="DITOLAK_SAAT_PENERIMAAN"){
    await claimProcurementFiles(scope,"PROCUREMENT_REJECTION_PHOTO",received.foto_file_ids,row.id,true);
    await scope.tx.insertInto("procurement_receipt_files").values(received.foto_file_ids.map((f,i)=>({receipt_id:receipt.id,receipt_item_id:row.id,file_id:String(f),nama_berkas:`Foto penolakan ${i+1}`,jenis:"LAINNYA" as const}))).execute();
    continue;
   }
   if(item.jenis==="BAHAN"){await receiveProcurementMaterial(scope,this.clock,this.audit,{receiptItemId:row.id,materialId:item.material_id!,unitId:item.material_satuan_id!,roomId:received.room_id!,jumlah:received.jumlah,nomor:b.nomor_dokumen});await scope.tx.updateTable("procurement_items").set({jumlah_diterima:item.jumlah_diterima+received.jumlah}).where("id","=",item.id).execute();continue;}
   const service=new AssetService(scope.tx,this.audit,this.clock),base={nama:item.nama_barang,categoryId:Number(item.category_id),merek:received.merek??null,model:received.model??null,tahunPerolehan:Number(b.tanggal_terima.slice(0,4)),sumberPerolehan:"PEMBELIAN" as const,nilaiPerolehan:received.nilai_perolehan!,roomId:received.room_id!,kondisi:received.kondisi,dapatDipinjam:received.dapat_dipinjam,bolehDipinjamSiswa:received.boleh_dipinjam_siswa,penanggungJawabId:null,procurementId:id};
   const created:Awaited<ReturnType<AssetService["daftarkan"]>>[number][]=[];
   if(received.nomor_seri.length){for(const serial of received.nomor_seri)created.push(...await service.daftarkan(scope.ctx,{...base,nomorSeri:serial,jumlahUnit:1},scope));}
   else created.push(...await service.daftarkan(scope.ctx,{...base,nomorSeri:null,jumlahUnit:received.jumlah},scope));
   // Work on a single transaction connection; numbering is serialized by its counter.
   await scope.tx.insertInto("procurement_receipt_assets").values(created.map(a=>({receipt_item_id:row.id,asset_id:a.id}))).execute();assets.push(...created.map(a=>a.id));
   await scope.tx.updateTable("procurement_items").set({jumlah_diterima:item.jumlah_diterima+received.jumlah}).where("id","=",item.id).execute();
  }
  for(const file of b.dokumen){const documentId=await createProcurementAssetDocument(scope,this.audit,file,assets);await scope.tx.insertInto("procurement_receipt_files").values({receipt_id:receipt.id,receipt_item_id:null,file_id:String(file.file_id),nama_berkas:file.nama_berkas,jenis:file.jenis,document_id:documentId}).execute();}
  const final=await repo.items(scope.ctx,r.id);let complete=true;
  for(const item of final){const total=item.jumlah_diterima+(this.policy.rejectedCountsAsFinal?await this.rejected(scope,item.id):0);if(total<(item.jumlah_disetujui??0))complete=false;}
  await scope.tx.updateTable("procurements").set({status:complete?"SELESAI":"DITERIMA_SEBAGIAN",updated_by:String(scope.ctx.userId)}).where("id","=",r.id).execute();
  await this.audit.write(scope,{modul:"m14-procurement",aksi:"PROCUREMENT_RECEIVED",entitas:"procurements",entitasId:r.id,nilaiSesudah:{receipt_id:receipt.id,items:b.items,status:complete?"SELESAI":"DITERIMA_SEBAGIAN"}});
  if(assets.length)await this.audit.write(scope,{modul:"m14-procurement",aksi:"PROCUREMENT_ASSETS_GENERATED",entitas:"procurements",entitasId:r.id,nilaiSesudah:{receipt_id:receipt.id,asset_ids:assets}});
  await publish(scope,{name:"ProcurementReceived",aggregateType:"procurement",aggregateId:r.id,payload:{procurement_id:id,nomor:r.nomor,pengusul_id:Number(r.pengusul_id),jumlah:b.items.filter(i=>i.status==="DITERIMA").reduce((n,i)=>n+i.jumlah,0),jumlah_aset:assets.length,bahan:b.items.filter(i=>i.status==="DITERIMA").flatMap(i=>{const p=items.find(r=>r.id===String(i.item_id))!;return p.jenis==="BAHAN"?[`${i.jumlah} ${p.satuan} ${p.nama_barang}`]:[]}).join(", "),jumlah_ditolak:b.items.filter(i=>i.status==="DITOLAK_SAAT_PENERIMAAN").reduce((n,i)=>n+i.jumlah,0),receipt_id:Number(receipt.id),status:complete?"SELESAI":"DITERIMA_SEBAGIAN"}});
 }
 private async rejected(scope:TransactionScope,itemId:string){const r=await scope.tx.selectFrom("procurement_receipt_items").select(sql<number>`coalesce(sum(jumlah),0)::int`.as("n")).where("item_id","=",itemId).where("status","=","DITOLAK_SAAT_PENERIMAAN").executeTakeFirstOrThrow();return r.n;}
}
