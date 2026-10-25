import { createHash } from "node:crypto";
import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { ChatSend,ChatReference,ChatMessage } from "@sigm4/schemas";
import { ChatReportSchema } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database,TransactionScope } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError,ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { conversations,sessionDto,messageDto } from "../repositories/conversation.repository.js";
import { permissionDigest } from "./prompt.js";
import type { ChatQuota } from "./quota.js";
import { quotaDay } from "./quota.js";
const invalid=(text:string)=>new DomainError("VALIDATION_ERROR",text);
export class ConversationService {
 constructor(private readonly db:Kysely<Database>,private readonly clock:Clock,private readonly audit:AuditLogger){}
 async create(scope:TransactionScope){if(!scope.ctx.can("chat.use"))throw new ForbiddenError();const s=await scope.tx.insertInto("chat_sessions").values({user_id:String(scope.ctx.userId),dimulai_pada:this.clock.now(),terakhir_aktif:this.clock.now()}).returningAll().executeTakeFirstOrThrow();await this.log(scope,"CHAT_SESSION_CREATED",s.id);return sessionDto(s);}
 async begin(ctx:AuthContext,input:ChatSend,quota:ChatQuota){return withTransaction(ctx,async scope=>{
  const repo=conversations(scope.tx),session=await repo.session(ctx,input.session_id,true),hash=createHash("sha256").update(input.pesan).digest("hex"),digest=permissionDigest(ctx);
  const restriction=await scope.tx.selectFrom("chat_restrictions").select("blocked").where("user_id","=",String(ctx.userId)).executeTakeFirst();if(restriction?.blocked)throw new ForbiddenError();
  const stalled=await scope.tx.selectFrom("chat_messages").selectAll().where("session_id","=",session.id).where("status","=","PROCESSING").where("waktu","<",new Date(this.clock.now().getTime()-300000)).execute();
  for(const m of stalled){await scope.tx.updateTable("chat_messages").set({status:"FAILED",isi:"Proses sebelumnya terhenti. Kirim pertanyaan baru.",error_code:"LLM_UNAVAILABLE"}).where("id","=",m.id).execute();await repo.addUsage(ctx,quotaDay(m.waktu).day,{input:0,output:0,cached:0,thought:0},300000,true,{});await this.log(scope,"CHAT_MESSAGE_COMPLETED",session.id,{message_id:m.id,status:"FAILED",reason:"stalled"});}
  const old=await scope.tx.selectFrom("chat_messages").selectAll().where("session_id","=",session.id).where("client_message_id","=",input.client_message_id).where("peran","=","ASSISTANT").executeTakeFirst();
  if(old){if(old.payload_hash!==hash)throw new DomainError("IDEMPOTENCY_KEY_REUSED");if(old.status==="PROCESSING")throw new DomainError("REQUEST_IN_PROGRESS","Giliran ini sedang diproses. Muat ulang riwayat.");return {replay:messageDto(old),messageId:old.id,history:[],digest};}
  const active=await scope.tx.selectFrom("chat_messages").selectAll().where("session_id","=",session.id).where("status","=","PROCESSING").executeTakeFirst();if(active)throw new DomainError("REQUEST_IN_PROGRESS","Sesi masih memproses jawaban. Tunggu atau muat ulang riwayat.");
  const settings=await repo.settings(ctx);if(!settings.enabled)throw new DomainError("LLM_UNAVAILABLE","Chatbot dinonaktifkan. Gunakan pencarian manual.");await quota.consume(ctx,settings.daily,this.clock.now());
  const history=await repo.history(ctx,session.id,digest),identity=await repo.identity(ctx);let safe=input.pesan;
  for(const word of [identity.nama,...identity.nama.split(/\s+/).filter(n=>n.length>=3),identity.email,identity.telepon??""])if(word){const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");safe=safe.replace(new RegExp(escaped,"gi"),"[identitas disamarkan]");}
  safe=safe.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[surel disamarkan]").replace(/\b(?:\+?62|0)\d[\d\s-]{7,15}\b/g,"[telepon disamarkan]");
  const steps=[{type:"user_input",content:[{type:"text",text:safe}]}];
  await scope.tx.insertInto("chat_messages").values({session_id:session.id,client_message_id:input.client_message_id,payload_hash:hash,peran:"USER",isi:input.pesan,status:"COMPLETED",steps:JSON.stringify(steps),permission_digest:digest,waktu:this.clock.now()}).execute();
  const m=await scope.tx.insertInto("chat_messages").values({session_id:session.id,client_message_id:input.client_message_id,payload_hash:hash,peran:"ASSISTANT",isi:"",status:"PROCESSING",permission_digest:digest,waktu:this.clock.now()}).returning("id").executeTakeFirstOrThrow();
  await scope.tx.updateTable("chat_sessions").set({judul:session.judul==="Percakapan baru"?input.pesan.slice(0,80):session.judul,terakhir_aktif:this.clock.now()}).where("id","=",session.id).execute();
  const anomaly=/(?:ignore|abaikan)\s+(?:all|semua|previous|instruksi)|system\s*prompt|api\s*key|bocorkan.*(?:token|password)/i.test(input.pesan);
  await this.log(scope,"CHAT_MESSAGE_SENT",session.id,{message_id:m.id,panjang:input.pesan.length,anomaly});return {replay:null,messageId:m.id,history:[...history,...steps] as Record<string,unknown>[],digest,settings};
 },this.db);}
 async finish(ctx:AuthContext,input:ChatSend,id:string,result:{text:string;steps:Record<string,unknown>[];refs:ChatReference[];status:ChatMessage["status"];error:string|null;usage:{input:number;output:number;cached:number;thought:number};tools:Record<string,number>;elapsed:number}){return withTransaction(ctx,async scope=>{
  await conversations(scope.tx).session(ctx,input.session_id,true);
  const m=await scope.tx.updateTable("chat_messages").set({isi:result.text,status:result.status,steps:JSON.stringify(result.steps),references_data:JSON.stringify(result.refs),tools_dipanggil:JSON.stringify(Object.keys(result.tools)),token_input:result.usage.input,token_output:result.usage.output,token_cached:result.usage.cached,token_thought:result.usage.thought,elapsed_ms:result.elapsed,error_code:result.error}).where("id","=",id).where("session_id","=",input.session_id).where("status","=","PROCESSING").returningAll().executeTakeFirstOrThrow();
  await conversations(scope.tx).addUsage(ctx,quotaDay(m.waktu).day,result.usage,result.elapsed,result.status==="FAILED",result.tools);await this.log(scope,"CHAT_MESSAGE_COMPLETED",input.session_id,{message_id:id,status:result.status,tools:Object.keys(result.tools),token_input:result.usage.input,token_output:result.usage.output});return messageDto(m);
 },this.db);}
 async feedback(scope:TransactionScope,id:string,nilai:"UP"|"DOWN"){
  const m=await scope.tx.selectFrom("chat_messages").selectAll().where("id","=",id).where("peran","=","ASSISTANT").executeTakeFirst();if(!m)throw new NotFoundError();await conversations(scope.tx).session(scope.ctx,m.session_id,true);if(m.status==="PROCESSING")throw invalid("Jawaban belum selesai.");
  if(m.umpan_balik!==nilai){await scope.tx.updateTable("chat_messages").set({umpan_balik:nilai}).where("id","=",id).execute();const day=quotaDay(m.waktu).day;await scope.tx.updateTable("chat_usage_daily").set({positive:sql`positive+${(nilai==="UP"?1:0)-(m.umpan_balik==="UP"?1:0)}`,negative:sql`negative+${(nilai==="DOWN"?1:0)-(m.umpan_balik==="DOWN"?1:0)}`}).where("tanggal","=",day).execute();await this.log(scope,"CHAT_FEEDBACK_UPDATED",m.session_id,{message_id:id,nilai});}return messageDto({...m,umpan_balik:nilai});
 }
 async report(scope:TransactionScope,id:string,input:unknown){const body=ChatReportSchema.parse(input);await conversations(scope.tx).session(scope.ctx,id,true);const m=await scope.tx.selectFrom("chat_messages").select("id").where("id","=",body.message_id).where("session_id","=",id).where("peran","=","ASSISTANT").where("status","!=","PROCESSING").executeTakeFirst();if(!m)throw invalid("Pilih jawaban dari sesi ini.");await scope.tx.updateTable("chat_sessions").set({reported_at:this.clock.now(),reported_message_id:m.id,report_note:body.alasan}).where("id","=",id).execute();await this.log(scope,"CHAT_SESSION_REPORTED",id,{message_id:m.id,izinkan_berbagi:true});return sessionDto(await conversations(scope.tx).session(scope.ctx,id));}
 async restrict(scope:TransactionScope,id:string,blocked:boolean,alasan:string){if(scope.ctx.roleCode!=="R-01"||!scope.ctx.can("setting.manage"))throw new ForbiddenError();const s=await conversations(scope.tx).session(scope.ctx,id,true,true);await scope.tx.insertInto("chat_restrictions").values({user_id:s.user_id,blocked,updated_at:this.clock.now(),updated_by:String(scope.ctx.userId)}).onConflict(c=>c.column("user_id").doUpdateSet({blocked,updated_at:this.clock.now(),updated_by:String(scope.ctx.userId)})).execute();await this.audit.write(scope,{modul:"m19-chatbot",aksi:"CHAT_ACCESS_RESTRICTED",entitas:"chat_sessions",entitasId:id,nilaiSesudah:{blocked},keterangan:alasan});return {blocked};}
 async remove(scope:TransactionScope,id:string,archive=false){if(!archive)await conversations(scope.tx).session(scope.ctx,id,true);const active=await scope.tx.selectFrom("chat_messages").select("id").where("session_id","=",id).where("status","=","PROCESSING").executeTakeFirst();if(active)throw new DomainError("REQUEST_IN_PROGRESS","Tunggu jawaban selesai sebelum menghapus sesi.");await scope.tx.updateTable("chat_sessions").set({reported_message_id:null,reported_at:null,report_note:null}).where("id","=",id).execute();await sql`delete from idempotency_keys k where (k.endpoint='POST /chat/sessions' and k.response_body->'data'->>'id'=${id}) or k.endpoint=${`POST /chat/sessions/${id}/report`} or exists(select 1 from chat_messages m where m.session_id=${id} and k.endpoint='POST /chat/messages/'||m.id||'/feedback')`.execute(scope.tx);await scope.tx.deleteFrom("chat_sessions").where("id","=",id).execute();await this.log(scope,archive?"CHAT_SESSION_ARCHIVED":"CHAT_SESSION_DELETED",id);}
 private log(scope:TransactionScope,action:string,id:string,metadata:Record<string,unknown>={}){return this.audit.write(scope,{modul:"m19-chatbot",aksi:action,entitas:"chat_sessions",entitasId:id,nilaiSesudah:metadata});}
}
