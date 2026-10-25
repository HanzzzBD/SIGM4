import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
class ChatDamageRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 async read(ctx:AuthContext,args:Readonly<Record<string,unknown>>){
  if(!ctx.can("damage.view"))return [];
  return (await sql<Record<string,unknown>>`select d.id::text,d.nomor,d.status,a.kode_barang,'/kerusakan/'||d.id tautan from damage_reports d left join assets a on a.id=d.asset_id where (${ctx.scopeOf("damage.view")==="all"} or d.pelapor_id=${ctx.userId}) and (${args["nomor_tiket"]??null}::text is null or d.nomor=${args["nomor_tiket"]??null}) and (${args["kode_barang"]??null}::text is null or a.kode_barang=${args["kode_barang"]??null}) order by d.id desc limit 20`.execute(this.query(ctx))).rows;
 }
}
export const chatDamage=(db:QueryExecutor,ctx:AuthContext,args:Readonly<Record<string,unknown>>)=>defineRepository(new ChatDamageRepository(db)).read(ctx,args);
