import {useQuery} from "@tanstack/react-query";
import {Link} from "@tanstack/react-router";
import {RoomAvailabilityResponseSchema,LoanListResponseSchema} from "@sigm4/schemas";
import {api} from "../../shared/api";
import {useSesi} from "../../shared/auth";
import {Peringatan,Tombol} from "../../shared/ui/primitives";
import {detailReservasiQuery} from "../m07-reservation-room";

function ReservationAvailability({id}:{id:string}) {
 const detail=useQuery(detailReservasiQuery(id)),d=detail.data;
 const ranges=d?(d.tanggal.length?d.tanggal.map(x=>({id:x.id,start:x.waktu_mulai,end:x.waktu_selesai})):[{id:d.id,start:d.waktu_mulai,end:d.waktu_selesai}]):[];
 const q=useQuery({queryKey:["approval-availability",id,detail.dataUpdatedAt],enabled:!!d?.ruangan,staleTime:0,queryFn:async({signal})=>{
  const own=new Set([d!.id,...ranges.map(x=>x.id)]),rows=[];
  for(const range of ranges){const r=RoomAvailabilityResponseSchema.parse((await api.get("/rooms/availability",{params:{dari:range.start,sampai:range.end},signal})).data).data;
   const slots=r.slot.filter(x=>x.ruangan_id===d!.ruangan!.id&&Date.parse(x.mulai)<Date.parse(range.end)&&Date.parse(x.selesai)>Date.parse(range.start));
   rows.push({start:range.start,held:slots.some(x=>x.reservasi&&own.has(x.reservasi.id)),conflicts:slots.filter(x=>!x.reservasi||!own.has(x.reservasi.id)).length});
  }return rows;
 }});
 if(detail.isPending||q.isFetching)return <p role="status">Memeriksa ketersediaan jadwal pengajuan…</p>;
 if(detail.isError||q.isError)return <Peringatan varian="warning">Ketersediaan belum dapat dimuat. <Tombol varian="secondary" onClick={()=>{void detail.refetch();void q.refetch();}}>Periksa lagi</Tombol></Peringatan>;
 if(!d?.ruangan)return <p>Pengajuan ini tidak memakai ruangan. Kelayakan dan slot unit aset diperiksa kembali oleh server saat persetujuan.</p>;
 return <div><h3 className="font-semibold">Ketersediaan {d.ruangan.nama}</h3><ul>{q.data?.map((r,i)=><li key={i}>{new Date(r.start).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB: {r.conflicts?`${r.conflicts} slot lain beririsan` : r.held?"Slot pengajuan masih tercatat, tanpa irisan dengan slot lain":"Slot pengajuan belum ditemukan; periksa lagi sebelum menyetujui"}.</li>)}</ul><p className="text-sm text-text-secondary">Keadaan dapat berubah. Server memeriksa ulang jadwal, kelayakan, dan izin saat keputusan dikirim.</p></div>;
}
export function DecisionContext({kind,reference,requester}:{kind:string;reference:number;requester:number}){
 const {permissions}=useSesi(),canLoans=permissions["loan.view"]==="all",canReservation=permissions["reservation.view"]!==undefined;
 const loans=useQuery({queryKey:["approval-requester-loans",requester],enabled:canLoans,staleTime:0,queryFn:async({signal})=>LoanListResponseSchema.parse((await api.get("/loans",{params:{peminjam:requester,tab:"aktif",per_page:5},signal})).data)});
 return <div className="flex flex-col gap-4">{kind.startsWith("RESERVASI_")&&(canReservation?<ReservationAvailability id={String(reference)}/>:<p>Izin melihat rincian reservasi belum tersedia. Minta petugas berwenang memeriksa jadwal.</p>)}<h3 className="font-semibold">Peminjaman aktif pemohon</h3>{!canLoans?<p>Ringkasan lintas peminjam memerlukan cakupan melihat seluruh peminjaman. Ketiadaan akses bukan berarti pemohon tidak memiliki tanggungan.</p>:loans.isPending?<p role="status">Memuat peminjaman pemohon…</p>:loans.isError?<Peringatan varian="warning">Riwayat peminjaman belum dapat dimuat. <Tombol varian="secondary" onClick={()=>void loans.refetch()}>Coba lagi</Tombol></Peringatan>:<><p>{loans.data.meta.total} peminjaman aktif pada saat diperiksa.</p><ul>{loans.data.data.map(l=><li key={l.id}><Link to="/peminjaman/$id" params={{id:l.id}} className="text-text-link">{l.nomor}</Link> · {l.hari_terlambat?`${l.hari_terlambat} hari terlambat`:"Belum terlambat"}</li>)}</ul></>}<p className="text-sm text-text-secondary">Daftar ini menampilkan peminjaman aktif yang diizinkan, bukan seluruh riwayat atau total kewajiban finansial.</p></div>;
}
