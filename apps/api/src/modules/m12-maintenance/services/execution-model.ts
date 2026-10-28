import { DomainError } from "../../../shared/errors/index.js";
export const workOrderError=(field:string,message:string)=>new DomainError("VALIDATION_ERROR",message,{errors:[{field,message}]});
export function costRows(items:readonly {deskripsi:string;jumlah:number;harga_satuan:number}[]) {
    const rows=items.map(i=>{
        const cents=(BigInt(Math.round(i.jumlah*1000))*BigInt(Math.round(i.harga_satuan*100))+500n)/1000n;
        if(cents>99999999999999n) throw workOrderError("biaya","Rincian biaya melebihi batas nominal.");
        return {deskripsi:i.deskripsi,jumlah:i.jumlah.toFixed(3),harga_satuan:i.harga_satuan.toFixed(2),total:money(cents),cents};
    });
    const total=rows.reduce((sum,r)=>sum+r.cents,0n);
    if(total>99999999999999n) throw workOrderError("biaya","Total biaya melebihi batas nominal.");
    return {rows:rows.map(row=>({deskripsi:row.deskripsi,jumlah:row.jumlah,harga_satuan:row.harga_satuan,total:row.total})),total:money(total)};
}
export function money(cents:bigint) {return `${cents/100n}.${(cents%100n).toString().padStart(2,"0")}`;}
export function editable(status:string) {if(!["DIKERJAKAN","TERTUNDA"].includes(status)) throw workOrderError("status","Progres hanya dapat diubah ketika pekerjaan Dikerjakan atau Tertunda.");}
export function requireCompletion(checklist:readonly {selesai:boolean}[],photos:readonly {checksum:string|null;scan_status:string}[],pendingEstimate:boolean) {
    if(checklist.some(i=>!i.selesai)) throw workOrderError("checklist","Seluruh checklist wajib diselesaikan.");
    if(!photos.some(p=>p.checksum!==null&&p.scan_status==="CLEAN")) throw workOrderError("foto_file_ids","Minimal satu foto hasil pekerjaan harus terunggah dan lolos pemeriksaan.");
    if(photos.some(p=>p.checksum===null||p.scan_status!=="CLEAN")) throw workOrderError("foto_file_ids","Tunggu seluruh foto hasil terunggah dan lolos pemeriksaan sebelum menyelesaikan pekerjaan.");
    if(pendingEstimate) throw workOrderError("estimasi","Estimasi biaya masih menunggu persetujuan.");
}
