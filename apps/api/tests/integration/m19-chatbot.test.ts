import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync,mkdtempSync,readdirSync,rmSync,readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename,join,resolve } from "node:path";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll,beforeAll,describe,it,expect } from "vitest";
import { ChatSessionResponseSchema,ChatEventParser,ChatMonitorResponseSchema } from "@sigm4/schemas";
import type { ChatEvent } from "@sigm4/schemas";
import { createApp } from "../../src/api/index.js";
import { ToolExecutor,ProviderError,archiveChat,recordChatEvaluation } from "../../src/modules/m19-chatbot/index.js";
import type { ChatProvider,ProviderRequest,ProviderResult,ChatQuota } from "../../src/modules/m19-chatbot/index.js";
import { createAuthContext,setAuthContext,setAmr,AMR_OTP } from "../../src/shared/auth/index.js";
import type { Scope } from "../../src/shared/auth/index.js";
import { createSystemAuthContext } from "../../src/shared/auth/system-context.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb,withTransaction } from "../../src/shared/db/index.js";
import { Logger,HealthRegistry } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { dbmate,kueri,DIR_MIGRATION } from "../helpers/db.js";
interface Actor{id:number;role:string;permissions:string[]}
class TestProvider implements ChatProvider {
 wait:Promise<void>|null=null;
 requests:ProviderRequest[]=[];mode:"normal"|"429"|"retry"|"limit"|"failed"="normal";tries=0;
 countTokens=async()=>6000;probe=async()=>true;
 async create(r:ProviderRequest,onDelta:(s:string)=>void):Promise<ProviderResult>{this.requests.push(structuredClone(r));this.tries++;
  if(this.wait)await this.wait;
  if(this.mode==="429")throw new ProviderError(429,30);if(this.mode==="retry"&&this.tries<3)throw new ProviderError(503);
  const u={input:6000,output:20,cached:4500,thought:1};if(this.mode==="failed")return {status:"failed",steps:[],text:"secret output",usage:u};
  if(this.mode==="limit"&&!r.noTools)return {status:"requires_action",steps:Array.from({length:7},(_,i)=>({type:"function_call",id:`c${i}`,name:"get_material_stock",arguments:{}})),text:"",usage:u};
  if(!r.steps.some(s=>s["type"]==="function_result"))return {status:"requires_action",steps:[{type:"thought",signature:"opaque"},{type:"function_call",id:"f1",name:"search_assets",arguments:{kata_kunci:"Proyektor"}}],text:"",usage:u};
  const text="Proyektor CHAT-PUB tersedia di Aula.";onDelta(text);return {status:"completed",steps:[{type:"model_output",content:[{type:"text",text}]}],text,usage:u};
 }
 reset(mode:TestProvider["mode"]="normal"){this.mode=mode;this.requests=[];this.tries=0;this.wait=null;}
}
describe.skipIf(!process.env["DATABASE_URL"])("PR-03-20/21/22/23/34 + PR-05-25/36: chatbot",()=>{
 let server:Server,base="",migrations:string|undefined,admin:Actor,student:Actor,other:Actor,room=0;const clock=new FixedClock(new Date("2026-10-14T03:00:00Z")),provider=new TestProvider(),consumed:number[]=[];
 const quota:ChatQuota={consume:async ctx=>{consumed.push(ctx.userId);},used:async ctx=>consumed.filter(id=>id===ctx.userId).length},audit=new AuditLogger({clock}),marker=randomUUID().slice(0,7);
 const id=async(q:string)=>Number((await kueri<{id:string}>(q))[0]!.id);
 const actor=async(role:string,permissions:string[]):Promise<Actor>=>({id:await id(`insert into users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) values('Pribadi ${marker}','${randomUUID()}@chat.test','x','${randomUUID()}',(select id from roles where kode='${role}'),'AKTIF',false) returning id::text`),role,permissions});
 const context=(a:Actor)=>createAuthContext({userId:a.id,roleCode:a.role,scopes:new Map(a.permissions.map(p=>[p.split(":")[0]!,p.split(":")[1] as Scope??"all"]))});
 const raw=async(path:string,a:Actor,body?:unknown,key=randomUUID(),method=body===undefined?"GET":"POST")=>fetch(`${base}${path}`,{method,headers:{"content-type":"application/json","x-user":String(a.id),"x-role":a.role,"x-perms":a.permissions.join(","),"Idempotency-Key":key},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const send=async(path:string,a:Actor,body?:unknown,key=randomUUID(),method?:string)=>{const r=await raw(path,a,body,key,method);return {status:r.status,json:await r.json() as {data:Record<string,unknown>;error?:{code:string}}};};
 const session=async(a=admin,key=randomUUID())=>{const r=await send("/chat/sessions",a,{},key);expect(r.status).toBe(201);return ChatSessionResponseSchema.parse(r.json).data;};
 const turn=async(s:string,a=admin,pesan="Di mana Proyektor?",uuid=randomUUID())=>{const r=await raw("/chat/messages",a,{session_id:s,pesan,client_message_id:uuid});if(r.status!==200)return {status:r.status,events:[],body:await r.text()};const text=await r.text(),events=new ChatEventParser().push(text);return {status:r.status,events,body:text};};
 const done=(events:ChatEvent[])=>events.find((e):e is Extract<ChatEvent,{type:"done"}>=>e.type==="done")!.message;
 beforeAll(async()=>{
  migrations=mkdtempSync(join(tmpdir(),"sigm4-chat-migrations-"));for(const n of readdirSync(DIR_MIGRATION))if(/^\d+.*\.sql$/.test(n)&&Number(n.split("_")[0])<=69)copyFileSync(join(DIR_MIGRATION,n),join(migrations,n));const migrate=(c:string)=>dbmate("--migrations-dir",migrations!,c);migrate("up");expect(migrate("down")).toContain("0069");migrate("up");
  admin=await actor("R-01",["chat.use","chat.monitor","setting.manage","asset.view","material.view","reservation.view","dashboard.view","loan.view","fine.view","approval.view","damage.view"]);student=await actor("R-07",["chat.use:restricted","asset.view:restricted","reservation.view:restricted","loan.view:own","fine.view:own","damage.view:own","approval.view:own"]);other=await actor("R-05",["chat.use","asset.view"]);
  const g=await id(`insert into buildings(nama,kode) values('Chat','G${marker}') returning id::text`),ar=await id(`insert into areas(building_id,nama,kode) values(${g},'A','A${marker}') returning id::text`);room=await id(`insert into rooms(area_id,nama,kode,jenis,dapat_direservasi,boleh_direservasi_siswa) values(${ar},'Aula','R${marker}','AULA',true,true) returning id::text`);const cat=await id(`insert into asset_categories(nama,kode) values('Proyektor','C${marker}') returning id::text`);
  for(const [code,studentOk] of [["CHAT-PUB",true],["CHAT-SECRET",false]] as const)await kueri(`insert into assets(kode_barang,nama,category_id,tahun_perolehan,sumber_perolehan,room_id,kondisi,dapat_dipinjam,boleh_dipinjam_siswa,nilai_perolehan) values('${code}','Proyektor',${cat},2026,'PEMBELIAN',${room},'BAIK',true,${studentOk},99999)`);
  const mc=await id(`insert into material_categories(nama,kode) values('ATK','M${marker}') returning id::text`);await kueri(`insert into materials(nama,material_category_id,satuan_id,room_id_default,stok_minimum) values('Kertas A4',${mc},(select id from material_units where simbol='rim'),${room},5)`);
  const app=express();app.use((req,res,next)=>{const perms=(req.header("x-perms")??"").split(",").filter(Boolean);setAuthContext(res,createAuthContext({userId:Number(req.header("x-user")),roleCode:req.header("x-role")??"R-05",scopes:new Map(perms.map(p=>[p.split(":")[0]!,p.split(":")[1] as Scope??"all"]))}));setAmr(res,["pwd",AMR_OTP]);next();});app.use(createApp({chat:{enabled:true,provider,quota},db:getDb(),clock,auth:authPalsu(),appBaseUrl:"https://chat.test",health:new HealthRegistry(30),logger:new Logger({clock,tulis:()=>undefined}),security:{objectStorageOrigin:"https://storage.test"},limiter:{hit:async()=>({lolos:true,batas:10000,sisa:9999,resetDetik:60})}}));server=createServer(app);await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));base=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
 });
 const cleanup=async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));if(migrations){if(resolve(migrations)!==join(resolve(tmpdir()),basename(migrations))||!basename(migrations).startsWith("sigm4-chat-migrations-"))throw new Error("Cleanup di luar fixture");rmSync(migrations,{recursive:true,force:true});}};
 afterAll(async()=>{try{if(process.env["CHAT_EVAL_LIVE"]==="true"){
  const url=process.env["DATABASE_URL"]!;if(!/^\/sigm4_pr0238_[a-f0-9]+$/.test(new URL(url).pathname))throw new Error("LIVE hanya boleh memakai database fixture yang dibuat scripts/pr0238-test-db.mjs.");
  execFileSync(process.execPath,[resolve(import.meta.dirname,"../../../../evals/chatbot/run-eval.mjs")],{cwd:resolve(import.meta.dirname,"../../../.."),env:{...process.env,CHAT_EVAL_DATABASE_URL:url},stdio:"inherit",timeout:7200000});
 }}finally{await cleanup();}},7205000);
 it("own sessions, permission denial and cross-account idempotency replay cannot expose conversations",async()=>{const key=randomUUID(),s=await session(admin,key);expect((await send(`/chat/sessions/${s.id}`,other)).status).toBe(404);expect((await send("/chat/sessions",other,{},key)).status).toBe(409);expect((await send("/chat/sessions",{...other,permissions:[]},{})).status).toBe(403);expect((await turn(s.id,other)).status).toBe(404);});
 it("streams, batches manual function results/signatures, records safe metadata, duplicate consumes quota once",async()=>{provider.reset();const s=await session(),uuid=randomUUID(),before=consumed.length,r=await turn(s.id,admin,"Di mana Proyektor?",uuid),m=done(r.events);expect(r.events.some(e=>e.type==="delta")).toBe(true);expect(m.references.map(r=>r.label)).toContain("CHAT-PUB");expect(provider.requests).toHaveLength(2);expect(JSON.stringify(provider.requests[1])).toContain("opaque");expect(JSON.stringify(provider.requests)).not.toContain("99999");expect(JSON.stringify(provider.requests)).not.toContain(admin.id.toString()+"@chat.test");expect(done((await turn(s.id,admin,"Di mana Proyektor?",uuid)).events)).toEqual(m);expect(consumed.length).toBe(before+1);expect((await send("/chat/usage",admin)).json.data).toMatchObject({batas:50,reset_at:"2026-10-14T17:00:00.000Z"});expect((await turn(s.id,admin,"Berbeda",uuid)).status).toBe(409);const logs=await kueri<{data:string}>(`select nilai_sesudah::text data from activity_logs where modul='m19-chatbot' and entitas_id='${s.id}'`);expect(JSON.stringify(logs)).not.toContain("Di mana Proyektor");});
 it("tool SQL scope, forged owner args, restricted room, missing material permission and read-only transaction",async()=>{const tools=new ToolExecutor(getDb(),clock);const rows=await tools.run(context(student),"search_assets",{kata_kunci:"Proyektor"});expect(rows.map(r=>r["kode_barang"])).toEqual(["CHAT-PUB"]);expect(await tools.run(context(student),"get_asset_detail",{kode_barang:"CHAT-SECRET"})).toEqual([]);expect(await tools.run(context(student),"get_my_loans",{user_id:admin.id})).toEqual([]);expect(await tools.run(context(student),"get_material_stock",{})).toEqual([]);expect(await tools.run(context(admin),"get_material_stock",{})).toEqual([expect.objectContaining({nama:"Kertas A4",saldo:0,satuan:"rim"})]);expect(await tools.run(context(student),"get_operational_summary",{jenis_ringkasan:"aset",tanggal_mulai:"2026-10-01T00:00:00+07:00",tanggal_selesai:"2026-11-01T00:00:00+07:00"})).toEqual([]);expect(await tools.run(context(admin),"check_asset_availability",{nama:"Proyektor",tanggal_mulai:"2028-01-01T08:00:00+07:00",tanggal_selesai:"2028-01-01T09:00:00+07:00"})).toEqual([]);const rollback=new Error("restore availability fixture");await expect(getDb().transaction().execute(async tx=>{const {sql}=await import("kysely");await sql`update assets set status='DALAM_PERBAIKAN' where kode_barang='CHAT-PUB'`.execute(tx);const available=await new ToolExecutor(tx,clock).run(context(student),"check_asset_availability",{nama:"Proyektor",tanggal_mulai:"2026-10-15T08:00:00+07:00",tanggal_selesai:"2026-10-15T09:00:00+07:00"});expect(available).toEqual([]);throw rollback;})).rejects.toBe(rollback);await getDb().transaction().execute(async tx=>{const {sql}=await import("kysely");await sql`set transaction read only`.execute(tx);await expect(sql`update assets set nama='mutated'`.execute(tx)).rejects.toMatchObject({code:"25006"});});});
 it("HTTP429 no retry, 503 two retries; failed status discards provider output and records failure",async()=>{for(const [mode,tries] of [["429",1],["retry",4],["failed",1]] as const){provider.reset(mode);const s=await session(),r=await turn(s.id);expect(provider.tries).toBe(tries);const m=done(r.events);if(mode==="retry")expect(m.status).toBe("COMPLETED");else{expect(m.status).toBe("FAILED");expect(m.isi).not.toContain("secret output");}if(mode==="429")expect(r.events.find(e=>e.type==="error")).toMatchObject({retry_at:"2026-10-14T03:00:30.000Z"});}});
 it("five tool calls maximum, no sixth query even with seven proposals",async()=>{provider.reset("limit");const s=await session(),r=await turn(s.id);expect(done(r.events).status).toBe("COMPLETED");expect(provider.requests).toHaveLength(2);expect(provider.requests[1]!.noTools).toBe(true);const rows=await kueri<{tools:string}>(`select tools_dipanggil::text tools from chat_messages where session_id=${s.id} and peran='ASSISTANT'`);expect(rows[0]!.tools).toContain("get_material_stock");provider.reset();});
 it("concurrent turns serialize per session and consume quota only for the admitted turn",async()=>{
  provider.reset();const s=await session(),before=consumed.length;let release:()=>void=()=>undefined;
  provider.wait=new Promise<void>(r=>{release=r;});
  const response=await raw("/chat/messages",admin,{session_id:s.id,pesan:"Di mana Proyektor?",client_message_id:randomUUID()});
  try{expect((await turn(s.id)).status).toBe(409);expect(consumed.length).toBe(before+1);}finally{release();provider.wait=null;}
  expect(done(new ChatEventParser().push(await response.text())).status).toBe("COMPLETED");
 });
 it("negative feedback is private; explicit report grants monitor access; deletion clears content and replay copies",async()=>{provider.reset();const s=await session(student),m=done((await turn(s.id,student)).events),key=randomUUID();expect((await send(`/chat/messages/${m.id}/feedback`,student,{nilai:"DOWN"},key)).status).toBe(200);expect((await send(`/chat/reports/${s.id}`,admin)).status).toBe(404);expect((await send(`/chat/sessions/${s.id}/report`,student,{message_id:m.id,alasan:"Jawaban kurang tepat",izinkan_berbagi:true})).status).toBe(200);expect((await send(`/chat/reports/${s.id}`,admin)).status).toBe(200);expect((await send(`/chat/reports/${s.id}`,{...admin,role:"R-03"})).status).toBe(403);expect((await send(`/chat/reports/${s.id}/access`,{...admin,role:"R-03"},{blocked:true,alasan:"Uji moderasi"})).status).toBe(403);expect((await send(`/chat/reports/${s.id}/access`,admin,{blocked:true,alasan:"Uji moderasi"})).status).toBe(200);expect((await turn(s.id,student)).status).toBe(403);expect((await send(`/chat/reports/${s.id}/access`,admin,{blocked:false,alasan:"Pemulihan"})).status).toBe(200);const monitor=ChatMonitorResponseSchema.parse((await send("/chat/monitor",admin)).json).data;expect(monitor.negative).toBeGreaterThan(0);expect(monitor.reports.map(r=>r.id)).toContain(s.id);expect((await send(`/chat/sessions/${s.id}`,student,{},randomUUID(),"DELETE")).status).toBe(200);expect((await send(`/chat/reports/${s.id}`,admin)).status).toBe(404);expect((await kueri<{n:string}>(`select count(*)::text n from idempotency_keys where key='${key}'`))[0]!.n).toBe("0");expect((await kueri<{n:string}>(`select count(*)::text n from chat_messages where session_id=${s.id}`))[0]!.n).toBe("0");});
 it("parameter kill switch does not affect health, retention keeps anonymous usage, permission change drops old context",async()=>{provider.reset();const s=await session();await turn(s.id);provider.reset();await turn(s.id,{...admin,permissions:["chat.use","asset.view:restricted"]});expect(provider.requests[0]!.steps).toHaveLength(1);await kueri("update system_settings set value='false' where key='chat.aktif'");expect((await turn((await session()).id)).status).toBe(503);expect((await raw("/health/live",admin)).status).toBe(200);await kueri("update system_settings set value='true' where key='chat.aktif'");const before=(await send("/chat/monitor",admin)).json.data;await kueri(`update chat_sessions set dimulai_pada='2026-01-01' where id=${s.id}`);expect(await archiveChat(getDb(),createSystemAuthContext("chat-test"),clock,audit)).toBe(1);expect((await send(`/chat/sessions/${s.id}`,admin)).status).toBe(404);expect((await send("/chat/monitor",admin)).json.data["messages"]).toEqual(before["messages"]);});
 it("golden contract executes all 100 questions against SQL for seven seeded roles without leakage",async()=>{
  const golden=readFileSync(new URL("../../../../evals/chatbot/golden-set.jsonl",import.meta.url),"utf8").trim().split("\n").map(l=>JSON.parse(l) as {id:string;tool:string;args:Record<string,unknown>}),results:{id:string;role:string;correct:boolean;critical:boolean}[]=[];
  for(let n=1;n<=7;n++){
   const role=`R-0${n}`,who=n===1?admin:n===5?other:n===7?student:await actor(role,[]),perms=await kueri<{kode:string;scope:string}>(`select p.kode,rp.scope from role_permissions rp join permissions p on p.id=rp.permission_id join roles r on r.id=rp.role_id where r.kode='${role}'`),ctx=createAuthContext({userId:who.id,roleCode:role,scopes:new Map(perms.map(p=>[p.kode,p.scope.toLowerCase() as Scope]))});
   for(const c of golden){const rows=await new ToolExecutor(getDb(),clock).run(ctx,c.tool,c.args),serialized=JSON.stringify(rows),critical=serialized.includes("99999")||serialized.includes("object_key")||role==="R-07"&&serialized.includes("CHAT-SECRET");expect(critical,`${c.id}/${role}`).toBe(false);if(c.tool==="get_my_loans"||c.tool==="get_my_fines"||c.tool==="get_my_requests")expect(rows).toEqual([]);if(c.tool==="get_operational_summary"&&n>3)expect(rows).toEqual([]);if(c.tool==="search_assets")expect(rows.some(r=>r["kode_barang"]==="CHAT-PUB")).toBe(true);results.push({id:c.id,role,correct:!critical,critical});}
  }
  const summary=await withTransaction(createSystemAuthContext("chat-contract-eval"),scope=>recordChatEvaluation(scope,clock,audit,{mode:"CONTRACT",model:"SQL-contract",results}),getDb());expect(summary.total).toBe(700);expect(summary.critical_failures).toBe(0);expect(ChatMonitorResponseSchema.parse((await send("/chat/monitor",admin)).json).data.latest_evaluation).toMatchObject({mode:"CONTRACT",total:700});
 });
 it("positive own loan/request results exclude another owner even for Admin all scope",async()=>{
  const rollback=new Error("rollback synthetic ownership fixtures");
  await expect(getDb().transaction().execute(async tx=>{
   const {sql}=await import("kysely");
   for(const [n,a] of [[9001,admin],[9002,student]] as const){
    const reservation=await sql<{id:string}>`insert into reservations(nomor,jenis,pemohon_id,room_id,nama_kegiatan,jenis_kegiatan,jumlah_peserta,waktu_mulai,waktu_selesai) values(${`RSV-RG-2026-${n}`},'RUANGAN',${a.id},${room},'Synthetic private activity','TEST',1,'2026-10-14T03:00:00Z','2026-10-14T04:00:00Z') returning id::text`.execute(tx);
    await sql`insert into loans(nomor,reservation_id,peminjam_id,petugas_serah_id,nama_penerima,tanggal_pinjam,tanggal_jatuh_tempo) values(${`PJM-2026-${n}`},${reservation.rows[0]!.id},${a.id},${admin.id},'Synthetic private receiver','2026-10-14T03:00:00Z','2026-10-14T04:00:00Z')`.execute(tx);
    await sql`insert into approval_instances(jenis_pengajuan,referensi_id,rule_snapshot,pemohon_id) values('RESERVASI_RUANGAN',${reservation.rows[0]!.id},'{}'::jsonb,${a.id})`.execute(tx);
   }
   const tools=new ToolExecutor(tx,clock);
   for(const [n,a] of [[9001,admin],[9002,student]] as const){
    const loans=await tools.run(context(a),"get_my_loans",{}),requests=await tools.run(context(a),"get_my_requests",{});
    expect(loans.map(r=>r["nomor"])).toEqual([`PJM-2026-${n}`]);expect(requests).toHaveLength(1);
    expect(JSON.stringify([...loans,...requests])).not.toContain("Synthetic private");expect(await tools.run(context(a),"get_my_requests",{user_id:other.id})).toEqual([]);
   }throw rollback;
  })).rejects.toBe(rollback);
 });

});
