import type { Kysely } from "kysely";
import type { Database } from "../shared/db/index.js";
import { withTransaction } from "../shared/db/index.js";
import { createSystemAuthContext } from "../shared/auth/system-context.js";
import { SystemClock } from "../shared/clock/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { recordChatEvaluation } from "../modules/m19-chatbot/index.js";
/** Entry CLI terpisah; tidak tersedia pada siklus HTTP (SDD-03 §6). */
export function saveLiveChatEvaluation(db:Kysely<Database>,input:Parameters<typeof recordChatEvaluation>[3]){const clock=new SystemClock();return withTransaction(createSystemAuthContext("chat-evaluation"),s=>recordChatEvaluation(s,clock,new AuditLogger({clock}),input),db);}
