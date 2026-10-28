import { useCallback,useEffect,useState } from "react";
import { router } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../auth";
import { useUploads } from "../uploads";
import type { UploadEntry } from "../../shared/upload/queue";
import { Button,Card,Label,Notice,Screen } from "../../shared/ui";
export function WorkOrderQueueScreen(){const {state}=useAuth(),uploads=useUploads(),account=state.kind==="READY"?state.session.user.id:"",[entries,setEntries]=useState<UploadEntry[]>([]);
 const load=useCallback(()=>{let live=true;if(uploads.queue&&account)void uploads.queue.list(account).then(rows=>{if(live)setEntries(rows.filter(r=>r.ownerType==="WORK_ORDER_PHOTO"));});else setEntries([]);return()=>{live=false;};},[uploads.queue,account,uploads.count]);useFocusEffect(load);useEffect(load,[load]);
 return <Screen title="Antrean Foto Hasil"><Label>Foto bertahan saat aplikasi ditutup, maksimal 50 berkas/72 jam. Transaksi pekerjaan harus daring.</Label>{uploads.discarded>0&&<Notice message={`${uploads.discarded} foto antrean dibuang karena batas umur atau kapasitas.`}/>}{uploads.error&&<Notice message={uploads.error}/>}{entries.length===0&&<Label>Tidak ada foto hasil dalam antrean.</Label>}{entries.map(entry=><Card key={entry.id}><Label>Foto hasil pekerjaan · {Math.ceil(entry.size/1024)} KB</Label><Label>{uploads.progress[entry.id]??`Menunggu unggahan · Percobaan ${entry.attempts}`}</Label><Button icon="arrowRight" title="Buka pekerjaan terkait" secondary onPress={()=>router.push(`/work-order/${entry.ownerId}` as "/scan")}/><Button icon="close" title="Batalkan unggahan foto" secondary onPress={()=>{if(uploads.queue)void uploads.queue.cancel(entry.id,account).then(()=>uploads.refresh());}}/></Card>)}<Button title="Coba unggah ulang" onPress={()=>{if(uploads.queue)void uploads.queue.retry(account).then(()=>uploads.refresh());}}/></Screen>;
}
