import { useQuery } from "@tanstack/react-query";
import { ProcurementDetailResponseSchema } from "@sigm4/schemas";
import { api } from "../../shared/api";
import { KeadaanGalat,KeadaanMemuat } from "../../shared/states";
import { ProcurementContents,ProcurementDecisionHistory } from "./ProcurementDetailPage";
import ApprovalActions from "./ApprovalActions";
export default function ProcurementApprovalPage({id,instanceId,onDone}:{id:number;instanceId:number;onDone:()=>void}){
 const q=useQuery({queryKey:["procurements",String(id),"review"],queryFn:async()=>ProcurementDetailResponseSchema.parse((await api.get(`/procurements/${id}/review`)).data).data,retry:false});
 if(q.isPending)return <KeadaanMemuat label="Memuat konteks usulan pengadaan"/>;if(q.isError)return <KeadaanGalat galat={q.error} onCobaLagi={()=>void q.refetch()}/>;
 if(q.data.approval_instance_id!==instanceId)return <p>Langkah ini bukan lagi persetujuan aktif usulan. Muat ulang kotak masuk.</p>;
 return <div className="flex flex-col gap-6"><header><h1 className="text-2xl font-semibold text-text-heading">Tinjau {q.data.nomor}</h1><p>{q.data.judul}</p><a href={`/pengadaan/${id}`} className="text-text-link underline">Buka detail usulan</a></header><ProcurementContents data={q.data}/><ProcurementDecisionHistory id={instanceId}/><ApprovalActions data={q.data} onChanged={onDone}/></div>;
}
