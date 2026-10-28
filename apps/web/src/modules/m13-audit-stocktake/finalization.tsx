import type {StocktakeSession} from "@sigm4/schemas";
export function finalizationBlockers(s:StocktakeSession,today:string):string[]{
 const reasons:string[]=[];
 if(!s.target)reasons.push("Sesi belum memiliki target pemeriksaan.");
 const incomplete=s.lokasi.filter(l=>!l.selesai);
 if(incomplete.length&&today<=s.periode_selesai)reasons.push(`${incomplete.length} lokasi belum selesai. Selesaikan lokasi dari aplikasi mobile atau tunggu sampai periode berakhir (${s.periode_selesai}).`);
 if(s.domain==="BAHAN"&&s.diperiksa<s.target)reasons.push(`${s.target-s.diperiksa} bahan/lokasi belum dihitung. Catat nol secara eksplisit jika fisik kosong.`);
 if(s.foto_tertunda)reasons.push(`${s.foto_tertunda} foto belum siap. Sinkronkan dan tunggu pemeriksaan berkas.`);
 return reasons;
}
export function FinalizationStatus({session:s}:{session:StocktakeSession}){
 const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10),reasons=finalizationBlockers(s,today);
 if(s.status!=="BERJALAN"||s.finalized_at)return null;
 return <section aria-label="Prasyarat finalisasi" className="flex flex-col gap-2 rounded-md border border-border-subtle p-4"><h2 className="text-lg font-semibold">Sebelum menyelesaikan sesi</h2><p>{s.diperiksa} dari {s.target} target diperiksa; {s.lokasi.filter(l=>l.selesai).length} dari {s.lokasi.length} lokasi selesai.</p>{reasons.length?<ul className="list-disc pl-5">{reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>:<p>Prasyarat yang terlihat telah terpenuhi. Server akan memeriksa ulang keadaan terbaru.</p>}<p className="text-sm text-text-secondary">Sinkronkan seluruh hasil dari perangkat sebelum melanjutkan. Setelah periode berakhir, aset yang belum diperiksa dicatat sesuai status server; hitungan Bahan tetap wajib lengkap.</p></section>;
}
