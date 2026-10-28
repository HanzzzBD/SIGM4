import {randomUUID} from "node:crypto";
import {beforeAll,describe,expect,it} from "vitest";
import {createAuthContext} from "../../src/shared/auth/index.js";
import {getDb,closeDb} from "../../src/shared/db/index.js";
import {UserService} from "../../src/modules/m02-users/index.js";
import {AuditLogger} from "../../src/shared/audit/index.js";
import {FixedClock} from "../../src/shared/clock/index.js";
import {dbmate,kueri} from "../helpers/db.js";
describe.skipIf(!process.env["DATABASE_URL"])("UX-010 paginated user search",()=>{
 beforeAll(()=>{dbmate("up");},120000);
 it("searches name/email with bound literal wildcards and retains active and role filters",async()=>{
  const marker=randomUUID(), ctx=createAuthContext({userId:1,roleCode:"R-01",scopes:new Map([["user.view","all"]])});
  const rows=await kueri<{id:string}>(`INSERT INTO users(nama,email,password_hash,nip_nis,role_id,status,must_change_password) VALUES ('QA ${marker}','${marker}@search.test','x','${marker}',(SELECT id FROM roles WHERE kode='R-05'),'AKTIF',false) RETURNING id`);
  try{
   const service=new UserService(getDb(),new AuditLogger({clock:new FixedClock(new Date("2026-10-15T00:00:00Z"))}));
   expect((await service.list(ctx,{page:1,perPage:25,q:marker.toUpperCase(),status:"AKTIF"})).rows.map(r=>r.id)).toEqual([rows[0]!.id]);
   expect((await service.list(ctx,{page:1,perPage:25,q:marker,status:"NONAKTIF"})).rows).toEqual([]);
   expect((await service.list(ctx,{page:1,perPage:25,q:`${marker}%`})).rows).toEqual([]);
  }finally{await kueri(`DELETE FROM users WHERE id=${rows[0]!.id}`);await closeDb();}
 });
});
