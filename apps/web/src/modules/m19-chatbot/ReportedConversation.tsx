import { useInfiniteQuery } from "@tanstack/react-query";
import { ChatDetailResponseSchema } from "@sigm4/schemas";
import { api } from "../../shared/api";
import { Kartu,Tombol } from "../../shared/ui/primitives";
import { KeadaanGalat,KeadaanMemuat } from "../../shared/states";
import { RestrictionControls } from "./RestrictionControls";

export function ReportedConversation({id}:{id:string}){
 const q=useInfiniteQuery({queryKey:["chat-report",id],initialPageParam:undefined as string|undefined,
  queryFn:async({pageParam})=>ChatDetailResponseSchema.parse((await api.get(`/chat/reports/${id}`,{params:pageParam?{before:pageParam}:{}})).data).data,
  getNextPageParam:last=>last.has_more?last.messages[0]?.id:undefined});
 if(q.isPending)return <KeadaanMemuat label="Memuat laporan"/>;
 if(q.isError)return <KeadaanGalat galat={q.error} onCobaLagi={()=>void q.refetch()}/>;
 const first=q.data.pages[0]!;
 return <Kartu><h2 className="text-xl font-semibold">{first.session.judul}</h2><RestrictionControls id={id}/>
  {first.report_note&&<p>Laporan pengguna: {first.report_note}</p>}
  {q.hasNextPage&&<Tombol varian="secondary" disabled={q.isFetchingNextPage} onClick={()=>void q.fetchNextPage()}>Muat pesan sebelumnya</Tombol>}
  {[...q.data.pages].reverse().flatMap(p=>p.messages).map(m=><p className="whitespace-pre-wrap break-words" key={m.id}>{m.peran==="USER"?"Pengguna":"Asisten"}: {m.isi}</p>)}
 </Kartu>;
}
