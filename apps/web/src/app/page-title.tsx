import {useEffect} from "react";
import {useRouterState} from "@tanstack/react-router";
const names:Readonly<Record<string,string>>={login:"Masuk",profil:"Profil",aset:"Inventaris Aset",bahan:"Bahan",pengguna:"Pengguna",role:"Role & Permission",reservasi:"Reservasi",peminjaman:"Peminjaman",persetujuan:"Persetujuan","work-order":"Work Order",opname:"Stock Opname",pengadaan:"Pengadaan",penghapusan:"Penghapusan",pengaturan:"Pengaturan",chat:"Tanya SIGM4","activity-log":"Log Aktivitas","approval-rules":"Aturan Persetujuan",notifikasi:"Notifikasi","kalender-ruangan":"Kalender Ruangan",kerusakan:"Laporan Kerusakan",analitik:"Analitik"};
export function PageTitle(){
 const path=useRouterState({select:s=>s.location.pathname});
 useEffect(()=>{
  const fallback=path==="/"?"Dashboard":names[path.split("/")[1]??""]??"SIGM4";
  const update=()=>{const heading=(document.querySelector("main h1")??document.querySelector("main h2"))?.textContent?.trim(),title=heading||fallback;document.title=title.includes("SIGM4")?title:`${title} | SIGM4`;};
  update();const observer=new MutationObserver(update);observer.observe(document.body,{subtree:true,childList:true,characterData:true});return()=>observer.disconnect();
 },[path]);return null;
}
