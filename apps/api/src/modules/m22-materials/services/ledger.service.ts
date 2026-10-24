import type { TransactionScope } from "../../../shared/db/index.js";
import type { Clock } from "../../../shared/clock/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { sql } from "kysely";
import { publish } from "../../../shared/events/index.js";
import { DomainError,ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
import { materialStorageRoom } from "../../m03-locations/index.js";
export interface MaterialLedgerInput {materialId:number;roomId:number;jenis:"PENERIMAAN"|"PENGELUARAN"|"PENYESUAIAN"|"OPNAME";delta:number;referenceKind:string;referenceId:number;alasan?:string;}
/** PR-05-17: hanya fondasi internal; endpoint proses bisnis berada pada PR-05-18/20/21/24. */
export class MaterialLedgerService {
 constructor(private readonly clock:Clock,private readonly audit:AuditLogger){}
 async record(scope:TransactionScope,input:MaterialLedgerInput){
  const permission={PENERIMAAN:"material.receive",PENGELUARAN:"material.issue",PENYESUAIAN:"material.adjust",OPNAME:"audit.approve"}[input.jenis];
  if(!scope.ctx.can(permission))throw new ForbiddenError();
  if(!Number.isInteger(input.delta)||input.delta===0||Math.abs(input.delta)>2147483647||!Number.isSafeInteger(input.referenceId)||input.referenceId<=0||!input.referenceKind.trim())throw new DomainError("VALIDATION_ERROR","Jumlah transaksi dan rujukan dokumen harus sah.");
  if(input.jenis==="PENERIMAAN"&&input.delta<0||input.jenis==="PENGELUARAN"&&input.delta>0)throw new DomainError("VALIDATION_ERROR","Arah perubahan saldo tidak sesuai jenis transaksi.");
  if(["PENYESUAIAN","OPNAME"].includes(input.jenis)&&!input.alasan?.trim())throw new DomainError("VALIDATION_ERROR","Alasan perubahan saldo wajib diisi.");
  const material=await scope.tx.selectFrom("materials").select(["id","nama","status","stok_minimum","satuan_id"]).where("id","=",String(input.materialId)).forUpdate().executeTakeFirst();if(!material)throw new NotFoundError("Bahan tidak ditemukan.");
  const total=await scope.tx.selectFrom("material_balances").select(sql<string>`coalesce(sum(saldo),0)::text`.as("saldo")).where("material_id","=",material.id).executeTakeFirstOrThrow();
  await materialStorageRoom(scope,input.roomId);
  await scope.tx.insertInto("material_balances").values({material_id:material.id,room_id:String(input.roomId),saldo:0}).onConflict(c=>c.columns(["material_id","room_id"]).doNothing()).execute();
  const balance=await scope.tx.selectFrom("material_balances").select(["id","saldo"]).where("material_id","=",material.id).where("room_id","=",String(input.roomId)).forUpdate().executeTakeFirstOrThrow();
  const after=balance.saldo+input.delta;if(after<0||after>2147483647)throw new DomainError("VALIDATION_ERROR",`Perubahan ditolak. Saldo terkini ${balance.saldo}; saldo akhir harus antara 0 dan 2147483647.`);
  // Trigger menerapkan delta; tidak ada jalur UPDATE saldo dari kode aplikasi.
  const row=await scope.tx.insertInto("material_transactions").values({material_id:material.id,room_id:String(input.roomId),jenis:input.jenis,jumlah:input.delta,saldo_sesudah:after,referensi_jenis:input.referenceKind,referensi_id:String(input.referenceId),alasan:input.alasan?.trim()||null,created_by:String(scope.ctx.userId),created_at:this.clock.now()}).returning(["id","saldo_sesudah"]).executeTakeFirstOrThrow();
  await this.audit.write(scope,{modul:"m22-materials",aksi:"MATERIAL_TRANSACTION_RECORDED",entitas:"materials",entitasId:material.id,nilaiSebelum:{room_id:input.roomId,saldo:balance.saldo},nilaiSesudah:{transaction_id:row.id,...input,saldo:after}});
  // The material row lock serializes every location and threshold edit. Only a
  // downward crossing emits; replenishment above the threshold rearms naturally.
  const beforeTotal=BigInt(total.saldo),afterTotal=beforeTotal+BigInt(input.delta);
  if(input.delta<0&&material.status==="AKTIF"&&material.stok_minimum>0&&beforeTotal>BigInt(material.stok_minimum)&&afterTotal<=BigInt(material.stok_minimum)){
   const unit=await scope.tx.selectFrom("material_units").select("simbol").where("id","=",material.satuan_id).executeTakeFirstOrThrow();
   await publish(scope,{name:"MaterialLowStock",aggregateType:"material",aggregateId:material.id,payload:{material_id:Number(material.id),bahan:material.nama,saldo:Number(afterTotal),ambang:material.stok_minimum,satuan:unit.simbol,transaction_id:Number(row.id)}});
  }
  return row;
 }
}
