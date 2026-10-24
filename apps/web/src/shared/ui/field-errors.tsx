import {useEffect,useId,useState} from "react";
import {ApiError} from "../api";
/** Paths include collection indices (unit.0.catatan), so errors target the exact row. */
export function useFieldErrors(labels: Readonly<Record<string,string>> = {}) {
    const id=useId(),[errors,setErrors]=useState<Record<string,string>>({});
    const label=(path:string)=>{const item=/^items\.(\d+)\.(.+)$/.exec(path);return labels[path]??(item?`${({nama_barang:"Nama barang",spesifikasi:"Spesifikasi barang",jumlah:"Jumlah barang",satuan:"Satuan barang",estimasi_harga_satuan:"Estimasi harga satuan",category_id:"Kategori barang",material_id:"Master bahan",keterangan:"Keterangan barang"} as Record<string,string>)[item[2]!]??"Isian barang"} ${Number(item[1])+1}${item[2]==="estimasi_harga_satuan"?" (Rp)":""}`:undefined);};
    useEffect(()=>{const first=Object.keys(errors)[0];if(!first)return;const controls=document.getElementById(id)?.querySelectorAll<HTMLElement>("[data-field]");Array.from(controls??[]).find(el=>el.dataset["field"]===first)?.focus();},[errors,id]);
    const reject=(issues:readonly {path:readonly PropertyKey[];message:string}[])=>{const next:Record<string,string>={};for(const issue of issues){const path=issue.path.join(".");next[path]??=`${label(path)??"Isian ini"}: ${issue.message}`;}setErrors(next);};
    const props=(path:string)=>({"data-field":path,"aria-label":label(path),"aria-invalid":errors[path]?true:undefined,"aria-describedby":errors[path]?`${id}-${path}`:undefined});
    const feedback=(path:string)=>errors[path]?<p id={`${id}-${path}`} className="text-sm text-error-base">{errors[path]}</p>:null;
    const capture=(error:unknown,mapping:Readonly<Record<string,string>>={})=>{if(error instanceof ApiError&&error.details.length){reject(error.details.map(d=>({path:(mapping[d.field]??d.field).split("."),message:d.message})));}};
    return {id,errors,setErrors,reject,props,feedback,capture};
}
