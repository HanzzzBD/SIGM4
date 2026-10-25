import type { MaterialUnitBodySchema } from "@sigm4/schemas";
import type { z } from "zod";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor,TransactionScope } from "../../../shared/db/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import { DomainError,ForbiddenError,NotFoundError } from "../../../shared/errors/index.js";
export async function materialUnitOptions(ctx:AuthContext,db:QueryExecutor){if(!ctx.can("material.view")&&!ctx.can("setting.view")&&!ctx.can("setting.manage"))throw new ForbiddenError();return db.selectFrom("material_units").select(["id","nama","simbol","keterangan","status"]).orderBy("nama").execute();}
export async function claimMaterialUnit(scope:TransactionScope,id:number,previous?:string){if(!scope.ctx.can("material.manage"))throw new ForbiddenError();const row=await scope.tx.selectFrom("material_units").select(["id","status"]).where("id","=",String(id)).forShare().executeTakeFirst();if(!row||row.status!=="AKTIF"&&row.id!==previous)throw new DomainError("VALIDATION_ERROR","Pilih satuan dari master satuan aktif.");return row;}
export class MaterialUnitService {
 constructor(private readonly audit:AuditLogger){}
 async create(scope:TransactionScope,input:z.output<typeof MaterialUnitBodySchema>){if(scope.ctx.roleCode!=="R-01"||!scope.ctx.can("setting.manage"))throw new ForbiddenError();const row=await scope.tx.insertInto("material_units").values({...input,keterangan:input.keterangan??null,created_by:String(scope.ctx.userId),updated_by:String(scope.ctx.userId)}).returning(["id","nama","simbol","keterangan","status"]).executeTakeFirstOrThrow();await this.audit.write(scope,{modul:"m20-settings",aksi:"MATERIAL_UNIT_CREATED",entitas:"material_units",entitasId:row.id,nilaiSesudah:row});return row;}
 async status(scope:TransactionScope,id:number,status:"AKTIF"|"NONAKTIF"){if(scope.ctx.roleCode!=="R-01"||!scope.ctx.can("setting.manage"))throw new ForbiddenError();const current=await scope.tx.selectFrom("material_units").selectAll().where("id","=",String(id)).forUpdate().executeTakeFirst();if(!current)throw new NotFoundError();const row=await scope.tx.updateTable("material_units").set({status,updated_by:String(scope.ctx.userId)}).where("id","=",current.id).returning(["id","nama","simbol","keterangan","status"]).executeTakeFirstOrThrow();await this.audit.write(scope,{modul:"m20-settings",aksi:"MATERIAL_UNIT_UPDATED",entitas:"material_units",entitasId:row.id,nilaiSebelum:{status:current.status},nilaiSesudah:row});return row;}
}
