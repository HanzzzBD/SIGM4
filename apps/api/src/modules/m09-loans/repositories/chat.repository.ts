import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
class ChatLoanRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 async read(ctx:AuthContext,status?:string,fines=false){
  if(!ctx.can(fines?"fine.view":"loan.view"))return [];
  // "my" selalu milik penanya, termasuk Administrator; args tidak menerima user_id.
  return fines?(await sql<Record<string,unknown>>`select f.id::text,l.nomor,f.jenis,f.status,'/denda/'||f.id tautan from fines f join loans l on l.id=f.loan_id where f.peminjam_id=${ctx.userId} and (${status??null}::text is null or f.status::text=${status??null}) order by f.id desc limit 20`.execute(this.query(ctx))).rows:
   (await sql<Record<string,unknown>>`select id::text,nomor,status,tanggal_jatuh_tempo::text jatuh_tempo,'/peminjaman/'||id tautan from loans where peminjam_id=${ctx.userId} and (${status??null}::text is null or status::text=${status??null}) order by id desc limit 20`.execute(this.query(ctx))).rows;
 }
}
export const chatLoans=(db:QueryExecutor,ctx:AuthContext,status?:string,fines=false)=>defineRepository(new ChatLoanRepository(db)).read(ctx,status,fines);
