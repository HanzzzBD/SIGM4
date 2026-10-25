import express from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { ChatSendSchema,ChatFeedbackSchema,ChatReportSchema,ChatRestrictionSchema,ChatListQuerySchema,ChatSessionResponseSchema,ChatSessionsResponseSchema,ChatDetailResponseSchema,ChatMonitorResponseSchema,ChatMessageSchema,ChatUsageResponseSchema } from "@sigm4/schemas";
import type { Kysely } from "kysely";
import type { Database } from "../../shared/db/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { AuditLogger } from "../../shared/audit/index.js";
import { requireAuthContext } from "../../shared/auth/index.js";
import { defineRoute,runIdempotent } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import { DomainError } from "../../shared/errors/index.js";
import type { ChatProvider } from "./services/provider.js";
import type { ChatQuota } from "./services/quota.js";
import { quotaDay } from "./services/quota.js";
import { ConversationService } from "./services/conversation.service.js";
import { AiOrchestrator } from "./services/orchestrator.js";
import { conversations } from "./repositories/conversation.repository.js";
const params=z.object({id:z.string().regex(/^[1-9]\d*$/)}),empty=z.object({}).strict();
const base={module:"m19-chatbot",rateLimitClass:"default" as const},ok=z.object({success:z.literal(true),data:z.object({deleted:z.literal(true)}),meta:z.null()});
export const chatRoutes:readonly RouteDefinition[]=[
 defineRoute({...base,method:"POST",path:"/chat/sessions",permission:"chat.use",body:empty,response:ChatSessionResponseSchema,idempotent:true,summary:"Mulai sesi chatbot sendiri"}),
 defineRoute({...base,method:"POST",path:"/chat/messages",permission:"chat.use",rateLimitClass:"chat",body:ChatSendSchema,response:z.string(),contentType:"text/event-stream",successStatus:200,summary:"SSE pesan dengan UUID stabil; start/delta/error/done"}),
 defineRoute({...base,method:"GET",path:"/chat/sessions",permission:"chat.use",query:ChatListQuerySchema,response:ChatSessionsResponseSchema,summary:"Riwayat percakapan sendiri"}),
 defineRoute({...base,method:"GET",path:"/chat/sessions/:id",permission:"chat.use",params,query:z.object({before:z.string().regex(/^[1-9]\d*$/).optional()}).strict(),response:ChatDetailResponseSchema,summary:"Maksimal 100 pesan terbaru; before untuk halaman lama"}),
 defineRoute({...base,method:"DELETE",path:"/chat/sessions/:id",permission:"chat.use",params,body:empty,response:ok,idempotent:true,summary:"Hapus isi percakapan sendiri, statistik anonim tetap"}),
 defineRoute({...base,method:"POST",path:"/chat/messages/:id/feedback",permission:"chat.use",params,body:ChatFeedbackSchema,response:z.object({success:z.literal(true),data:ChatMessageSchema,meta:z.null()}),idempotent:true,successStatus:200,summary:"Jempol atas/turun; tidak memberi izin berbagi sesi"}),
 defineRoute({...base,method:"POST",path:"/chat/sessions/:id/report",permission:"chat.use",params,body:ChatReportSchema,response:ChatSessionResponseSchema,idempotent:true,successStatus:200,summary:"Laporkan masalah dengan izin eksplisit berbagi sesi"}),
 defineRoute({...base,method:"GET",path:"/chat/monitor",permission:"chat.monitor",response:ChatMonitorResponseSchema,summary:"Statistik anonim dan daftar sesi yang diizinkan berbagi"}),
 defineRoute({...base,method:"GET",path:"/chat/reports/:id",permission:"chat.monitor",params,query:z.object({before:z.string().regex(/^[1-9]\d*$/).optional()}).strict(),response:ChatDetailResponseSchema,summary:"Isi sesi dilaporkan; tidak ada akses ke sesi pribadi lain"}),
 defineRoute({...base,method:"POST",path:"/chat/reports/:id/access",permission:"setting.manage",params,body:ChatRestrictionSchema,response:z.object({success:z.literal(true),data:z.object({blocked:z.boolean()}),meta:z.null()}),idempotent:true,successStatus:200,summary:"Admin membatasi/memulihkan chatbot pemilik sesi dilaporkan"}),
 defineRoute({...base,method:"GET",path:"/chat/usage",permission:"chat.use",response:ChatUsageResponseSchema,summary:"Kuota harian/token milik penanya; tanpa identitas ke model"})
];
export interface ChatDeps {db:Kysely<Database>;clock:Clock;audit:AuditLogger;provider:ChatProvider|null;quota:ChatQuota|null;enabled:boolean}
function parse<T>(schema:z.ZodType<T>,value:unknown):T{const p=schema.safeParse(value);if(!p.success)throw new DomainError("VALIDATION_ERROR","Isian chatbot tidak sah.");return p.data;}
export function chatRouter(d:ChatDeps,limit:(r:RouteDefinition)=>RequestHandler,authorize:(p:string)=>RequestHandler){
 const router=express.Router(),store=new ConversationService(d.db,d.clock,d.audit),ai=new AiOrchestrator(d.db,d.clock,store,d.provider,d.quota,d.enabled);
 for(const r of chatRoutes){const handler:RequestHandler=async(req,res)=>{
  const ctx=requireAuthContext(res),id=r.params?parse(params,req.params).id:"";
   if(r.path==="/chat/messages"){
   const input=parse(ChatSendSchema,req.body),abort=new AbortController();res.on("close",()=>abort.abort());
   await ai.send(ctx,input,event=>{if(!res.headersSent){res.setHeader("Content-Type","text/event-stream");res.setHeader("Cache-Control","no-store");res.setHeader("X-Accel-Buffering","no");res.flushHeaders();}if(!res.destroyed)res.write(`data: ${JSON.stringify(event)}\n\n`);},abort.signal).catch(e=>{if(!res.headersSent)throw e;if(!res.destroyed)res.write(`data: ${JSON.stringify({type:"error",code:"LLM_UNAVAILABLE",message:"Chatbot belum dapat menjawab. Muat ulang riwayat dan gunakan pencarian manual."})}\n\n`);});res.end();return;
  }
  const repo=conversations(d.db);
  if(r.method==="GET"){
   if(r.path==="/chat/usage"){const {day,reset}=quotaDay(d.clock.now()),settings=await repo.settings(ctx),used=d.quota?await d.quota.used(ctx,d.clock.now()):0;res.json({success:true,data:{capability:!d.enabled||!settings.enabled?"DISABLED":!d.provider||!d.quota?"UNAVAILABLE":"AVAILABLE",tanggal:day,batas:settings.daily,terpakai:used,tersisa:Math.max(0,settings.daily-used),reset_at:reset.toISOString(),...await repo.ownUsage(ctx,new Date(reset.getTime()-86400000),reset)},meta:null});return;}
   if(r.path==="/chat/sessions"){const p=parse(ChatListQuerySchema,req.query);res.json({success:true,...await repo.list(ctx,p.page,p.per_page)});return;}
   let data:unknown;if(r.path==="/chat/monitor"){const from=new Date(d.clock.now().getTime()-30*86400000).toISOString().slice(0,10);data={...await repo.monitor(ctx,from,new Date(d.clock.now().getTime()+7*3600000).toISOString().slice(0,10)),llm_status:!d.enabled||!d.provider?"DISABLED":"CONFIGURED"};}
   else data=await repo.messages(ctx,id,parse(z.object({before:z.string().regex(/^[1-9]\d*$/).optional()}).strict(),req.query).before,r.path.startsWith("/chat/reports"));
   res.json({success:true,data,meta:null});return;
  }
  const body=parse(r.body!,req.body??{}),endpoint=`${r.method} ${req.path}`,out=await runIdempotent(d.db,ctx,{key:req.header("Idempotency-Key")??"",endpoint,body:{payload:body,owner:ctx.userId,endpoint}},async scope=>{
   let data:unknown;if(r.path==="/chat/sessions")data=await store.create(scope);else if(r.method==="DELETE"){await store.remove(scope,id);data={deleted:true};}else if(r.path.endsWith("/feedback"))data=await store.feedback(scope,id,ChatFeedbackSchema.parse(body).nilai);else if(r.path.endsWith("/access"))data=await store.restrict(scope,id,ChatRestrictionSchema.parse(body).blocked,ChatRestrictionSchema.parse(body).alasan);else data=await store.report(scope,id,body);
   return {statusCode:r.path==="/chat/sessions"?201:200,body:{success:true,data,meta:null}};
  });res.status(out.statusCode).json(out.body);
 };router[r.method==="GET"?"get":r.method==="DELETE"?"delete":"post"](r.path,limit(r),authorize(r.permission!),handler);}
 return router;
}
