import { WorkOrderVerifySchema } from "@sigm4/schemas";
import type { StatusTone } from "../../shared/ui/status";
import type { AxiosInstance } from "axios";
import { WorkOrderDetailResponseSchema,ServiceHistoryResponseSchema,WorkOrderListResponseSchema } from "@sigm4/schemas";
import { MobileApiError } from "../../shared/api/client";
import type { UploadQueue,NewUpload } from "../../shared/upload/queue";
export const workOrderStatuses={DITUGASKAN:"Ditugaskan",DIKERJAKAN:"Dikerjakan",TERTUNDA:"Tertunda",MENUNGGU_VERIFIKASI:"Menunggu Verifikasi",SELESAI:"Selesai",DIBATALKAN:"Dibatalkan",TIDAK_DAPAT_DIPERBAIKI:"Tidak Dapat Diperbaiki"} as const;
export const workOrderStatusTones:Readonly<Record<keyof typeof workOrderStatuses,StatusTone>>={DITUGASKAN:"pending",DIKERJAKAN:"info",TERTUNDA:"warning",MENUNGGU_VERIFIKASI:"pending",SELESAI:"success",DIBATALKAN:"pending",TIDAK_DAPAT_DIPERBAIKI:"error"};
export const workOrderPriorityTones:Readonly<Record<keyof typeof workOrderPriorities,StatusTone>>={RENDAH:"pending",SEDANG:"info",TINGGI:"warning",KRITIS:"error"};
export const workOrderPriorities={RENDAH:"Rendah",SEDANG:"Sedang",TINGGI:"Tinggi",KRITIS:"Kritis"} as const;
export const loadWorkOrder=async(api:AxiosInstance,id:string,signal:AbortSignal)=>WorkOrderDetailResponseSchema.parse((await api.get(`/work-orders/${id}`,{signal})).data).data;
export const loadMine=async(api:AxiosInstance,page:number,assetId:string|undefined,signal:AbortSignal)=>WorkOrderListResponseSchema.parse((await api.get("/work-orders/mine",{params:{page,per_page:20,...(assetId?{asset_id:assetId}:{})},signal})).data);
export const loadServiceHistory=async(api:AxiosInstance,id:string,page:number,signal:AbortSignal)=>ServiceHistoryResponseSchema.parse((await api.get(`/assets/${id}/service-history`,{params:{page,per_page:10},signal})).data);
export class WorkOrderAttempt {
 private active=false;
 private request:{action:string;signature:string;key:string}|null=null;
 constructor(private readonly api:AxiosInstance,private readonly uuid:()=>string,private readonly account:string,private readonly currentAccount:()=>string|null){}
 get uncertain(){return this.request!==null;}
 async send(id:string,action:string,body:unknown,signal:AbortSignal){
  const guard=()=>{if(signal.aborted||!this.account||this.currentAccount()!==this.account)throw new Error("Sesi berubah atau tindakan dibatalkan.");};guard();
  if(this.active)throw new Error("Tindakan sedang dikirim.");
  const signature=JSON.stringify({id,body});if(this.request&&(this.request.action!==action||this.request.signature!==signature))throw new Error("Hasil tindakan sebelumnya belum pasti. Ulangi tindakan dengan isian yang sama.");
  this.request??={action,signature,key:this.uuid()};this.active=true;
  try{
   const config={signal,headers:{"Idempotency-Key":this.request.key}};
   const response=action.startsWith("photos/")?await this.api.delete(`/work-orders/${id}/${action}`,config):await this.api[["start","progress"].includes(action)?"patch":"post"](`/work-orders/${id}/${action}`,body,config);
   const result=WorkOrderDetailResponseSchema.parse(response.data).data;guard();this.request=null;return result;
  }catch(e){if(e instanceof MobileApiError&&((e.status>=400&&e.status<500&&e.status!==408)||e.code==="OFFLINE"))this.request=null;throw e;}finally{this.active=false;}
 }
}
/** SQLite hanya menyimpan byte dan metadata unggah; catatan/checklist/biaya tidak masuk antrean. */
export async function queueWorkOrderPhoto(queue:UploadQueue,photo:Pick<NewUpload,"id"|"path"|"checksum"|"size"|"createdAt">,account:string,workOrderId:string){
 if(!/^[1-9]\d*$/.test(workOrderId)||!account)throw new Error("Pekerjaan dan akun harus diketahui sebelum menyimpan foto.");
 await queue.enqueue({...photo,accountId:account,ownerType:"WORK_ORDER_PHOTO",ownerId:workOrderId,fileId:null});
}
/** Jangan tutup WO sementara bukti lokalnya belum ditautkan ke server. */
export async function requireUploadedWorkOrderPhotos(queue:Pick<UploadQueue,"list">,account:string,id:string){
 if((await queue.list(account)).some(p=>p.ownerType==="WORK_ORDER_PHOTO"&&p.ownerId===id))throw new Error("Foto hasil masih di antrean. Unggah atau batalkan foto sebelum mengajukan hasil pekerjaan.");
}
/** MS-61 (P-42): daftar seluruh WO bagi pengelola — saring status & kata kunci; teknisi tetap memakai `/mine`. */
export const loadAll=async(api:AxiosInstance,q:{page:number;status?:string;q?:string;assetId?:string|undefined},signal:AbortSignal)=>WorkOrderListResponseSchema.parse((await api.get("/work-orders",{params:{page:q.page,per_page:20,...(q.status?{status:q.status}:{}),...(q.q?{q:q.q}:{}),...(q.assetId?{asset_id:q.assetId}:{})},signal})).data);
/** Pengelola WO (verifikasi/pembuatan) melihat seluruh antrean; teknisi murni hanya penugasannya. */
export const managesWorkOrders=(p:Readonly<Record<string,string>>)=>Object.hasOwn(p,"workorder.view")&&(Object.hasOwn(p,"workorder.verify")||Object.hasOwn(p,"workorder.create"));
/** Body verifikasi FR-12.4: Tutup (kondisi pasca wajib bila objek aset) atau Kembalikan beralasan. */
export function verifyWorkOrderBody(close: boolean, note: string, condition: string, isAsset: boolean): { body: unknown } | { error: string } {
    if (close && isAsset && !condition) return { error: "Pilih kondisi aset sesudah perbaikan." };
    const p = WorkOrderVerifySchema.safeParse({ keputusan: close ? "TUTUP" : "KEMBALIKAN", ...(note.trim() ? { catatan: note.trim() } : {}), ...(close && condition ? { kondisi_pasca: condition } : {}) });
    return p.success ? { body: p.data } : { error: p.error.issues.map((i) => i.message).join(" ") };
}

