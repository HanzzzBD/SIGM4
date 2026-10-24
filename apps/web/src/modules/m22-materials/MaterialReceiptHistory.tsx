import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MaterialReceiptHistoryResponseSchema } from "@sigm4/schemas";
import { api } from "../../shared/api";
import { Kartu,Tombol } from "../../shared/ui/primitives";
import { KeadaanMemuat,KeadaanGalat } from "../../shared/states";
export default function MaterialReceiptHistory({id,satuan}:{id:string;satuan:string}) {
 const [page,setPage]=useState(1),q=useQuery({queryKey:["materials","receipts",id,page],queryFn:async()=>MaterialReceiptHistoryResponseSchema.parse((await api.get(`/materials/${id}/receipts`,{params:{page,per_page:20}})).data)});
 return <section className="flex min-w-0 flex-col gap-3" aria-label="Bukti penerimaan bahan"><h2 className="text-xl font-semibold">Bukti penerimaan bahan</h2>{q.isPending?<KeadaanMemuat label="Memuat bukti penerimaan"/>:q.isError?<KeadaanGalat galat={q.error} onCobaLagi={()=>void q.refetch()}/>:<>{q.data.data.length===0?<p>Belum ada penerimaan langsung. Bukti dari pengadaan dapat dibuka melalui referensi pada kartu stok.</p>:q.data.data.map(r=><Kartu key={r.id}><h3 className="font-semibold">{r.nomor_dokumen} / {r.tanggal_terima}</h3><p>{r.jumlah} {satuan} di {r.lokasi} / {r.pelaksana}</p>{r.catatan&&<p>{r.catatan}</p>}{r.dokumen.map(f=><p key={f.file_id}>{f.url?<a href={f.url} target="_blank" rel="noreferrer" className="break-words text-text-link underline">{f.nama_berkas}</a>:`${f.nama_berkas}: belum lolos pemeriksaan`}</p>)}</Kartu>)}{q.data.meta.total_pages>1&&<nav aria-label="Halaman bukti penerimaan"><Tombol disabled={page===1} onClick={()=>setPage(page-1)}>Bukti sebelumnya</Tombol><span> {page}/{q.data.meta.total_pages} </span><Tombol disabled={page===q.data.meta.total_pages} onClick={()=>setPage(page+1)}>Bukti berikutnya</Tombol></nav>}</>}</section>;
}
