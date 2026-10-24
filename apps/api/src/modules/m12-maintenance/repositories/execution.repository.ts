import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { WorkOrderListQuery } from "@sigm4/schemas";
export class ExecutionRepository extends BaseRepository {
 constructor(executor:QueryExecutor){super(executor);}
 async lock(ctx:AuthContext,id:number,assigned:boolean) {
  return this.query(ctx).selectFrom("work_orders").selectAll().where("id","=",String(id)).$if(assigned,q=>q.where("teknisi_id","=",String(ctx.userId))).forUpdate().executeTakeFirst();
 }
 async detail(ctx:AuthContext,id:number) {
  return this.query(ctx).selectFrom("work_orders as w").innerJoin("users as u","u.id","w.teknisi_id").leftJoin("assets as a","a.id","w.asset_id").leftJoin("rooms as r","r.id","w.room_id").selectAll("w").select(["u.nama as teknisi_nama",sql<string>`coalesce(a.nama,r.nama)`.as("objek_label"),"a.kode_barang"])
  .select([sql<string>`to_char(w.target_selesai,'YYYY-MM-DD')`.as("target_selesai"),sql<string|null>`to_char(w.tanggal_lanjut,'YYYY-MM-DD')`.as("tanggal_lanjut")])
  .where("w.id","=",String(id)).$if(ctx.scopeOf("workorder.view")!=="all",q=>q.where("w.teknisi_id","=",String(ctx.userId))).executeTakeFirst();
 }
 async photos(ctx:AuthContext,id:string){return this.query(ctx).selectFrom("work_order_photos as p").innerJoin("stored_files as f","f.id","p.file_id").select(["p.file_id","p.urutan","f.checksum","f.scan_status","f.object_key","f.thumb_key","f.medium_key"]).where("p.work_order_id","=",id).orderBy("p.urutan").execute();}
 async reporterPhotos(ctx:AuthContext,id:string){return this.query(ctx).selectFrom("damage_report_photos as p").innerJoin("stored_files as f","f.id","p.file_id").select(["p.file_id","f.checksum","f.scan_status","f.object_key","f.thumb_key","f.medium_key"]).where("p.damage_report_id","=",id).orderBy("p.urutan").execute();}
 async costs(ctx:AuthContext,id:string){return this.query(ctx).selectFrom("work_order_costs").selectAll().where("work_order_id","=",id).orderBy("id").execute();}
 async setting(ctx:AuthContext,key:string){return this.query(ctx).selectFrom("system_settings").select("value").where("key","=",key).executeTakeFirst();}
 async list(ctx:AuthContext,filter:WorkOrderListQuery,mine:boolean){
  let q=this.query(ctx).selectFrom("work_orders as w").innerJoin("users as u","u.id","w.teknisi_id").leftJoin("assets as a","a.id","w.asset_id").leftJoin("rooms as r","r.id","w.room_id").$if(mine||ctx.scopeOf("workorder.view")!=="all",q=>q.where("w.teknisi_id","=",String(ctx.userId)));
  const technicians=await q.select(["u.id","u.nama"]).distinct().orderBy("u.nama").execute();
  if(filter.q){const p=`%${filter.q.replace(/[\\%_]/g,c=>`\\${c}`)}%`;q=q.where(e=>e.or([e("w.nomor","ilike",p),e("a.kode_barang","ilike",p)]));}
  if(filter.status)q=q.where("w.status","=",filter.status);
  if(filter.jenis)q=q.where("w.jenis","=",filter.jenis);
  if(filter.prioritas)q=q.where("w.prioritas","=",filter.prioritas);
  if(filter.teknisi_id)q=q.where("w.teknisi_id","=",String(filter.teknisi_id));
  if(filter.asset_id)q=q.where("w.asset_id","=",String(filter.asset_id));
  if(filter.dari)q=q.where("w.target_selesai",">=",filter.dari);
  if(filter.sampai)q=q.where("w.target_selesai","<=",filter.sampai);
  const n=await q.select(e=>e.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
  const data=await q.selectAll("w").select(["u.nama as teknisi_nama",sql<string>`coalesce(a.nama,r.nama)`.as("objek_label"),sql<number>`(select count(*)::int from work_order_photos p join stored_files f on f.id=p.file_id where p.work_order_id=w.id and (f.checksum is null or f.scan_status<>'CLEAN'))`.as("foto_tertunda")])
  .select(sql<string>`to_char(w.target_selesai,'YYYY-MM-DD')`.as("target_selesai"))
  .$if(filter.urut==="prioritas",q=>q.orderBy(sql`CASE w.prioritas WHEN 'KRITIS' THEN 4 WHEN 'TINGGI' THEN 3 WHEN 'SEDANG' THEN 2 ELSE 1 END`,"desc")).orderBy("w.target_selesai").orderBy("w.id").limit(filter.per_page).offset((filter.page-1)*filter.per_page).execute();
  return {data,meta:{page:filter.page,per_page:filter.per_page,total:Number(n.n),total_pages:Math.max(1,Math.ceil(Number(n.n)/filter.per_page)),teknisi:technicians}};
 }
}
export const createExecutionRepository=(executor:QueryExecutor)=>defineRepository(new ExecutionRepository(executor));
