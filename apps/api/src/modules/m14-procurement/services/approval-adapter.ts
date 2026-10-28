import { ProcurementPartialSchema } from "@sigm4/schemas";
import type { PenanganHasil,PenyediaRincian } from "../../m10-approval/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { createProcurementRepository } from "../repositories/procurement.repository.js";
import { approvalQuantities,invalid } from "./rules.js";
import type { ProcurementPolicy } from "./rules.js";
export function procurementApprovalAdapter(audit:AuditLogger,policy:ProcurementPolicy):PenanganHasil{return {
 jenis:"PENGADAAN_BARANG",
 kunciObjek:async(scope,id)=>{if(!await createProcurementRepository(scope.tx).lock(scope.ctx,id))throw new NotFoundError();},
 saatKeputusan:async(scope,id,input)=>{
  if(!scope.ctx.can("procurement.approve"))throw new ForbiddenError();
  if(!input.catatan?.trim())throw invalid("catatan","Catatan keputusan usulan pengadaan wajib diisi.");
  const repo=createProcurementRepository(scope.tx),r=await repo.lock(scope.ctx,id);if(!r||r.status!=="MENUNGGU_PERSETUJUAN")throw invalid("status","Usulan tidak lagi menunggu persetujuan.");
  const items=await repo.items(scope.ctx,r.id);
  if(input.keputusan!=="DISETUJUI"&&input.rincian!==undefined)throw invalid("rincian_keputusan","Rincian jumlah hanya tersedia saat menyetujui usulan.");
  if(input.keputusan==="DISETUJUI"){
   if((await repo.attachments(scope.ctx,r.id)).some(f=>f.checksum===null||f.scan_status!=="CLEAN"))throw invalid("lampiran","Tunggu seluruh lampiran lolos pemeriksaan sebelum menyetujui usulan.");
   let changes:ReturnType<typeof ProcurementPartialSchema.parse>["items"]|undefined;
   if(input.rincian!==undefined){const parsed=ProcurementPartialSchema.safeParse(input.rincian);if(!parsed.success)throw invalid("rincian_keputusan","Isian jumlah disetujui tidak sah.");changes=parsed.data.items;}
   const approved=approvalQuantities(items,changes,policy.allowQuantityIncrease);
   for(const item of approved)await scope.tx.updateTable("procurement_items").set({jumlah_disetujui:item.jumlah_disetujui}).where("id","=",item.id).where("procurement_id","=",r.id).execute();
  }
  const snapshot={items:(await repo.items(scope.ctx,r.id)).map(i=>({item_id:Number(i.id),nama_barang:i.nama_barang,jumlah_diusulkan:i.jumlah_diusulkan,jumlah_disetujui:i.jumlah_disetujui})),keputusan:input.keputusan};
  if(input.keputusan==="DISETUJUI")await audit.write(scope,{modul:"m14-procurement",aksi:"PROCUREMENT_DECIDED",entitas:"procurements",entitasId:r.id,nilaiSesudah:snapshot});return snapshot;
 },
 sebelumDisetujui:async(scope,id)=>{
  const repo=createProcurementRepository(scope.tx),r=await repo.lock(scope.ctx,id);if(!r||r.status!=="MENUNGGU_PERSETUJUAN")throw invalid("status","Usulan tidak lagi menunggu keputusan.");
  const items=await repo.items(scope.ctx,r.id);if(!items.length||!items.some(i=>(i.jumlah_disetujui??0)>0))throw invalid("items","Tidak ada item yang disetujui.");
  const status=items.some(i=>i.jumlah_disetujui!==i.jumlah_diusulkan)?"DISETUJUI_SEBAGIAN":"DISETUJUI";
  await scope.tx.updateTable("procurements").set({status,updated_by:String(scope.ctx.userId)}).where("id","=",r.id).execute();
 },
 setelahDitutup:async(scope,id,status)=>{const r=await createProcurementRepository(scope.tx).lock(scope.ctx,id);if(!r||r.status!=="MENUNGGU_PERSETUJUAN")throw invalid("status","Usulan tidak lagi menunggu keputusan.");await scope.tx.updateTable("procurements").set({status}).where("id","=",r.id).execute();await audit.write(scope,{modul:"m14-procurement",aksi:"PROCUREMENT_DECIDED",entitas:"procurements",entitasId:r.id,nilaiSesudah:{status}});},
};}
export const procurementApprovalSource:PenyediaRincian={jenis:"PENGADAAN_BARANG",rincian:async(scope,id)=>{const r=await createProcurementRepository(scope.tx).lock(scope.ctx,id);if(!r)throw new NotFoundError();return {label:`Usulan ${r.nomor}`,objek:r.judul,tanggal:null,deepLink:`/pengadaan/${r.id}`};}};
