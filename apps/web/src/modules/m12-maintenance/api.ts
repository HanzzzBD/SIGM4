import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { WorkOrderDetailResponseSchema,WorkOrderListResponseSchema,WorkOrderResponseSchema,ServiceHistoryResponseSchema,WorkOrderCreateSchema } from "@sigm4/schemas";
import type { WorkOrderListQuery } from "@sigm4/schemas";
import { api,ApiError } from "../../shared/api";
export const statuses={DITUGASKAN:"Ditugaskan",DIKERJAKAN:"Dikerjakan",TERTUNDA:"Tertunda",MENUNGGU_VERIFIKASI:"Menunggu Verifikasi",SELESAI:"Selesai",DIBATALKAN:"Dibatalkan",TIDAK_DAPAT_DIPERBAIKI:"Tidak Dapat Diperbaiki"} as const;
export const priorities={RENDAH:"Rendah",SEDANG:"Sedang",TINGGI:"Tinggi",KRITIS:"Kritis"} as const;
export const money=(value:string|null)=>value===null?"Tidak tersedia":new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:2}).format(Number(value));
export const time=(value:string|null)=>value===null?"—":new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"}).format(new Date(value))+" WIB";
export const workOrderListQuery=(params:WorkOrderListQuery)=>queryOptions({queryKey:["work-orders","list",params],queryFn:async()=>WorkOrderListResponseSchema.parse((await api.get("/work-orders",{params})).data)});
export const workOrderDetailQuery=(id:string)=>queryOptions({queryKey:["work-orders",id],queryFn:async()=>WorkOrderDetailResponseSchema.parse((await api.get(`/work-orders/${id}`)).data).data,retry:(n,e)=>!(e instanceof ApiError&&[403,404].includes(e.status))&&n<2});
export const technicianQuery=queryOptions({queryKey:["work-orders","technicians"],queryFn:async()=>z.object({data:z.array(z.object({id:z.string(),nama:z.string(),work_order_aktif:z.string()}))}).parse((await api.get("/work-orders/technicians")).data).data});
export const historyQuery=(assetId:string,page=1)=>queryOptions({queryKey:["service-history",assetId,page],queryFn:async()=>ServiceHistoryResponseSchema.parse((await api.get(`/assets/${assetId}/service-history`,{params:{page,per_page:10}})).data)});
export async function createWorkOrder(body:unknown,key:string){return WorkOrderResponseSchema.parse((await api.post("/work-orders",WorkOrderCreateSchema.parse(body),{headers:{"Idempotency-Key":key}})).data).data;}
export async function workOrderAction(id:string,action:string,body:unknown,key:string){const config={headers:{"Idempotency-Key":key}};const result=action.startsWith("photos/")?await api.delete(`/work-orders/${id}/${action}`,config):await api[["start","progress"].includes(action)?"patch":"post"](`/work-orders/${id}/${action}`,body,config);return WorkOrderDetailResponseSchema.parse(result.data).data;}
export async function uploadWorkOrderPhoto(file:File){
 const bytes=await crypto.subtle.digest("SHA-256",await file.arrayBuffer()),checksum=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
 const order=z.object({data:z.object({file_id:z.string(),upload_url:z.url()})}).parse((await api.post("/files/presign",{jenis:"WORK_ORDER_PHOTO",mime:file.type,ukuran:file.size})).data).data;
 const put=await fetch(order.upload_url,{method:"PUT",credentials:"omit",headers:{"content-type":file.type},body:file});if(!put.ok)throw new Error("Foto belum terunggah. Coba lagi.");
 await api.post("/files/confirm",{file_id:Number(order.file_id),checksum});return Number(order.file_id);
}
