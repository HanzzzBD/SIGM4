import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useEffect,useRef,useState } from "react";
import type { ProcurementDetail,ApprovalDecision } from "@sigm4/schemas";
import { ApiError } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { DialogKonfirmasi } from "../../shared/ui/dialog";
import { Peringatan,Tombol } from "../../shared/ui/primitives";
import { pendingInstanceQuery,putuskan } from "../m10-approval";
type Choice="DISETUJUI"|"SEBAGIAN"|"DITOLAK"|"PERLU_REVISI";
const labels={DISETUJUI:"Setujui",SEBAGIAN:"Setujui Sebagian",DITOLAK:"Tolak",PERLU_REVISI:"Perlu Revisi"};
export default function ProcurementApprovalActions({data,onChanged}:{data:ProcurementDetail;onChanged:()=>void}){
 const can=useCan(),qc=useQueryClient(),enabled=can("procurement.approve")&&can("approval.decide")&&data.status==="MENUNGGU_PERSETUJUAN"&&data.approval_instance_id!==null,pending=useQuery({...pendingInstanceQuery(data.approval_instance_id??0),enabled});
 const [choice,setChoice]=useState<Choice|null>(null),[counts,setCounts]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState<string|undefined>(undefined),attempt=useRef<{body:ApprovalDecision;key:string}|null>(null);
 useEffect(()=>setCounts(Object.fromEntries(data.items.map(i=>[i.id,String(i.jumlah_disetujui??i.jumlah_diusulkan)]))),[data.items]);
 const submitting=useRef(false);
 if(!enabled)return null;
 const ready=pending.data?.referensi_id===Number(data.id)&&pending.data.jenis_pengajuan==="PENGADAAN_BARANG",filesReady=data.lampiran.every(f=>f.status==="CLEAN");
 const send=async(note:string)=>{
  if(submitting.current)return;
  if(choice==="SEBAGIAN"&&(data.items.some(i=>!counts[i.id]?.trim()||!Number.isInteger(Number(counts[i.id]))||Number(counts[i.id])<0||Number(counts[i.id])>(i.jumlah_disetujui??i.jumlah_diusulkan))||data.items.every(i=>Number(counts[i.id])===0))){setError("Isi jumlah setiap item dengan bilangan bulat yang tetap atau berkurang; minimal satu item harus disetujui.");return;}
  if(!pending.data||!choice)return;const body:ApprovalDecision={urutan:pending.data.urutan,keputusan:choice==="SEBAGIAN"?"DISETUJUI":choice,catatan:note,...(choice==="SEBAGIAN"?{rincian_keputusan:{items:data.items.map(i=>({item_id:Number(i.id),jumlah_disetujui:Number(counts[i.id])}))}}:{})};
  if(attempt.current&&JSON.stringify(attempt.current.body)!==JSON.stringify(body)){setError("Hasil keputusan belum pasti. Ulangi dengan keputusan dan isian yang sama.");return;}
  attempt.current??={body,key:crypto.randomUUID()};submitting.current=true;setBusy(true);setError(undefined);
  try{await putuskan(data.approval_instance_id!,{...body,catatan:body.catatan??null},attempt.current.key);attempt.current=null;setChoice(null);await Promise.all([qc.invalidateQueries({queryKey:["approvals"]}),qc.invalidateQueries({queryKey:["procurements"],refetchType:"none"})]);onChanged();}
  catch(e){if(e instanceof ApiError&&e.status>=400&&e.status<500&&e.status!==408&&e.status!==429&&e.kode!=="REQUEST_IN_PROGRESS"){attempt.current=null;if(e.kode==="APPROVAL_ALREADY_DECIDED"){setChoice(null);onChanged();}}setError(e instanceof Error?e.message:"Keputusan belum tersimpan.");}finally{submitting.current=false;setBusy(false);}
 };
 return <section aria-label="Keputusan usulan" className="flex flex-col gap-3">{!filesReady&&<Peringatan varian="info">Lampiran masih diperiksa atau tidak lolos pemeriksaan. Persetujuan menunggu lampiran siap.</Peringatan>}{pending.isError&&<Peringatan varian="error">Kewenangan keputusan belum dapat dimuat.<Tombol varian="secondary" onClick={()=>void pending.refetch()}>Coba lagi kewenangan</Tombol></Peringatan>}{error&&!choice&&<Peringatan varian="error">{error}</Peringatan>}<div className="flex flex-wrap gap-3">{(Object.keys(labels) as Choice[]).map(value=><Tombol key={value} varian={value==="DITOLAK"?"danger":value==="DISETUJUI"?"primary":"secondary"} disabled={!ready||busy||(!filesReady&&["DISETUJUI","SEBAGIAN"].includes(value))} onClick={()=>{setError(undefined);setChoice(value);}}>{labels[value]}</Tombol>)}</div>{!ready&&!pending.isPending&&<p className="text-sm text-text-secondary">Langkah ini tidak berada pada kewenangan Anda saat ini.</p>}
 {choice&&<DialogKonfirmasi buka onTutup={()=>{if(!busy)setChoice(null);}} judul={`${labels[choice]} usulan ${data.nomor}?`} labelAksi={labels[choice]} varian={choice==="DITOLAK"?"danger":"primary"} labelAlasan="Catatan keputusan" sibuk={busy} galat={error} onKonfirmasi={note=>void send(note)}><div className="flex flex-col gap-3"><p>Keputusan berlaku untuk langkah aktif ini dan tercatat dalam riwayat. Jumlah hanya boleh tetap atau berkurang dari persetujuan sebelumnya.</p>{choice==="SEBAGIAN"&&data.items.map(i=><label key={i.id} className="flex flex-col gap-2">Jumlah disetujui: {i.nama_barang}<input type="number" min={0} max={i.jumlah_disetujui??i.jumlah_diusulkan} step={1} value={counts[i.id]??"0"} disabled={busy} onChange={e=>setCounts(current=>({...current,[i.id]:e.target.value}))} className="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-3"/><span className="text-sm text-text-secondary">Diusulkan {i.jumlah_diusulkan}; sebelumnya {i.jumlah_disetujui??"belum diputuskan"}.</span></label>)}</div></DialogKonfirmasi>}
 </section>;
}
