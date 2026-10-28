import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { ProcurementDetailResponseSchema,ProcurementListResponseSchema,ProcurementOptionsResponseSchema } from "@sigm4/schemas";
import type { ProcurementListQuery } from "@sigm4/schemas";
import { api } from "../../shared/api";
export const statuses={DRAF:"Draf",MENUNGGU_PERSETUJUAN:"Menunggu Persetujuan",DISETUJUI:"Disetujui",DISETUJUI_SEBAGIAN:"Disetujui Sebagian",DITOLAK:"Ditolak",PERLU_REVISI:"Perlu Revisi",DITERIMA_SEBAGIAN:"Diterima Sebagian",SELESAI:"Selesai",TIDAK_DIREALISASIKAN:"Tidak Direalisasikan"} as const;
export const priorities={RENDAH:"Rendah",SEDANG:"Sedang",TINGGI:"Tinggi",MENDESAK:"Mendesak"} as const;
export const money=(value:string)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2}).format(Number(value));
export function procurementValidationMessage(issue:z.core.$ZodIssue|undefined){const fields:Readonly<Record<string,string>>={judul:"judul usulan",items:"daftar barang",tahun_anggaran:"tahun anggaran",prioritas:"prioritas",justifikasi:"justifikasi",lampiran:"lampiran",tanggal_terima:"tanggal penerimaan",nomor_dokumen:"nomor dokumen",dokumen:"dokumen penerimaan"};return issue?.code==="custom"?issue.message:`Periksa ${fields[String(issue?.path[0])]??"isian pengadaan"}. Nilai harus lengkap dan sesuai batas yang ditentukan.`;}
export const listQuery=(search:ProcurementListQuery)=>queryOptions({queryKey:["procurements","list",search],queryFn:async()=>ProcurementListResponseSchema.parse((await api.get("/procurements",{params:search})).data)});
export const detailQuery=(id:string)=>queryOptions({queryKey:["procurements",id],queryFn:async()=>ProcurementDetailResponseSchema.parse((await api.get(`/procurements/${id}`)).data).data});
export const optionsQuery=queryOptions({queryKey:["procurements","options"],queryFn:async()=>ProcurementOptionsResponseSchema.parse((await api.get("/procurements/options")).data).data});
export async function saveProcurement(id:string|undefined,body:unknown,key:string){return ProcurementDetailResponseSchema.parse((await api[id?"put":"post"](id?`/procurements/${id}`:"/procurements",body,{headers:{"Idempotency-Key":key}})).data).data;}
export async function procurementAction(id:string,action:string,body:unknown,key:string){return ProcurementDetailResponseSchema.parse((await api.post(`/procurements/${id}/${action}`,body,{headers:{"Idempotency-Key":key}})).data).data;}
export async function uploadProcurementFile(file:File,kind:"PROCUREMENT_ATTACHMENT"|"PROCUREMENT_RECEIPT_DOCUMENT"|"PROCUREMENT_REJECTION_PHOTO"){
 const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer()),checksum=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
 const order=z.object({data:z.object({file_id:z.string(),upload_url:z.url()})}).parse((await api.post("/files/presign",{jenis:kind,mime:file.type,ukuran:file.size})).data).data;
 const result=await fetch(order.upload_url,{method:"PUT",credentials:"omit",headers:{"content-type":file.type},body:file});if(!result.ok)throw new Error("Berkas belum terunggah. Coba lagi.");
 await api.post("/files/confirm",{file_id:Number(order.file_id),checksum});return {file_id:Number(order.file_id),nama_berkas:file.name};
}
