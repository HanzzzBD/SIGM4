import type { TransactionScope } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
/** Fakta DSL milik M-09; pemohon membaca faktanya sendiri, approver membaca konteks pengajuan. */
export async function procurementRequesterOverdue(scope:TransactionScope,userId:number,now:Date){
 if(userId!==scope.ctx.userId&&!scope.ctx.can("procurement.approve"))throw new ForbiddenError();
 return !!await scope.tx.selectFrom("loans").select("id").where("peminjam_id","=",String(userId)).where("tanggal_kembali","is",null).where("tanggal_jatuh_tempo","<",now).executeTakeFirst();
}
