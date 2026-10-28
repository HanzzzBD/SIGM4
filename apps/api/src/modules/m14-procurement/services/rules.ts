import { DomainError } from "../../../shared/errors/index.js";
export const invalid=(field:string,message:string)=>new DomainError("VALIDATION_ERROR",message,{errors:[{field,message}]});
export const wibDate=(date:Date)=>new Date(date.getTime()+7*3600000).toISOString().slice(0,10);
/** BR-061: exact cents, no client-supplied total. */
export function estimatedTotal(items:readonly {jumlah:number;estimasi_harga_satuan:number}[]){const cents=items.reduce((sum,i)=>sum+BigInt(i.jumlah)*BigInt(Math.round(i.estimasi_harga_satuan*100)),0n);if(cents>99999999999999n)throw invalid("items","Total estimasi melebihi batas nominal.");return `${cents/100n}.${(cents%100n).toString().padStart(2,"0")}`;}
export interface ProcurementPolicy {allowMaterialProposals:boolean;allowQuantityIncrease:boolean;rejectedCountsAsFinal:boolean;}
/** Keputusan pengguna melalui pertanyaan interaktif: PR-03-17/18/19/33. */
export const PROCUREMENT_POLICY:Readonly<ProcurementPolicy>={allowMaterialProposals:true,allowQuantityIncrease:false,rejectedCountsAsFinal:false};
export function approvalQuantities(items:readonly {id:string;jumlah_diusulkan:number;jumlah_disetujui:number|null}[],changes:readonly {item_id:number;jumlah_disetujui:number}[]|undefined,allowIncrease:boolean){
 if(changes&&(changes.length!==items.length||new Set(changes.map(c=>c.item_id)).size!==changes.length||changes.some(c=>!items.some(i=>i.id===String(c.item_id)))))throw invalid("rincian_keputusan","Keputusan sebagian harus memuat setiap item usulan tepat sekali.");
 const result=items.map(i=>{const q=changes?.find(c=>String(c.item_id)===i.id)?.jumlah_disetujui??i.jumlah_disetujui??i.jumlah_diusulkan,limit=allowIncrease?i.jumlah_diusulkan:i.jumlah_disetujui??i.jumlah_diusulkan;if(!Number.isInteger(q)||q<0||q>limit)throw invalid("rincian_keputusan",`Jumlah disetujui harus antara 0 dan ${limit}.`);return {id:i.id,jumlah_disetujui:q};});
 if(!result.some(i=>i.jumlah_disetujui>0))throw invalid("rincian_keputusan","Minimal satu unit harus disetujui. Gunakan Tolak bila seluruh item ditolak.");return result;
}
