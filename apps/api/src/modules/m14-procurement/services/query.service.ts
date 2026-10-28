import { ProcurementDetailSchema,ProcurementSummarySchema } from "@sigm4/schemas";
import type { ProcurementListQuery } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database,QueryExecutor } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { PenyimpananObjek } from "../../../shared/storage/index.js";
import { NotFoundError,ForbiddenError } from "../../../shared/errors/index.js";
import { urlUnduhBerkas } from "../../m06-documents/index.js";
import { createProcurementRepository } from "../repositories/procurement.repository.js";
type Row=NonNullable<Awaited<ReturnType<ReturnType<typeof createProcurementRepository>["read"]>>>;
export const procurementSummary=(r:Row)=>ProcurementSummarySchema.parse({...r,pengusul:{id:r.pengusul_id,nama:r.pengusul_nama,role_kode:r.pengusul_role},approval_instance_id:r.approval_instance_id===null?null:Number(r.approval_instance_id),created_at:r.created_at.toISOString(),updated_at:r.updated_at.toISOString()});
export class ProcurementQueryService{
 constructor(private readonly db:Kysely<Database>,private readonly clock:Clock,private readonly storage:PenyimpananObjek){}
 async list(ctx:AuthContext,f:ProcurementListQuery){const result=await createProcurementRepository(this.db).list(ctx,f);return {...result,data:result.data.map(procurementSummary)};}
 async detailForReview(ctx:AuthContext,id:number){if(!ctx.can("procurement.approve"))throw new ForbiddenError();return this.detail(ctx,id,this.db,true);}
 async detail(ctx:AuthContext,id:number,executor:QueryExecutor=this.db,review=false){
  const repo=createProcurementRepository(executor),r=await repo.read(ctx,id,false,review);if(!r)throw new NotFoundError("Usulan pengadaan tidak ditemukan.");
  const [items,attachments,receipts,ids]=await Promise.all([repo.items(ctx,r.id),repo.attachments(ctx,r.id),repo.receipts(ctx,r.id),repo.approvalIds(ctx,r.id)]);
  const file=async(f:typeof attachments[number])=>({file_id:f.file_id,nama_berkas:f.nama_berkas,status:f.checksum===null?"BELUM_TERUNGGAH":f.scan_status,url:f.checksum!==null&&f.scan_status==="CLEAN"?(await urlUnduhBerkas(this.storage,this.clock,f)).url:null});
  const penerimaan=await Promise.all(receipts.map(async receipt=>{const [rows,files]=await Promise.all([repo.receiptItems(ctx,receipt.id),repo.receiptFiles(ctx,receipt.id)]);return {id:receipt.id,tanggal_terima:receipt.tanggal_terima,nomor_dokumen:receipt.nomor_dokumen,catatan:receipt.catatan,diterima_oleh:receipt.nama_penerima,dokumen:await Promise.all(files.filter(f=>f.receipt_item_id===null).map(file)),items:await Promise.all(rows.map(async row=>({...row,assets:await repo.receiptAssets(ctx,row.id),bahan:await repo.receiptMaterial(ctx,row.id)??null,foto:await Promise.all(files.filter(f=>f.receipt_item_id===row.id).map(file))})))}}));
  return ProcurementDetailSchema.parse({...procurementSummary(r),items,lampiran:await Promise.all(attachments.map(file)),approval_ids:ids.map(i=>Number(i.id)),penerimaan,dukungan:await repo.support(ctx,[...new Set(items.flatMap(i=>i.category_id?[i.category_id]:[]))])});
 }
}
