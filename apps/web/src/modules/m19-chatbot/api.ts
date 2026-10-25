import { ChatSessionResponseSchema,ChatSessionsResponseSchema,ChatDetailResponseSchema,readChatEvents } from "@sigm4/schemas";
import type { ChatSend,ChatEvent } from "@sigm4/schemas";
import { api } from "../../shared/api";
export const listSessions=async(page=1)=>ChatSessionsResponseSchema.parse((await api.get("/chat/sessions",{params:{page,per_page:20}})).data);
export const sessionMessages=async(id:string,before?:string)=>ChatDetailResponseSchema.parse((await api.get(`/chat/sessions/${id}`,{params:before?{before}:{}})).data).data;
export const createSession=async(key:string)=>ChatSessionResponseSchema.parse((await api.post("/chat/sessions",{},{headers:{"Idempotency-Key":key}})).data).data;
export async function streamMessage(body:ChatSend,onEvent:(e:ChatEvent)=>void,signal:AbortSignal){const res=await api.post<ReadableStream<Uint8Array>>("/chat/messages",body,{adapter:"fetch",responseType:"stream",signal,timeout:190000,headers:{Accept:"text/event-stream"}});await readChatEvents(res.data,onEvent,signal);}
