import { Linking, View } from "react-native";
import type { IconName } from "../../shared/ui";
import { useCallback, useState } from "react";
import { router } from "expo-router";
import { z } from "zod";
import { DamageReportListResponseSchema, ReservationListResponseSchema, WorkOrderListResponseSchema, StocktakeListSchema, LABEL_JENIS_PENGAJUAN, labelEnum } from "@sigm4/schemas";
import { useAuth } from "../auth";
import { useResource } from "../../shared/api/useResource";
import { Badge, Button, Card, EmptyState, Icon, Label, ListRow, Notice, Screen, SectionHeading, tokens as t } from "../../shared/ui";
import { taskSections, taskDestination } from "./model";
function QueueSection({ kind, label }: { kind: string; label: string }) {
    const { api, state, offlineOnly } = useAuth(), [error,setError]=useState<string|null>(null);
    const account=state.kind==="READY"?state.session.user.id:"",permissions=state.kind==="READY"?state.session.permissions:{};
    const origin=process.env.EXPO_PUBLIC_APP_URL??"",destination=taskDestination(kind,permissions,origin);
    const open=(id?:string)=>{
        const target=taskDestination(kind,permissions,origin,id);setError(null);
        if(!target){setError("Alamat web sekolah atau akses tugas belum tersedia. Hubungi Administrator.");return;}
        if("native" in target)router.push(target.native as "/scan");
        else if(offlineOnly)setError("Layanan web memerlukan koneksi. Sambungkan internet dan coba lagi.");
        else void Linking.openURL(target.web).catch(()=>setError("Browser belum dapat dibuka. Periksa koneksi dan coba lagi."));
    };
    const load=useCallback(async(signal:AbortSignal)=>{
        if(kind==="workorder"){const r=WorkOrderListResponseSchema.parse((await api.get("/work-orders/mine",{params:{per_page:5},signal})).data);return {count:r.meta.total,rows:r.data.map(x=>({id:x.id,title:`${x.nomor} · ${x.objek_label} · ${x.target_selesai}`}))};}
        if(kind==="stocktake"){const r=StocktakeListSchema.parse((await api.get("/audit-sessions/mine",{params:{per_page:5,status:"BERJALAN"},signal})).data);return {count:r.meta.total,rows:r.data.map(x=>({id:x.id,title:`${x.nomor} · ${x.diperiksa}/${x.target} diperiksa`}))};}
        if(kind==="damage"){const r=DamageReportListResponseSchema.parse((await api.get("/damage-reports",{params:{status:"DILAPORKAN",per_page:5},signal})).data);return {count:r.meta.total,rows:r.data.map(x=>({id:x.id,title:`${x.nomor} · ${x.objek.label}`}))};}
        if(kind==="requests"){const r=ReservationListResponseSchema.parse((await api.get("/reservations",{params:{pemohon:"saya",per_page:5},signal})).data);return {count:r.meta.total,rows:r.data.map(x=>({id:x.id,title:`${x.nomor} · ${({MENUNGGU_PERSETUJUAN:"Menunggu Persetujuan",DISETUJUI:"Disetujui",DITOLAK:"Ditolak",PERLU_REVISI:"Perlu Revisi",DIBATALKAN:"Dibatalkan",BERLANGSUNG:"Berlangsung",SELESAI:"Selesai",KEDALUWARSA:"Kedaluwarsa",TIDAK_DIGUNAKAN:"Tidak Digunakan"} as Record<string,string>)[x.status]??"Status belum diketahui"}`}))};}
        if(kind==="approval"){const r=z.object({data:z.array(z.object({instance_id:z.number(),jenis_pengajuan:z.string()})),meta:z.object({total:z.number()})}).parse((await api.get("/approvals/pending",{params:{per_page:5},signal})).data);return {count:r.meta.total,rows:r.data.map(x=>({id:String(x.instance_id),title:`${labelEnum(LABEL_JENIS_PENGAJUAN,x.jenis_pengajuan)} · Menunggu keputusan`}))};}
        return null;
    },[api,kind]);
    const resource=useResource(`${account}:tasks:${kind}`,load),icon:IconName=kind==="workorder"?"wrench":kind==="stocktake"?"scan":kind==="approval"?"checkCircle":kind==="damage"?"alert":"clock";
    const web=destination!==null&&"web" in destination;
    return <Card><View style={{flexDirection:"row",alignItems:"center",gap:t.space.sm}}><Icon name={icon} color={t.color.primary}/><View style={{flex:1}}><SectionHeading title={label}/></View>{resource.data&&<Badge label={String(resource.data.count)} tone={resource.data.count?"warning":"neutral"}/>}</View>
        {resource.loading&&<Label>Memuat antrean…</Label>}{resource.error&&<><Notice message={resource.error}/><Button icon="refresh" title="Coba lagi" secondary onPress={resource.reload}/></>}
        {resource.data&&(resource.data.count===0?<EmptyState icon="checkCircle" title="Sudah beres" description="Tidak ada yang menunggu tindakan Anda."/>:resource.data.rows.map(row=><ListRow key={row.id} title={row.title} subtitle={web?"Buka detail di web sekolah":"Buka detail tugas"} icon={icon} onPress={()=>open(row.id)}/>))}
        {web&&<Label>Tugas ini dilanjutkan melalui web sekolah. Anda mungkin perlu masuk kembali di browser; hasil transaksi tetap ditentukan server.</Label>}
        {!destination&&<Notice message="Alamat web sekolah atau akses tugas belum tersedia. Hubungi Administrator."/>}{error&&<Notice message={error}/>}
        <Button title={web?`Lanjutkan ${label.toLowerCase()} di web`:`Buka ${label.toLowerCase()}`} disabled={!destination} onPress={()=>open()}/>
    </Card>;
}
export function TasksScreen(){const {state}=useAuth(),permissions=state.kind==="READY"?state.session.permissions:{},sections=taskSections(permissions);return <Screen title="Tugas" icon="tasks" subtitle="Prioritaskan pekerjaan yang membutuhkan tindakan Anda.">{sections.length===0&&<Label>Belum ada antrean yang tersedia untuk izin akun Anda.</Label>}{sections.map(section=><QueueSection key={section.kind} {...section}/>)}</Screen>;}
