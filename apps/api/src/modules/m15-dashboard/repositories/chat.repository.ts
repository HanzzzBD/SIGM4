import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
class ChatSummaryRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 async read(ctx:AuthContext,jenis:string,from:Date,to:Date){
  if(!ctx.can("dashboard.view")||!["R-01","R-02","R-03"].includes(ctx.roleCode))return [];
  if(jenis==="aset"&&ctx.can("asset.view")&&ctx.scopeOf("asset.view")==="all")return (await sql<Record<string,unknown>>`select kondisi,status,count(*)::int jumlah,'/aset' tautan from assets where not dihapuskan group by kondisi,status`.execute(this.query(ctx))).rows;
  if(jenis==="peminjaman"&&ctx.can("loan.view")&&ctx.scopeOf("loan.view")==="all")return (await sql<Record<string,unknown>>`select status,count(*)::int jumlah,'/peminjaman' tautan from loans where tanggal_pinjam>=${from} and tanggal_pinjam<${to} group by status`.execute(this.query(ctx))).rows;
  if(jenis==="kerusakan"&&ctx.can("damage.view")&&ctx.scopeOf("damage.view")==="all")return (await sql<Record<string,unknown>>`select status,count(*)::int jumlah,'/kerusakan' tautan from damage_reports where created_at>=${from} and created_at<${to} group by status`.execute(this.query(ctx))).rows;
  return [];
 }
}
export const chatSummary=(db:QueryExecutor,ctx:AuthContext,jenis:string,from:Date,to:Date)=>defineRepository(new ChatSummaryRepository(db)).read(ctx,jenis,from,to);
