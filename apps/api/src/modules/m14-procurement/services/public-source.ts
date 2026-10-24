import type { TransactionScope,QueryExecutor } from "../../../shared/db/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { createProcurementRepository } from "../repositories/procurement.repository.js";
export async function procurementSource(db:QueryExecutor,ctx:AuthContext,id:number){if(!ctx.can("procurement.view"))return null;const row=await createProcurementRepository(db).read(ctx,id);return row?{id:row.id,nomor:row.nomor}:null;}
export async function procurementDecisionSource(scope:TransactionScope,id:number,urutan:number){
 const r=await scope.tx.selectFrom("approval_instances as i").innerJoin("procurements as p","p.id","i.referensi_id").leftJoin("approval_steps as s",j=>j.onRef("s.instance_id","=","i.id").on("s.urutan","=",urutan)).select(["p.id","p.nomor","p.pengusul_id","s.rincian_keputusan"]).where("i.id","=",String(id)).where("i.jenis_pengajuan","=","PENGADAAN_BARANG").executeTakeFirst();
 if(!r)return null;const details=r.rincian_keputusan as {items?:{jumlah_diusulkan:number;jumlah_disetujui:number|null}[]}|null;
 return {id:Number(r.id),nomor:r.nomor,pengusul_id:Number(r.pengusul_id),sebagian:details?.items?.some(i=>i.jumlah_disetujui!==i.jumlah_diusulkan)??false};
}
