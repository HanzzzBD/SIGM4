import type { AuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { createWorkOrderRepository } from "../repositories/work-order.repository.js";

/** P-41: hanya ungkap tautan WO yang dapat dibaca pemanggil. */
export async function workOrderForTicket(db:QueryExecutor,ctx:AuthContext,ticketId:number){
 if(!ctx.can("workorder.view"))return null;
 const row=await createWorkOrderRepository(db).byTicket(ctx,ticketId);
 if(!row||(ctx.scopeOf("workorder.view")!=="all"&&row.teknisi_id!==String(ctx.userId)))return null;
 return {id:row.id,nomor:row.nomor};
}
