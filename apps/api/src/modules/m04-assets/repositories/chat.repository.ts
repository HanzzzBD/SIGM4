import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository,defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
/** BR-076: pembatasan SQL; tidak ada nilai finansial/identitas pada projection. */
class ChatAssetRepository extends BaseRepository {
 constructor(db:QueryExecutor){super(db);}
 async read(ctx:AuthContext,args:Readonly<Record<string,unknown>>,availability=false){
  if(!ctx.can("asset.view")||!["all","restricted"].includes(ctx.scopeOf("asset.view")))return [];
  if(availability&&!ctx.can("reservation.view"))return [];
  if(availability){const setting=await this.query(ctx).selectFrom("system_settings").select("value").where("key","=","reservasi.horizon_hari").executeTakeFirst(),days=setting?.value,now=args["now"] as Date,today=new Date(now.getTime()+7*3600000).toISOString().slice(0,10),start=Date.parse(`${today}T00:00:00+07:00`);
   if(typeof days!=="number"||!Number.isInteger(days)||days<=0||Date.parse(String(args["tanggal_mulai"]))<start||Date.parse(String(args["tanggal_selesai"]))>start+(days+1)*86400000)return [];
  }
  const p=(v:unknown)=>typeof v==="string"?`%${v.replace(/[\\%_]/g,c=>`\\${c}`)}%`:"%";
  return (await sql<Record<string,unknown>>`select a.id::text, a.kode_barang,a.nama,c.nama kategori,r.nama lokasi,a.kondisi,a.status,
   ${availability?sql`not exists(select 1 from booking_slots b where b.resource_type='asset' and b.resource_id=a.id and b.status in ('TENTATIVE','CONFIRMED','ACTIVE') and (b.status<>'TENTATIVE' or b.expires_at>${args["now"]}) and b.slot_range && tstzrange(${args["tanggal_mulai"]}::timestamptz,${args["tanggal_selesai"]}::timestamptz,'[)'))`:sql`null`} as tersedia,
   ${ctx.can("workorder.view")?sql`(select count(*)::int from work_orders w where w.asset_id=a.id and (${ctx.scopeOf("workorder.view")==="all"} or w.teknisi_id=${ctx.userId}))`:sql`null`} as jumlah_perbaikan,
   '/aset/'||a.id as tautan
   from assets a join asset_categories c on c.id=a.category_id join rooms r on r.id=a.room_id
   where not a.dihapuskan and (${ctx.scopeOf("asset.view")!=="restricted"} or a.boleh_dipinjam_siswa)
   and a.nama ilike ${p(args["kata_kunci"]??args["nama"])} and c.nama ilike ${p(args["kategori"])} and r.nama ilike ${p(args["lokasi"])}
   and (${args["kode_barang"]??null}::text is null or a.kode_barang=${args["kode_barang"]??null})
   and (${args["uuid"]??null}::uuid is null or a.uuid=${args["uuid"]??null}::uuid)
   and (${args["kondisi"]??null}::text is null or a.kondisi::text=${args["kondisi"]??null})
   and (${!(availability||args["hanya_dapat_dipinjam"]===true)} or (a.dapat_dipinjam and a.kondisi in ('BAIK','RUSAK_RINGAN') and a.status not in ('DALAM_PERBAIKAN','TIDAK_TERSEDIA') and not exists(select 1 from asset_disposal_claims d where d.asset_id=a.id)))
   order by a.kode_barang limit 20`.execute(this.query(ctx))).rows;
 }
}
export const chatAssets=(db:QueryExecutor,ctx:AuthContext,args:Readonly<Record<string,unknown>>,availability=false)=>defineRepository(new ChatAssetRepository(db)).read(ctx,args,availability);
