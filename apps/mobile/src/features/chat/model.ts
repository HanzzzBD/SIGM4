import axios, { AxiosError, AxiosHeaders } from "axios";
import type { AxiosAdapter, AxiosInstance } from "axios";
import { ChatSendSchema,readChatEvents } from "@sigm4/schemas";
import type { ChatSend,ChatEvent } from "@sigm4/schemas";
import { internalPath } from "../../shared/navigation";
export class ChatAttempt {
 private body:ChatSend|null=null;
 prepare(sessionId:string,pesan:string,uuid:()=>string){this.body??=ChatSendSchema.parse({session_id:sessionId,pesan,client_message_id:uuid()});return this.body;}
 complete(){this.body=null;}
 get pending(){return this.body!==null;}
}
/**
 * Adapter SSE: adapter `fetch` bawaan axios menguji stream lewat `Response` global, yang di React Native adalah polyfill
 * tanpa `body` sehingga `responseType:"stream"` ditolak sebelum request terkirim. Adapter ini memanggil `expo/fetch`
 * langsung dan meneruskan `res.body` apa adanya — badan galat ikut dibaca interceptor klien bersama (token, refresh 401, pemetaan galat).
 */
export function streamAdapter(fetcher:typeof fetch):AxiosAdapter{return async config=>{
 const timeout=new AbortController(),outer=config.signal as AbortSignal|undefined,abort=()=>timeout.abort();outer?.addEventListener("abort",abort);if(outer?.aborted)abort();
 const timer=config.timeout?setTimeout(abort,config.timeout):null;
 try{
  const headers=Object.fromEntries(Object.entries(AxiosHeaders.from(config.headers).toJSON()).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)]));
  let res:Response;try{res=await fetcher(axios.getUri(config),{method:(config.method??"post").toUpperCase(),headers,body:config.data as NonNullable<Parameters<typeof fetch>[1]>["body"],signal:timeout.signal});}catch(e){if(outer?.aborted)throw e;throw new AxiosError(e instanceof Error?e.message:"Network Error",AxiosError.ERR_NETWORK,config);}
  const response={data:res.body,status:res.status,statusText:res.statusText,headers:Object.fromEntries(res.headers.entries()),config,request:null};
  if(res.ok)return response;
  throw new AxiosError(`Request failed with status code ${res.status}`,res.status>=500?AxiosError.ERR_BAD_RESPONSE:AxiosError.ERR_BAD_REQUEST,config,null,response);
 }finally{if(timer)clearTimeout(timer);} // Pembatalan pemanggil tetap terhubung selama stream dibaca.
};}
export async function sendChat(api:AxiosInstance,fetcher:typeof fetch,body:ChatSend,onEvent:(e:ChatEvent)=>void,signal:AbortSignal){const r=await api.post<ReadableStream<Uint8Array>>("/chat/messages",body,{adapter:streamAdapter(fetcher),responseType:"stream",headers:{Accept:"text/event-stream"},signal,timeout:190000});if(!r.data)throw new Error("Jawaban terputus. Coba lagi pesan yang sama.");await readChatEvents(r.data,onEvent,signal);}
/** Tautan aktif berasal dari server dan hanya membuka origin aplikasi yang dipercaya. */
export function chatLink(url:string,appOrigin:string){try{const origin=new URL(appOrigin),path=internalPath(url);if(origin.protocol!=="https:"||!path)return null;const target=new URL(path,origin);return target.origin===origin.origin?target.toString():null;}catch{return null;}}
export function nativeChatPath(url:string,permissions:Readonly<Record<string,string>>){const p=internalPath(url);if(!p)return null;const routes=[{pattern:/^\/aset\/[1-9]\d*$/,permission:"asset.view"},{pattern:/^\/kerusakan\/[1-9]\d*$/,permission:"damage.view"},{pattern:/^\/persetujuan\/[1-9]\d*$/,permission:"approval.view"},{pattern:/^\/reservasi\/[1-9]\d*$/,permission:"reservation.view"},{pattern:/^\/peminjaman\/[1-9]\d*$/,permission:"loan.view"},{pattern:/^\/denda\/[1-9]\d*$/,permission:"fine.view"},{pattern:/^\/permintaan-bahan\/[1-9]\d*$/,permission:"material.view"},{pattern:/^\/bahan\/[1-9]\d*$/,permission:"material.view"},{pattern:/^\/lokasi\/ruangan\/[1-9]\d*$/,permission:"location.view"}];return routes.some(r=>r.pattern.test(p)&&Object.hasOwn(permissions,r.permission))?p:null;}
