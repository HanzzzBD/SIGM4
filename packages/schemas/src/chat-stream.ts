import { ChatEventSchema } from "./chat.js";
import type { ChatEvent } from "./chat.js";
/** Parser SSE bersama untuk kedua klien, tanpa ketergantungan UI atau penyimpanan. */
export class ChatEventParser {
 private pending="";
 push(chunk:string):ChatEvent[]{this.pending+=chunk;if(this.pending.length>1000000)throw new Error("Respons chatbot terlalu besar.");const events:ChatEvent[]=[];for(;;){const match=/\r?\n\r?\n/.exec(this.pending);if(!match)break;const block=this.pending.slice(0,match.index);this.pending=this.pending.slice(match.index+match[0].length);const data=block.split(/\r?\n/).filter(l=>l.startsWith("data:")).map(l=>l.slice(5).trimStart()).join("\n");if(data)events.push(ChatEventSchema.parse(JSON.parse(data)));}return events;}
 finish(){if(this.pending.trim())throw new Error("Respons chatbot terputus. Muat ulang riwayat atau coba pesan yang sama.");}
}
export async function readChatEvents(stream:ReadableStream<Uint8Array>,onEvent:(e:ChatEvent)=>void,signal:AbortSignal){const reader=stream.getReader(),decoder=new TextDecoder(),parser=new ChatEventParser();let done=false;const cancel=()=>{void reader.cancel();};signal.addEventListener("abort",cancel,{once:true});try{for(;;){if(signal.aborted)throw new Error("Permintaan dibatalkan.");const r=await reader.read();if(r.done)break;for(const e of parser.push(decoder.decode(r.value,{stream:true}))){if(e.type==="done")done=true;onEvent(e);}}for(const e of parser.push(decoder.decode())){if(e.type==="done")done=true;onEvent(e);}parser.finish();if(!done)throw new Error("Jawaban terputus. Muat ulang riwayat atau coba pesan yang sama.");}finally{signal.removeEventListener("abort",cancel);reader.releaseLock();}}
