import { sql } from "kysely";
import { MaterialStocktakeItemSchema } from "@sigm4/schemas";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { NotFoundError } from "../../../shared/errors/index.js";

export class MaterialStocktakeRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 private async visible(ctx:AuthContext,id:string){
  const all=["audit.view","audit.manage","audit.approve"].some(p=>ctx.can(p)&&ctx.scopeOf(p)==="all");
  const row=await this.query(ctx).selectFrom("audit_sessions as s").select(["s.id","s.status"]).where("s.id","=",id).where("s.domain","=","BAHAN").$if(!all,q=>q.where(e=>e.or([e("s.created_by","=",String(ctx.userId)),e.exists(e.selectFrom("audit_session_assignees as a").select("a.user_id").whereRef("a.session_id","=","s.id").where("a.user_id","=",String(ctx.userId)))]))).executeTakeFirst();
  if(!row)throw new NotFoundError("Sesi opname Bahan tidak ditemukan.");return row;
 }
 private rows(ctx:AuthContext,id:string){return this.query(ctx).selectFrom("audit_material_items as i").innerJoin("materials as m","m.id","i.material_id").leftJoin("material_balances as b",j=>j.onRef("b.material_id","=","i.material_id").onRef("b.room_id","=","i.room_id")).where("i.session_id","=",id).selectAll("i").select([sql<number>`coalesce(b.saldo,0)`.as("saldo_sekarang"),sql<string>`coalesce((select max(t.id) from material_transactions t where t.material_id=i.material_id and t.room_id=i.room_id),0)::text`.as("ledger_id_sekarang"),sql<boolean>`m.satuan_id<>i.satuan_id`.as("satuan_berubah")]);}
 async items(ctx:AuthContext,id:string,page:number,size:number,room?:number,onlyDifferences=false,materialId?:string){
  const session=await this.visible(ctx,id);
  let q=this.rows(ctx,id);if(room)q=q.where("i.room_id","=",String(room));if(materialId)q=q.where("i.material_id","=",materialId);
  if(onlyDifferences)q=q.where(e=>e.or([e("i.jumlah_fisik","is",null),sql<boolean>`i.jumlah_fisik<>i.basis_saldo`,sql<boolean>`i.basis_ledger_id<>coalesce((select max(t.id) from material_transactions t where t.material_id=i.material_id and t.room_id=i.room_id),0)`,e("m.satuan_id","!=",e.ref("i.satuan_id"))]));
  const count=await q.clearSelect().select(e=>e.fn.countAll<string>().as("n")).executeTakeFirstOrThrow();
  const rows=await q.orderBy("i.id").limit(size).offset((page-1)*size).execute();
  return {data:rows.map(r=>MaterialStocktakeItemSchema.parse({...r,selisih:r.jumlah_fisik===null?null:r.jumlah_fisik-r.basis_saldo!,selisih_snapshot:r.jumlah_fisik===null?null:r.jumlah_fisik-r.saldo_sistem,diperiksa_pada:r.diperiksa_pada?.toISOString()??null,perlu_hitung_ulang:session.status!=="SELESAI"&&(r.satuan_berubah||r.jumlah_fisik!==null&&(r.basis_ledger_id!==r.ledger_id_sekarang||r.basis_saldo!==r.saldo_sekarang))})),meta:{page,per_page:size,total:Number(count.n),total_pages:Math.max(1,Math.ceil(Number(count.n)/size))}};
 }
 async summary(ctx:AuthContext,id:string,closed=false){
  const rows=await this.rows(ctx,id).execute();
  const pending=(r:typeof rows[number])=>r.jumlah_fisik===null||r.satuan_berubah||r.basis_ledger_id!==r.ledger_id_sekarang||r.basis_saldo!==r.saldo_sekarang||r.jumlah_fisik!==r.basis_saldo&&!r.keterangan?.trim();
  return {target:rows.length,diperiksa:rows.filter(r=>r.jumlah_fisik!==null).length,selisih:rows.filter(r=>r.jumlah_fisik!==null&&r.jumlah_fisik!==r.basis_saldo).length,belum_dilengkapi:closed?0:rows.filter(pending).length,rooms:new Map([...new Set(rows.map(r=>r.room_id))].map(room=>[room,{target:rows.filter(r=>r.room_id===room).length,diperiksa:rows.filter(r=>r.room_id===room&&r.jumlah_fisik!==null).length}]))};
 }
}
export const createMaterialStocktakeRepository=(db:QueryExecutor)=>defineRepository(new MaterialStocktakeRepository(db));
