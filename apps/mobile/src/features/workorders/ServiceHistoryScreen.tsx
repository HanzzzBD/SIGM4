import { useCallback,useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Button,Card,Label,Notice,Screen } from "../../shared/ui";
import { loadServiceHistory,workOrderStatuses } from "./model";
export function ServiceHistory({id}:{id:string}){
 const {state,api}=useAuth(),account=state.kind==="READY"?state.session.user.id:"",allowed=state.kind==="READY"&&Object.hasOwn(state.session.permissions,"asset.view")&&Object.hasOwn(state.session.permissions,"workorder.view"),[page,setPage]=useState(1);
 const load=useCallback((signal:AbortSignal)=>allowed?loadServiceHistory(api,id,page,signal):Promise.resolve(null),[api,id,page,allowed]);const resource=useResource(`${account}:service:${id}:${page}`,load);
 if(!allowed)return null;
 const d=resource.data?.data;
 return <Card><Label>Riwayat servis aset</Label>{resource.loading&&<Label>Memuat riwayat…</Label>}{resource.error&&<><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi riwayat servis" secondary onPress={resource.reload}/></>}{d&&<>{d.cakupan==="PENUGASAN_SAYA"&&<Label>Riwayat dan ringkasan mencakup penugasan Anda.</Label>}<Label>Total biaya: {d.total_biaya===null?"Tidak tersedia":`Rp${d.total_biaya}`}</Label><Label>Jumlah perbaikan: {d.jumlah_perbaikan}</Label><Label>Rata interval: {d.rata_interval_hari===null?"Belum cukup riwayat":`${d.rata_interval_hari.toFixed(1)} hari`}</Label>{d.rekomendasi_penggantian&&<Notice message="Biaya melampaui ambang. Pertimbangkan penggantian aset."/>}{!d.ambang_terkonfigurasi&&<Label>Ambang penggantian belum dikonfigurasi Administrator.</Label>}{d.work_orders.map(row=><Card key={row.id}><Label>{row.nomor} · {workOrderStatuses[row.status as keyof typeof workOrderStatuses]??row.status}</Label><Label>{row.jenis==="PREVENTIF"?"Preventif":"Korektif"} / {row.deskripsi}</Label><Label>Dibuat {new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium"}).format(new Date(row.created_at))} / Durasi {row.waktu_mulai&&row.waktu_selesai?`${Math.max(0,(Date.parse(row.waktu_selesai)-Date.parse(row.waktu_mulai))/3600000).toFixed(1)} jam`:"belum tersedia"}</Label><Label>{row.teknisi_nama} · Biaya {row.biaya===null?"Tidak tersedia":`Rp${row.biaya}`}</Label>{row.hasil&&<Label>{row.hasil}</Label>}</Card>)}<Button title="Servis sebelumnya" secondary disabled={page===1} onPress={()=>setPage(page-1)}/><Button title="Servis berikutnya" secondary disabled={page>=resource.data!.meta.total_pages} onPress={()=>setPage(page+1)}/></>}</Card>;
}
export function ServiceHistoryScreen(){const {id}=useLocalSearchParams<{id:string}>();return <Screen title="Riwayat Servis"><ServiceHistory id={id}/></Screen>;}
