import type { AxiosInstance } from "axios";
import { ChatSendSchema,readChatEvents } from "@sigm4/schemas";
import type { ChatSend,ChatEvent } from "@sigm4/schemas";
import { internalPath } from "../../shared/navigation";
export class ChatAttempt {
 private body:ChatSend|null=null;
 prepare(sessionId:string,pesan:string,uuid:()=>string){this.body??=ChatSendSchema.parse({session_id:sessionId,pesan,client_message_id:uuid()});return this.body;}
 complete(){this.body=null;}
 get pending(){return this.body!==null;}
}
export async function sendChat(api:AxiosInstance,fetcher:typeof fetch,body:ChatSend,onEvent:(e:ChatEvent)=>void,signal:AbortSignal){const r=await api.post<ReadableStream<Uint8Array>>("/chat/messages",body,{adapter:"fetch",env:{fetch:fetcher},responseType:"stream",headers:{Accept:"text/event-stream"},signal,timeout:190000});await readChatEvents(r.data,onEvent,signal);}
/** Tautan aktif berasal dari server dan hanya membuka origin aplikasi yang dipercaya. */
export function chatLink(url:string,appOrigin:string){try{const origin=new URL(appOrigin),path=internalPath(url);if(origin.protocol!=="https:"||!path)return null;const target=new URL(path,origin);return target.origin===origin.origin?target.toString():null;}catch{return null;}}
export function nativeChatPath(url:string,permissions:Readonly<Record<string,string>>){const p=internalPath(url);if(!p)return null;const routes=[{pattern:/^\/aset\/[1-9]\d*$/,permission:"asset.view"},{pattern:/^\/kerusakan\/[1-9]\d*$/,permission:"damage.view"},{pattern:/^\/persetujuan\/[1-9]\d*$/,permission:"approval.view"},{pattern:/^\/reservasi\/[1-9]\d*$/,permission:"reservation.view"}];return routes.some(r=>r.pattern.test(p)&&Object.hasOwn(permissions,r.permission))?p:null;}
