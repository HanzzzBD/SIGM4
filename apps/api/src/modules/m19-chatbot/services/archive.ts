import type { Kysely } from "kysely";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import { conversations } from "../repositories/conversation.repository.js";
import { ConversationService } from "./conversation.service.js";
import { quotaDay } from "./quota.js";
/** BR-078/DP-AI-05: hapus isi dan FK akun, bukan sekadar menyembunyikan baris. */
export async function archiveChat(db:Kysely<Database>,ctx:AuthContext,clock:Clock,audit:AuditLogger){
 if(!isSystemAuthContext(ctx))throw new Error("Retensi memerlukan pelaku SYSTEM.");
 const service=new ConversationService(db,clock,audit),cutoff=new Date(clock.now().getTime()-90*86400000);let total=0;
 for(;;){const n=await withTransaction(ctx,async scope=>{
  const repo=conversations(scope.tx),rows=await repo.clearExpired(ctx,cutoff,new Date(clock.now().getTime()-300000));
  for(const row of rows){
   const stalled=await scope.tx.updateTable("chat_messages").set({status:"FAILED",isi:"Proses terhenti sebelum retensi.",error_code:"LLM_UNAVAILABLE"}).where("session_id","=",row.id).where("status","=","PROCESSING").returning(["id","waktu"]).execute();
   for(const m of stalled){await repo.addUsage(ctx,quotaDay(m.waktu).day,{input:0,output:0,cached:0,thought:0},300000,true,{});await audit.write(scope,{modul:"m19-chatbot",aksi:"CHAT_MESSAGE_COMPLETED",entitas:"chat_sessions",entitasId:row.id,nilaiSesudah:{message_id:m.id,status:"FAILED",reason:"stalled"}});}
   await service.remove(scope,row.id,true);
  }return rows.length;
 },db);total+=n;if(n<100)break;}
 return total;
}
