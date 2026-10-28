import { sql } from "kysely";
import { ChatMessageSchema,ChatSessionSchema } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor,Database } from "../../../shared/db/index.js";
import type { Selectable } from "kysely";
import { ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { DEFAULT_CHAT_MODEL } from "../services/model.js";
export const sessionDto=(s:Selectable<Database["chat_sessions"]>)=>ChatSessionSchema.parse({...s,dimulai_pada:s.dimulai_pada.toISOString(),terakhir_aktif:s.terakhir_aktif.toISOString(),reported:s.reported_at!==null});
export const messageDto=(m:Selectable<Database["chat_messages"]>)=>ChatMessageSchema.parse({...m,waktu:m.waktu.toISOString(),references:m.references_data});
class ConversationRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 async session(ctx:AuthContext,id:string,lock=false,report=false){
  if(report?(!ctx.can("chat.monitor")||ctx.roleCode!=="R-01"):!ctx.can("chat.use"))throw new ForbiddenError();
  const s=await this.query(ctx).selectFrom("chat_sessions").selectAll().where("id","=",id).$if(report,q=>q.where("reported_at","is not",null)).$if(!report,q=>q.where("user_id","=",String(ctx.userId))).$if(lock,q=>q.forUpdate()).executeTakeFirst();if(!s)throw new NotFoundError();return s;
 }
 async list(ctx:AuthContext,page:number,size:number){
  if(!ctx.can("chat.use"))throw new ForbiddenError();const q=this.query(ctx).selectFrom("chat_sessions").where("user_id","=",String(ctx.userId));
  const count=await q.select(e=>e.fn.countAll<string>().as("n")).executeTakeFirstOrThrow(),rows=await q.selectAll().orderBy("terakhir_aktif","desc").orderBy("id","desc").limit(size).offset((page-1)*size).execute();return {data:rows.map(sessionDto),meta:{page,per_page:size,total:Number(count.n),total_pages:Math.max(1,Math.ceil(Number(count.n)/size))}};
 }
 async messages(ctx:AuthContext,id:string,before?:string,report=false){const s=await this.session(ctx,id,false,report);const rows=await this.query(ctx).selectFrom("chat_messages").selectAll().where("session_id","=",id).$if(!!before,q=>q.where("id","<",before!)).orderBy("id","desc").limit(101).execute();return {session:sessionDto(s),messages:rows.slice(0,100).reverse().map(messageDto),has_more:rows.length>100,report_note:report?s.report_note:null};}
 async history(ctx:AuthContext,id:string,digest:string){await this.session(ctx,id);return this.query(ctx).selectFrom("chat_messages").select(["steps","permission_digest"]).where("session_id","=",id).where("status","in",["COMPLETED","INCOMPLETE"]).orderBy("id","desc").limit(10).execute().then(rows=>rows.some(r=>r.permission_digest!==digest)?[]:rows.reverse().flatMap(r=>Array.isArray(r.steps)?r.steps:[]));}
 async settings(ctx:AuthContext){const rows=await this.query(ctx).selectFrom("system_settings").select(["key","value"]).where("key","like","chat.%").execute();const m=new Map(rows.map(r=>[r.key,r.value]));return {enabled:m.get("chat.aktif")===true,model:String(m.get("chat.model")??DEFAULT_CHAT_MODEL),daily:Number(m.get("chat.batas_harian")??50),alarm:Number(m.get("chat.ambang_token_harian")??0)};}
 async identity(ctx:AuthContext){return this.query(ctx).selectFrom("users").select(["nama","email","telepon"]).where("id","=",String(ctx.userId)).executeTakeFirstOrThrow();}
 async ownUsage(ctx:AuthContext,from:Date,to:Date){if(!ctx.can("chat.use"))throw new ForbiddenError();const rows=await this.query(ctx).selectFrom("chat_messages as m").innerJoin("chat_sessions as s","s.id","m.session_id").select(["m.token_input","m.token_output"]).where("s.user_id","=",String(ctx.userId)).where("m.waktu",">=",from).where("m.waktu","<",to).execute();return {token_input:rows.reduce((n,r)=>n+r.token_input,0),token_output:rows.reduce((n,r)=>n+r.token_output,0)};}
 async monitor(ctx:AuthContext,from:string,today:string){
  if(!ctx.can("chat.monitor"))throw new ForbiddenError();const rows=await this.query(ctx).selectFrom("chat_usage_daily").selectAll().where("tanggal",">=",from).execute();
  const sum=(key:keyof typeof rows[number])=>rows.reduce((s,r)=>s+Number(r[key]),0),tools:Record<string,number>={};for(const r of rows)for(const [k,n] of Object.entries(r.tool_counts as Record<string,number>))tools[k]=(tools[k]??0)+n;
  const reports=ctx.roleCode==="R-01"?await this.query(ctx).selectFrom("chat_sessions").selectAll().where("reported_at","is not",null).orderBy("reported_at","desc").limit(50).execute():[],latest=await this.query(ctx).selectFrom("chat_evaluations").selectAll().orderBy("pada","desc").limit(1).executeTakeFirst();
  const input=sum("input_tokens"),messages=sum("messages"),config=await this.settings(ctx),daily=rows.filter(r=>String(r.tanggal).slice(0,10)===today).reduce((n,r)=>n+Number(r.input_tokens)+Number(r.output_tokens),0);return {messages,failures:sum("failures"),positive:sum("positive"),negative:sum("negative"),input_tokens:input,output_tokens:sum("output_tokens"),cached_tokens:sum("cached_tokens"),thought_tokens:sum("thought_tokens"),average_latency_ms:messages?sum("total_latency_ms")/messages:0,chat_cache_read_ratio:input?sum("cached_tokens")/input:0,tool_counts:tools,reports:reports.map(sessionDto),latest_evaluation:latest?{mode:latest.mode,model:latest.model,pada:latest.pada.toISOString(),accuracy:Number(latest.accuracy),critical_failures:latest.critical_failures,total:latest.total}:null,quota_alarm:config.alarm>0&&daily>=config.alarm};
 }
 async clearExpired(ctx:AuthContext,cutoff:Date,activeAfter:Date){return this.query(ctx).selectFrom("chat_sessions as s").select("s.id").where("s.dimulai_pada","<",cutoff).where(e=>e.not(e.exists(e.selectFrom("chat_messages as m").select("id").whereRef("m.session_id","=","s.id").where("m.status","=","PROCESSING").where("m.waktu",">=",activeAfter)))).orderBy("s.id").forUpdate().skipLocked().limit(100).execute();}
 async addUsage(ctx:AuthContext,day:string,u:{input:number;output:number;cached:number;thought:number},elapsed:number,failed:boolean,tools:Record<string,number>){
  await sql`insert into chat_usage_daily(tanggal,messages,failures,input_tokens,output_tokens,cached_tokens,thought_tokens,total_latency_ms,tool_counts) values(${day},1,${failed?1:0},${u.input},${u.output},${u.cached},${u.thought},${elapsed},${JSON.stringify(tools)}::jsonb)
  on conflict(tanggal) do update set messages=chat_usage_daily.messages+1,failures=chat_usage_daily.failures+excluded.failures,input_tokens=chat_usage_daily.input_tokens+excluded.input_tokens,output_tokens=chat_usage_daily.output_tokens+excluded.output_tokens,cached_tokens=chat_usage_daily.cached_tokens+excluded.cached_tokens,thought_tokens=chat_usage_daily.thought_tokens+excluded.thought_tokens,total_latency_ms=chat_usage_daily.total_latency_ms+excluded.total_latency_ms,
  tool_counts=(select coalesce(jsonb_object_agg(k,n),'{}') from (select k,sum(v::int) n from (select key k,value v from jsonb_each_text(chat_usage_daily.tool_counts) union all select key,value from jsonb_each_text(excluded.tool_counts)) t group by k) t)`.execute(this.query(ctx));
 }
}
export const conversations=(db:QueryExecutor)=>defineRepository(new ConversationRepository(db));
