import { useCallback,useEffect,useState } from "react";
import { router,useFocusEffect } from "expo-router";
import { MaterialDetailResponseSchema } from "@sigm4/schemas";
import type { MaterialDetail } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { Button,Card,Label,Notice,Screen } from "../../shared/ui";

/** Hasil QR privat; saldo tidak disimpan ke antrean atau penyimpanan lokal. */
export function MaterialScreen({id}:{id:string}){
 const {state,api}=useAuth(),[material,setMaterial]=useState<MaterialDetail|null>(null),[error,setError]=useState<string|null>(null),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[focused,setFocused]=useState(false);
 const permitted=state.kind==="READY"&&Object.hasOwn(state.session.permissions,"material.view"),account=state.kind==="READY"?state.session.user.id:"";
 useFocusEffect(useCallback(()=>{setFocused(true);return()=>{setFocused(false);setMaterial(null);};},[]));
 useEffect(()=>{
  setMaterial(null);if(!permitted||!focused)return;
  const abort=new AbortController();setLoading(true);setError(null);
  void api.get(`/materials/${encodeURIComponent(id)}`,{signal:abort.signal}).then(r=>{if(!abort.signal.aborted)setMaterial(MaterialDetailResponseSchema.parse(r.data).data);}).catch((e:unknown)=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:"Bahan belum dapat dimuat.");}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[api,id,account,permitted,focused,retry]);
 if(!permitted)return <Screen title="Detail bahan"><Notice message="Anda tidak memiliki izin melihat bahan."/><Button icon="arrowLeft" title="Kembali" onPress={()=>router.replace("/scan")}/></Screen>;
 return <Screen title="Detail bahan">{loading&&<Label>Memuat bahan…</Label>}{error&&<><Notice message={error}/><Button icon="refresh" title="Coba lagi" onPress={()=>setRetry(n=>n+1)}/></>}{material&&<><Card><Label>{material.nama}</Label><Label>{material.kategori.nama} / {material.satuan.nama}</Label><Label>Saldo total: {material.saldo_total} {material.satuan.simbol}</Label><Label>Stok minimum: {material.stok_minimum} {material.satuan.simbol}</Label><Label>Status: {material.status==="AKTIF"?"Aktif":"Nonaktif"}</Label>{material.stok_menipis&&<Notice message="Stok Menipis"/>}{material.status==="NONAKTIF"&&<Label>Bahan tidak dapat diminta. Saldo dan riwayat tetap tersedia.</Label>}<Label>Lokasi bawaan: {material.lokasi_bawaan.nama}</Label>{material.keterangan&&<Label>{material.keterangan}</Label>}</Card><Card><Label>Saldo per Lokasi</Label>{material.saldo_lokasi.length===0?<Label>Belum ada transaksi. Saldo awal 0.</Label>:material.saldo_lokasi.map(r=><Label key={r.room_id}>{r.lokasi}: {r.saldo} {material.satuan.simbol}</Label>)}</Card><Button icon="boxes" title="Detail & kartu stok" secondary onPress={()=>router.push(`/bahan/${material.id}` as "/scan")}/>{state.kind==="READY"&&Object.hasOwn(state.session.permissions,"material.request")&&material.status==="AKTIF"&&<Button icon="clipboardList" title="Ajukan permintaan bahan" onPress={()=>router.push(`/permintaan-bahan/baru?bahan=${material.id}` as "/scan")}/>}</>}<Button icon="scan" title="Pindai lagi" onPress={()=>router.replace("/scan")}/><Button title="Beranda" secondary onPress={()=>router.replace("/")}/></Screen>;
}
