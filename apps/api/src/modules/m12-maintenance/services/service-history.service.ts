import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { Database } from "../../../shared/db/index.js";
import { ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { canReadWorkOrderCosts } from "./work-order.service.js";
import { createExecutionRepository } from "../repositories/execution.repository.js";
export class ServiceHistoryService {
 constructor(private readonly db:Kysely<Database>){}
 async get(ctx:AuthContext,id:number,page:number,size:number){
  if(!ctx.can("workorder.view"))throw new ForbiddenError();
  const assigned=ctx.scopeOf("workorder.view")!=="all",aggregateCostsAllowed=ctx.can("maintenance.view_cost")&&(ctx.scopeOf("maintenance.view_cost")==="all"||assigned);
  const asset=await this.db.selectFrom("assets").select(["id","nilai_perolehan"]).where("id","=",String(id)).$if(assigned,q=>q.where(e=>e.exists(e.selectFrom("work_orders as w").select("w.id").whereRef("w.asset_id","=","assets.id").where("w.teknisi_id","=",String(ctx.userId))))).executeTakeFirst();
  if(!asset)throw new NotFoundError("Aset tidak ditemukan.");
  const q=this.db.selectFrom("work_orders as w").innerJoin("users as u","u.id","w.teknisi_id").where("w.asset_id","=",asset.id).$if(assigned,q=>q.where("w.teknisi_id","=",String(ctx.userId)));
  const aggregate=await q.select([sql<string>`count(*)::text`.as("total"),sql<string>`coalesce(sum(w.biaya),0)::text`.as("cost"),sql<number>`count(*) filter (where w.jenis='KOREKTIF')::int`.as("repairs"),sql<number|null>`(extract(epoch from (max(w.created_at) filter(where w.jenis='KOREKTIF')-min(w.created_at) filter(where w.jenis='KOREKTIF')))/86400.0/nullif(count(*) filter(where w.jenis='KOREKTIF')-1,0))::float8`.as("interval")]).executeTakeFirstOrThrow();
  const rows=await q.select(["w.id","w.teknisi_id","w.nomor","w.jenis","w.status","w.deskripsi","w.created_at","w.waktu_mulai","w.waktu_selesai","w.diverifikasi_pada","w.biaya","w.hasil","u.nama as teknisi_nama"]).orderBy("w.created_at","desc").orderBy("w.id","desc").limit(size).offset((page-1)*size).execute();
  const threshold=(await createExecutionRepository(this.db).setting(ctx,"maintenance.ambang_penggantian_persen"))?.value;
  const configured=typeof threshold==="number"&&Number.isFinite(threshold)&&threshold>=0;
  let recommend:boolean|null=null;
  if(configured&&aggregateCostsAllowed&&asset.nilai_perolehan!==null){const result=await sql<{result:boolean}>`select ${aggregate.cost}::numeric > ${asset.nilai_perolehan}::numeric * ${threshold as number}::numeric/100 AS result`.execute(this.db);recommend=result.rows[0]!.result;}
  return {data:{cakupan:assigned?"PENUGASAN_SAYA":"SEMUA",work_orders:rows.map(({teknisi_id,...r})=>({...r,created_at:r.created_at.toISOString(),waktu_mulai:r.waktu_mulai?.toISOString()??null,waktu_selesai:r.waktu_selesai?.toISOString()??null,diverifikasi_pada:r.diverifikasi_pada?.toISOString()??null,biaya:canReadWorkOrderCosts(ctx,teknisi_id)?r.biaya:null})),total_biaya:aggregateCostsAllowed?aggregate.cost:null,jumlah_perbaikan:aggregate.repairs,rata_interval_hari:aggregate.interval,rekomendasi_penggantian:recommend,ambang_terkonfigurasi:configured},meta:{page,per_page:size,total:Number(aggregate.total),total_pages:Math.max(1,Math.ceil(Number(aggregate.total)/size))}};
 }
}
