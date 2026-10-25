import type { AuthContext } from "../../../shared/auth/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import { createMaterialRepository } from "../repositories/material.repository.js";
/** PR-05-25: tetap melalui repository M-22 dan konteks penanya. Tanpa kartu transaksi. */
export async function chatMaterials(db:QueryExecutor,ctx:AuthContext,args:Readonly<Record<string,unknown>>,low=false){
 if(!ctx.can("material.view")||ctx.scopeOf("material.view")!=="all")return [];
 const repo=createMaterialRepository(db),q=String(args["nama_bahan"]??args["kategori"]??"");
 const result=await repo.list(ctx,{page:1,per_page:20,urut:"nama",status:"AKTIF",...(q?{q}:{}),...(low?{stok:"MENIPIS" as const}:{})});
 const rows=await Promise.all(result.data.filter(m=>!args["kategori"]||m.category_name.toLocaleLowerCase("id").includes(String(args["kategori"]).toLocaleLowerCase("id"))).map(async m=>{const recorded=await repo.balances(ctx,m.id),balances=recorded.length?recorded:[{room_id:m.room_id_default,lokasi:m.default_room,saldo:0}];return balances.filter(b=>!args["lokasi"]||b.lokasi.toLocaleLowerCase("id").includes(String(args["lokasi"]).toLocaleLowerCase("id"))).map(b=>({id:m.id,nama:m.nama,kategori:m.category_name,satuan:m.simbol,lokasi:b.lokasi,saldo:b.saldo,stok_minimum:m.stok_minimum,tautan:`/bahan/${m.id}`}));}));return rows.flat().slice(0,40);
}
