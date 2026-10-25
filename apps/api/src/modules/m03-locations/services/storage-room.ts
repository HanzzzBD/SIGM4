import type { TransactionScope } from "../../../shared/db/index.js";
import { DomainError } from "../../../shared/errors/index.js";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { ForbiddenError } from "../../../shared/errors/index.js";
import { sql } from "kysely";
export async function materialStorageOptions(ctx:AuthContext,db:QueryExecutor){if(!ctx.can("material.view")&&!ctx.can("material.manage"))throw new ForbiddenError();return db.selectFrom("rooms as r").innerJoin("areas as a","a.id","r.area_id").innerJoin("buildings as b","b.id","a.building_id").select(["r.id",sql<string>`r.nama||' / '||a.nama||' / '||b.nama`.as("nama"),sql<boolean>`r.status='AKTIF' AND b.status='AKTIF'`.as("aktif")]).orderBy("b.nama").orderBy("a.nama").orderBy("r.nama").execute();}
/** Lokasi penyimpanan M-22 harus aktif beserta gedung induknya (FR-22.1/22.3). */
export async function materialStorageRoom(scope:TransactionScope,id:number){
 const r=await scope.tx.selectFrom("rooms as r").innerJoin("areas as a","a.id","r.area_id").innerJoin("buildings as b","b.id","a.building_id").select(["r.id","r.nama"]).where("r.id","=",String(id)).where("r.status","=","AKTIF").where("b.status","=","AKTIF").forShare(["r","b"]).executeTakeFirst();
 if(!r)throw new DomainError("VALIDATION_ERROR","Lokasi penyimpanan harus ruangan dan gedung aktif.");return r;
}
