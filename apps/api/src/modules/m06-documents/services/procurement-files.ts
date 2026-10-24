import type { TransactionScope,AssetDocumentType } from "../../../shared/db/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError,ForbiddenError } from "../../../shared/errors/index.js";
import { createAssetDocumentRepository } from "../repositories/asset-document.repository.js";
export type ProcurementFileKind="PROCUREMENT_ATTACHMENT"|"PROCUREMENT_RECEIPT_DOCUMENT"|"PROCUREMENT_REJECTION_PHOTO";
export async function claimProcurementFiles(scope:TransactionScope,kind:ProcurementFileKind,ids:readonly number[],ownerId:string,clean:boolean){
 if(!scope.ctx.can(kind==="PROCUREMENT_ATTACHMENT"?"procurement.create":"procurement.receive"))throw new ForbiddenError();
 if(new Set(ids).size!==ids.length)throw new DomainError("VALIDATION_ERROR","Berkas tidak boleh berulang.");
 if(!ids.length)return;
 const files=await scope.tx.selectFrom("stored_files").select(["id","mime"]).where("id","in",ids.map(String)).where("uploaded_by","=",String(scope.ctx.userId)).where("owner_type","=",kind).where("checksum","is not",null).where("scan_status","in",clean?["CLEAN"]:["PENDING","CLEAN"]).where(e=>e.or([e("owner_id","is",null),e("owner_id","=",ownerId)])).orderBy("id").forUpdate().execute();
 if(files.length!==ids.length||(kind==="PROCUREMENT_REJECTION_PHOTO"&&files.some(f=>!["image/jpeg","image/png"].includes(f.mime))))throw new DomainError("VALIDATION_ERROR",clean?"Berkas harus milik Anda, berjenis sesuai, terkonfirmasi, belum dipakai di entitas lain, dan lolos pemeriksaan.":"Berkas lampiran tidak ditemukan, milik akun lain, sudah dipakai, atau belum dikonfirmasi.");
 await scope.tx.updateTable("stored_files").set({owner_id:ownerId}).where("id","in",ids.map(String)).execute();
}
/** BR-065: satu dokumen M-06 dengan tautan ke semua aset baru, atomik pada transaksi penerimaan. */
export async function createProcurementAssetDocument(scope:TransactionScope,audit:AuditLogger,input:{file_id:number;nama_berkas:string;jenis:AssetDocumentType},assetIds:readonly string[]){
 if(!scope.ctx.can("procurement.receive"))throw new ForbiddenError();
 if(!assetIds.length)return null;
 const repo=createAssetDocumentRepository(scope.tx),id=await repo.buat(scope.ctx,{fileId:input.file_id,jenis:input.jenis,namaBerkas:input.nama_berkas,keterangan:"Dokumen penerimaan pengadaan",garansiMulai:null,garansiSelesai:null});
 await repo.tautkan(scope.ctx,id,assetIds.map(Number));
 await audit.write(scope,{modul:"m06-documents",aksi:"DOCUMENT_UPLOADED",entitas:"asset_documents",entitasId:id,nilaiSesudah:{file_id:input.file_id,jenis:input.jenis,asset_ids:assetIds}});return id;
}
