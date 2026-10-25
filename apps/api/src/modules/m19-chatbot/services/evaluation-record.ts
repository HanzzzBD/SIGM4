import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { isSystemAuthContext } from "../../../shared/auth/index.js";
import { PROMPT_HASH } from "./prompt.js";
import { summarizeEvaluation } from "./evaluation.js";
export async function recordChatEvaluation(scope:TransactionScope,clock:Clock,audit:AuditLogger,input:{mode:"LIVE"|"CONTRACT";model:string;results:{id:string;role:string;correct:boolean;critical:boolean}[];baseline?:number}){
 if(!isSystemAuthContext(scope.ctx))throw new Error("Pencatatan evaluasi memerlukan pelaku SYSTEM.");const summary=summarizeEvaluation(input.results,input.baseline),row=await scope.tx.insertInto("chat_evaluations").values({pada:clock.now(),model:input.model,prompt_hash:PROMPT_HASH,mode:input.mode,total:summary.total,correct:summary.correct,critical_failures:summary.critical_failures,accuracy:String(summary.accuracy),details:JSON.stringify({passed:summary.passed,failures:input.results.filter(r=>!r.correct||r.critical).map(r=>({id:r.id,role:r.role,critical:r.critical}))})}).returning("id").executeTakeFirstOrThrow();
 await audit.write(scope,{modul:"m19-chatbot",aksi:"CHAT_EVALUATION_COMPLETED",entitas:"chat_evaluations",entitasId:row.id,nilaiSesudah:{mode:input.mode,...summary}});return summary;
}
