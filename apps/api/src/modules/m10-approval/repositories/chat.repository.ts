import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
class ChatRequestRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 async read(ctx:AuthContext,jenis?:string,status?:string){
  if(!ctx.can("approval.view"))return [];
  return (await sql<Record<string,unknown>>`select id::text,jenis_pengajuan jenis,status,created_at::text diajukan,'/persetujuan/'||id tautan from approval_instances where pemohon_id=${ctx.userId} and (${jenis??null}::text is null or jenis_pengajuan::text=${jenis??null}) and (${status??null}::text is null or status::text=${status??null}) order by id desc limit 20`.execute(this.query(ctx))).rows;
 }
}
export const chatRequests=(db:QueryExecutor,ctx:AuthContext,jenis?:string,status?:string)=>defineRepository(new ChatRequestRepository(db)).read(ctx,jenis,status);
