import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
class ChatRoomRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 async read(ctx:AuthContext,args:Readonly<Record<string,unknown>>){
  if(!ctx.can("reservation.view"))return [];
  const name=String(args["ruangan"]??"").replace(/[\\%_]/g,c=>`\\${c}`);
  return (await sql<Record<string,unknown>>`select r.id::text,r.nama ruangan,'/kalender-ruangan' tautan,
   lower(b.slot_range)::text mulai,upper(b.slot_range)::text selesai,
   case when b.id is null then 'KOSONG' else 'TERPAKAI' end status
   from rooms r left join booking_slots b on b.resource_type='room' and b.resource_id=r.id
   and b.status in ('TENTATIVE','CONFIRMED','ACTIVE') and (b.status<>'TENTATIVE' or b.expires_at>${args["now"]})
   and b.slot_range && tstzrange(${args["tanggal_mulai"]}::timestamptz,${args["tanggal_selesai"]}::timestamptz,'[)')
   where r.status='AKTIF' and r.dapat_direservasi and (${ctx.scopeOf("reservation.view")!=="restricted"} or r.boleh_direservasi_siswa) and r.nama ilike ${`%${name}%`} order by r.id,lower(b.slot_range) limit 20`.execute(this.query(ctx))).rows;
 }
}
export const chatRooms=(db:QueryExecutor,ctx:AuthContext,args:Readonly<Record<string,unknown>>)=>defineRepository(new ChatRoomRepository(db)).read(ctx,args);
