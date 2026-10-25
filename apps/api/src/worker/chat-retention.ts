import type { Kysely } from "kysely";
import type { Database } from "../shared/db/index.js";
import type { Clock } from "../shared/clock/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { archiveChat } from "../modules/m19-chatbot/index.js";
import { jalankanPekerjaanSistem } from "./system-job.js";
export function runChatRetention(db:Kysely<Database>,clock:Clock){const audit=new AuditLogger({clock});return jalankanPekerjaanSistem({nama:"chat-retention",db,clock,audit},async ctx=>({diproses:await archiveChat(db,ctx,clock,audit),galat:0}));}
