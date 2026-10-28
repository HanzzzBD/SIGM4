import {useUnsavedChanges} from "../../shared/ui/unsaved-changes";
import { useFieldErrors } from "../../shared/ui/field-errors";
import { useQuery } from "@tanstack/react-query";
import { useEffect,useRef,useState } from "react";
import { z } from "zod";
import { DamageReportDetailResponseSchema,DaftarDokumenAsetResponseSchema } from "@sigm4/schemas";
import { api,ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { Kartu,Pilihan,Peringatan,Tombol } from "../../shared/ui/primitives";
import { KeadaanGalat,KeadaanMemuat } from "../../shared/states";
import { createWorkOrder,technicianQuery,priorities } from "./api";
export default function WorkOrderCreatePage({ticketId,assetId,onCreated}:{ticketId?:string|undefined;assetId?:string|undefined;onCreated:(id:string)=>void}){
 const can=useCan(),[kind,setKind]=useState("ASET"),[objectId,setObjectId]=useState(assetId??""),[search,setSearch]=useState(""),[term,setTerm]=useState(""),[tech,setTech]=useState(""),[description,setDescription]=useState(""),[priority,setPriority]=useState("SEDANG"),[target,setTarget]=useState(""),[estimate,setEstimate]=useState("0"),[deactivate,setDeactivate]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const submitting=useRef(false);
 const attempt=useRef<{body:string;key:string}|null>(null);
 useEffect(()=>{const timeout=setTimeout(()=>setTerm(search),250);return()=>clearTimeout(timeout);},[search]);
 const technicians=useQuery(technicianQuery);
 const ticket=useQuery({queryKey:["damage-reports",ticketId],enabled:!!ticketId&&can("damage.view"),queryFn:async()=>DamageReportDetailResponseSchema.parse((await api.get(`/damage-reports/${ticketId}`)).data).data});
 useEffect(()=>{if(ticket.data){setDescription(ticket.data.deskripsi);setPriority(ticket.data.urgensi);}},[ticket.data]);
 const objects=useQuery({queryKey:["work-order-objects",kind,term,assetId],enabled:!ticketId&&(kind==="ASET"?can("asset.view"):can("location.view")),queryFn:async()=>{
  if(kind==="ASET")return z.object({data:z.array(z.object({id:z.string(),nama:z.string(),kode_barang:z.string()}))}).parse((await api.get("/assets",{params:{...(term.trim()?{q:term.trim()}:{}),per_page:20}})).data).data.map(a=>({id:a.id,label:`${a.nama} (${a.kode_barang})`}));
  const data=z.object({data:z.array(z.object({areas:z.array(z.object({rooms:z.array(z.object({id:z.string(),nama:z.string()}))}))}))}).parse((await api.get("/locations/tree")).data).data;
  return data.flatMap(g=>g.areas.flatMap(a=>a.rooms.map(r=>({id:r.id,label:r.nama}))));
 }});
 const preselected=useQuery({queryKey:["work-order-selected-asset",assetId],enabled:!!assetId&&!ticketId&&can("asset.view"),queryFn:async()=>z.object({data:z.object({id:z.string(),nama:z.string(),kode_barang:z.string()})}).parse((await api.get(`/assets/${assetId}`)).data).data});
 const warranty=useQuery({queryKey:["asset-documents",objectId],enabled:!ticketId&&kind==="ASET"&&!!objectId&&can("asset_document.view"),queryFn:async()=>DaftarDokumenAsetResponseSchema.parse((await api.get(`/assets/${objectId}/documents`)).data).data});
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const activeWarranty=warranty.data?.some(d=>d.jenis==="GARANSI"&&d.garansi_mulai!==null&&d.garansi_selesai!==null&&d.garansi_mulai<=today&&d.garansi_selesai>=today);
 const choices=[...(objects.data??[])];if(preselected.data&&!choices.some(o=>o.id===preselected.data.id))choices.unshift({id:preselected.data.id,label:`${preselected.data.nama} (${preselected.data.kode_barang})`});
 const [draftBaseline]=useState(()=>JSON.stringify([kind,objectId,tech,description,priority,target,estimate,deactivate]));const guard=useUnsavedChanges(JSON.stringify([kind,objectId,tech,description,priority,target,estimate,deactivate])!==draftBaseline);
 const validation=useFieldErrors();
 const submit=async()=>{
  const fields:Record<string,string>={};if(!ticketId&&!objectId)fields["object"]="Pilih aset atau ruangan yang diperbaiki.";if(!description.trim())fields["description"]="Isi deskripsi pekerjaan.";if(!tech)fields["tech"]="Pilih Teknisi penanggung jawab.";if(!target)fields["target"]="Isi target selesai.";else if(target<today)fields["target"]="Target selesai tidak boleh sebelum hari ini.";if(!Number.isFinite(Number(estimate))||Number(estimate)<0)fields["estimate"]="Isi estimasi biaya rupiah nol atau lebih.";validation.setErrors(fields);if(Object.keys(fields).length)return;
  if(!tech||!target||!description.trim()||(!ticketId&&!objectId)){setError("Pilih objek dan teknisi, lalu isi deskripsi serta target selesai.");return;}
  if(ticketId&&ticket.data?.status!=="DIVERIFIKASI"){setError("Tiket harus Diverifikasi sebelum menjadi work order.");return;}
  const body={...(ticketId?{damage_report_id:Number(ticketId)}:kind==="ASET"?{asset_id:Number(objectId)}:{room_id:Number(objectId)}),teknisi_id:Number(tech),deskripsi:description,prioritas:priority,target_selesai:target,estimasi_biaya:Number(estimate),nonaktifkan_aset:deactivate};
  const serialized=JSON.stringify(body);if(attempt.current&&attempt.current.body!==serialized){setError("Hasil pengiriman sebelumnya belum pasti. Coba ulang dengan isian yang sama.");return;}
  if(submitting.current)return;submitting.current=true;attempt.current??={body:serialized,key:crypto.randomUUID()};setBusy(true);setError(null);
  try{const saved=await createWorkOrder(body,attempt.current.key);guard.allow();onCreated(saved.id);}catch(e){validation.capture(e,{asset_id:"object",room_id:"object",deskripsi:"description",teknisi_id:"tech",target_selesai:"target",estimasi_biaya:"estimate"});if(e instanceof ApiError&&e.status>=400&&e.status<500&&e.status!==408)attempt.current=null;setError(e instanceof Error?e.message:"Work order belum tersimpan.");}finally{submitting.current=false;setBusy(false);}
 };
 return <div className="flex flex-col gap-6">{guard.prompt}<header><h1 className="text-2xl font-semibold text-text-heading">Buat Work Order</h1><p className="text-text-secondary">Tugaskan pekerjaan korektif kepada satu Teknisi.</p></header>{ticket.isPending&&ticketId&&<KeadaanMemuat label="Memuat tiket sumber"/>}{ticket.isError&&<KeadaanGalat galat={ticket.error} onCobaLagi={()=>void ticket.refetch()}/>}{ticket.data?.garansi?.length? <Peringatan varian="warning" judul="Aset masih bergaransi">Pertimbangkan perbaikan melalui penjamin sebelum menugaskan pekerjaan internal.</Peringatan>:null}
 {activeWarranty&&<Peringatan varian="warning" judul="Aset masih bergaransi">Pertimbangkan perbaikan melalui penjamin sebelum menugaskan pekerjaan internal.</Peringatan>}
 <Kartu><form id={validation.id} className="flex flex-col gap-4" noValidate onSubmit={e=>{e.preventDefault();void submit();}}>
 {ticketId?<p>Tiket sumber: {ticket.data?.nomor??ticketId} · {ticket.data?.objek.label}</p>:<><Pilihan label="Objek pekerjaan" value={kind} opsi={[{nilai:"ASET",label:"Aset"},{nilai:"RUANGAN",label:"Ruangan"}]} onChange={e=>{setKind(e.target.value);setObjectId("");}}/>{kind==="ASET"&&<label className="flex flex-col gap-2 text-sm font-medium">Cari aset<input value={search} onChange={e=>setSearch(e.target.value)} className="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-4"/></label>}{objects.isError&&<KeadaanGalat galat={objects.error} onCobaLagi={()=>void objects.refetch()}/>}<Pilihan label={kind==="ASET"?"Aset yang diperbaiki":"Ruangan yang diperbaiki"} data-field="object" galat={validation.errors["object"]} required kosong="Pilih objek" value={objectId} opsi={choices.map(o=>({nilai:o.id,label:o.label}))} onChange={e=>setObjectId(e.target.value)}/></>}
 <label className="flex flex-col gap-2 text-sm font-medium">Deskripsi pekerjaan (wajib)<textarea rows={4} maxLength={5000} {...validation.props("description")} value={description} onChange={e=>setDescription(e.target.value)} className="rounded-sm border border-border-strong bg-surface-default p-3 text-base"/>{validation.feedback("description")}</label>
 {technicians.isError?<KeadaanGalat galat={technicians.error} onCobaLagi={()=>void technicians.refetch()}/>:<Pilihan label="Teknisi penanggung jawab" data-field="tech" galat={validation.errors["tech"]} required kosong="Pilih teknisi" value={tech} opsi={(technicians.data??[]).map(t=>({nilai:t.id,label:`${t.nama} · ${t.work_order_aktif} WO aktif`}))} onChange={e=>setTech(e.target.value)}/>}
 <Pilihan label="Prioritas" value={priority} opsi={Object.entries(priorities).map(([nilai,label])=>({nilai,label}))} onChange={e=>setPriority(e.target.value)}/>{ticketId&&<p className="text-sm text-text-secondary">Prioritas akhir mengikuti urgensi tiket sumber.</p>}
 <label className="flex flex-col gap-2 text-sm font-medium">Target selesai (wajib)<input type="date" {...validation.props("target")} value={target} onChange={e=>setTarget(e.target.value)} className="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-4"/>{validation.feedback("target")}</label><label className="flex flex-col gap-2 text-sm font-medium">Estimasi biaya (Rp)<input type="number" min="0" step="0.01" {...validation.props("estimate")} value={estimate} onChange={e=>setEstimate(e.target.value)} className="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-4"/>{validation.feedback("estimate")}</label>
 <label className="flex items-center gap-2"><input type="checkbox" checked={deactivate} onChange={e=>setDeactivate(e.target.checked)}/>Masukkan aset ke Dalam Perbaikan dan batalkan reservasi mendatang</label><p className="text-sm text-text-secondary">Nonaktifkan pilihan ini hanya untuk perawatan ringan pada aset Tersedia.</p>{error&&<Peringatan varian="error">{error}</Peringatan>}<div className="flex gap-3"><Tombol type="submit" sibuk={busy}>Buat Work Order</Tombol><a href="/work-order" className="inline-flex min-h-control-md items-center text-text-link underline">Batal</a></div></form></Kartu></div>;
}
