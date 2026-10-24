import type { TransactionScope } from "../../../shared/db/index.js";
export async function workOrderNotificationSource(scope:TransactionScope,id:number){
 const row=await scope.tx.selectFrom("work_orders as w").leftJoin("damage_reports as d","d.id","w.damage_report_id").leftJoin("assets as a","a.id","w.asset_id").leftJoin("rooms as r","r.id","w.room_id").select(["w.nomor","w.teknisi_id","d.pelapor_id","a.nama as asset_name","r.nama as room_name"]).where("w.id","=",String(id)).executeTakeFirst();
 return row?{nomor:row.nomor,teknisi_id:Number(row.teknisi_id),pelapor_id:row.pelapor_id===null?null:Number(row.pelapor_id),objek:row.asset_name??row.room_name??row.nomor}:null;
}
