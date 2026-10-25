import { queryOptions } from "@tanstack/react-query";
import { MaterialListResponseSchema,MaterialDetailResponseSchema,MaterialTransactionsResponseSchema,MaterialCategoriesResponseSchema,MaterialOptionsResponseSchema } from "@sigm4/schemas";
import type { MaterialListQuery } from "@sigm4/schemas";
import { api,ApiError } from "../../shared/api";
export const materialListQuery=(search:MaterialListQuery)=>queryOptions({queryKey:["materials","list",search],queryFn:async()=>MaterialListResponseSchema.parse((await api.get("/materials",{params:search})).data)});
export const materialDetailQuery=(id:string)=>queryOptions({queryKey:["materials","detail",id],queryFn:async()=>MaterialDetailResponseSchema.parse((await api.get(`/materials/${id}`)).data).data});
export const materialUuidQuery=(uuid:string)=>queryOptions({queryKey:["materials","uuid",uuid],queryFn:async()=>MaterialDetailResponseSchema.parse((await api.get(`/materials/by-uuid/${uuid}`)).data).data});
export const materialTransactionsQuery=(id:string,page:number,room?:string)=>queryOptions({queryKey:["materials","transactions",id,page,room],queryFn:async()=>MaterialTransactionsResponseSchema.parse((await api.get(`/materials/${id}/transactions`,{params:{page,per_page:20,room_id:room||undefined}})).data)});
export const materialOptionsQuery=queryOptions({queryKey:["materials","options"],queryFn:async()=>MaterialOptionsResponseSchema.parse((await api.get("/materials/options")).data).data});
export const materialCategoriesQuery=queryOptions({queryKey:["material-categories"],queryFn:async()=>MaterialCategoriesResponseSchema.parse((await api.get("/material-categories")).data).data});
export const materialSave=async(id:string|undefined,body:unknown,key:string)=>MaterialDetailResponseSchema.parse((await api[id?"patch":"post"](id?`/materials/${id}`:"/materials",body,{headers:{"Idempotency-Key":key}})).data).data;
/** Niat write tetap di memori dan memakai key yang sama saat hasil belum pasti (ID-01). */
export class MaterialWriteAttempt {
 private operation:{body:string;key:string}|null=null;
 get pending(){return this.operation!==null;}
 canSend(body:unknown){return this.operation===null||this.operation.body===JSON.stringify(body);}
 async send<T>(body:unknown,write:(body:unknown,key:string)=>Promise<T>){const serialized=JSON.stringify(body);if(this.operation&&this.operation.body!==serialized)throw new Error("Hasil pengiriman sebelumnya belum pasti. Ulangi dengan isian yang sama sebelum mengubahnya.");this.operation??={body:serialized,key:crypto.randomUUID()};try{const r=await write(JSON.parse(this.operation.body) as unknown,this.operation.key);this.operation=null;return r;}catch(error){if(error instanceof ApiError&&error.status>=400&&error.status<500&&error.status!==408&&error.status!==429&&error.kode!=="REQUEST_IN_PROGRESS")this.operation=null;throw error;}}
}
export const materialField="min-h-control-md rounded-sm border border-border-strong bg-surface-default px-3 text-base";
export async function materialFromUuid(uuid:string){return MaterialDetailResponseSchema.parse((await api.get(`/materials/by-uuid/${uuid}`)).data).data;}
