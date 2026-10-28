import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ambilData, api } from "../../shared/api";
import { useCan } from "../../shared/auth";
import { Isian, KotakCentang, Peringatan, Pilihan, Tombol } from "../../shared/ui/primitives";
interface Named { id: string; nama: string; email?: string }
export function RequesterPicker({label="Pemohon (opsional)",value,onChange,galat}:{label?:string;value:number|null;onChange:(v:number|null)=>void;galat?:string|undefined}) {
    const can=useCan(),[search,setSearch]=useState(""),[term,setTerm]=useState(""),[page,setPage]=useState(1);
    useEffect(()=>{const timer=setTimeout(()=>{setTerm(search.trim());setPage(1);},250);return()=>clearTimeout(timer);},[search]);
    const list=useQuery({queryKey:["users","approval-picker",term,page],enabled:can("user.view"),queryFn:async()=>(await api.get<{data:Named[];meta:{total_pages:number}}>("/users",{params:{...(term?{q:term}:{}),page,per_page:25}})).data});
    const selected=useQuery({queryKey:["users",String(value)],enabled:value!==null&&can("user.view"),queryFn:()=>ambilData<Named>(api.get(`/users/${value}`))});
    const options=[...(list.data?.data??[])];if(selected.data&&!options.some(x=>x.id===String(value)))options.unshift(selected.data);
    return <div className="flex flex-col gap-3">{!can("user.view")?<Peringatan varian="info">Pemilihan pemohon memerlukan izin membaca pengguna.</Peringatan>:<><Isian label={`Cari ${label.toLowerCase()}: nama atau email`} value={search} onChange={e=>setSearch(e.target.value)}/><Pilihan label={label} kosong={list.isFetching?"Memuat pengguna…":"Pilih pemohon"} value={value===null?"":String(value)} opsi={options.map(x=>({nilai:x.id,label:`${x.nama}${x.email?` · ${x.email}`:""}`}))} galat={galat} onChange={e=>onChange(e.target.value?Number(e.target.value):null)}/>{list.error&&<Peringatan varian="error">Pengguna belum dapat dimuat. <Tombol varian="secondary" onClick={()=>void list.refetch()}>Coba lagi</Tombol></Peringatan>}<div className="flex flex-wrap gap-2"><Tombol varian="secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Pengguna sebelumnya</Tombol><Tombol varian="secondary" disabled={page>=(list.data?.meta.total_pages??1)} onClick={()=>setPage(page+1)}>Pengguna berikutnya</Tombol></div></>}</div>;
}
export function NamedMultiPicker({field,label,value,onChange,galat}:{field:string;label:string;value:unknown;onChange:(v:unknown)=>void;galat?:string|undefined}) {
    const can=useCan(),[search,setSearch]=useState("");
    const permission=field==="room_id"?"location.view":field==="asset_category_id"?"asset.view":"material.view";
    const query=useQuery({queryKey:["approval-options",field],enabled:can(permission),queryFn:async()=>{
        if(field!=="room_id")return ambilData<Named[]>(api.get(field==="asset_category_id"?"/asset-categories":"/material-categories"));
        const tree=await ambilData<{nama:string;areas:{nama:string;rooms:Named[]}[]}[]>(api.get("/locations/tree"));
        return tree.flatMap(b=>b.areas.flatMap(a=>a.rooms.map(r=>({...r,nama:`${b.nama} / ${a.nama} / ${r.nama}`}))));
    }});
    const chosen=Array.isArray(value)?value as number[]:[];
    return <fieldset className="flex min-w-0 flex-col gap-2" aria-invalid={galat!==undefined||undefined}><legend className="text-sm font-medium">{label}</legend>{!can(permission)?<Peringatan varian="info">Pilihan memerlukan izin membaca data terkait. Minta Administrator memeriksa akses.</Peringatan>:<><Isian label={`Cari ${label.toLowerCase()}`} value={search} onChange={e=>setSearch(e.target.value)}/>{query.isFetching&&<p role="status">Memuat pilihan…</p>}{query.error&&<Peringatan varian="error">Pilihan belum dapat dimuat. <Tombol varian="secondary" onClick={()=>void query.refetch()}>Coba lagi</Tombol></Peringatan>}<div className="max-h-64 overflow-y-auto">{(query.data??[]).filter(x=>chosen.includes(Number(x.id))||x.nama.toLowerCase().includes(search.toLowerCase())).map(x=><KotakCentang key={x.id} label={x.nama} checked={chosen.includes(Number(x.id))} onCheckedChange={checked=>{const next=checked?[...chosen,Number(x.id)]:chosen.filter(id=>id!==Number(x.id));onChange(next.length?next:undefined);}}/>)}</div>{chosen.some(id=>!query.data?.some(x=>Number(x.id)===id))&&!query.isFetching&&<p role="alert">Sebagian pilihan tersimpan tidak tersedia. Periksa akses atau perbarui pilihan.</p>}</>}{galat&&<p className="text-error-base">{galat}</p>}</fieldset>;
}
