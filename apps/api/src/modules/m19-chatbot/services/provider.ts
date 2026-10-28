import { GoogleGenAI,type Interactions } from "@google/genai";
import { TOOL_DECLARATIONS } from "./tools.js";
import { DEFAULT_CHAT_MODEL } from "./model.js";
export interface ProviderRequest {model:string;system:string;steps:Record<string,unknown>[];noTools?:boolean}
export interface ProviderResult {status:string;steps:Record<string,unknown>[];text:string;usage:{input:number;output:number;cached:number;thought:number}}
export interface ChatProvider {countTokens(request:ProviderRequest,signal:AbortSignal):Promise<number>;create(request:ProviderRequest,onDelta:(text:string)=>void,signal:AbortSignal):Promise<ProviderResult>;probe():Promise<boolean>}
export class ProviderError extends Error {constructor(readonly statusCode:number,readonly retryAfter=60){super("Layanan AI tidak tersedia.");}}
function normalizeProviderError(error:unknown):unknown {
 let cause=error;
 for(let depth=0;depth<8&&cause&&typeof cause==="object";depth++){
  if(cause instanceof ProviderError)return cause;
  const current=cause as {statusCode?:number;status?:number;code?:number;cause?:unknown};
  const status=current.statusCode??current.status??current.code;
  if(typeof status==="number"&&status>=400&&status<=599)return new ProviderError(status);
  cause=current.cause;
 }
 return error;
}
/** Satu-satunya berkas pemilik SDK Google; AFC tidak dipakai oleh Interactions. */
export class GeminiChatProvider implements ChatProvider {
 private readonly client:GoogleGenAI;
 constructor(apiKey:string,private readonly probeModel=DEFAULT_CHAT_MODEL,fetcher:typeof fetch=fetch){this.client=new GoogleGenAI({apiKey,httpOptions:{timeout:20000,retryOptions:{attempts:1},fetch:async(input,init)=>{
  const response=await fetcher(input,init);
  if(!response.ok){const header=response.headers.get("retry-after"),seconds=header&&/^\d+$/.test(header)?Number(header):60;await response.body?.cancel();throw new ProviderError(response.status,Math.max(1,Math.min(seconds,3600)));}
  return response;
 }}});}
 async probe(){try{await this.client.models.get({model:this.probeModel,config:{httpOptions:{timeout:1500}}});return true;}catch(e){throw normalizeProviderError(e);}}
 async countTokens(r:ProviderRequest,signal:AbortSignal){try{const x=await this.client.models.countTokens({model:r.model,contents:JSON.stringify({system_instruction:r.system,tools:TOOL_DECLARATIONS,input:r.steps}),config:{abortSignal:signal}});return x.totalTokens??0;}catch(e){throw normalizeProviderError(e);}}
 async create(r:ProviderRequest,onDelta:(text:string)=>void,signal:AbortSignal):Promise<ProviderResult>{
  try{
  const stream=await this.client.interactions.create({model:r.model,store:false,stream:true,system_instruction:r.system,input:r.steps as Interactions.Step[],tools:TOOL_DECLARATIONS as Interactions.Tool[],generation_config:{max_output_tokens:1000,thinking_level:"minimal",tool_choice:r.noTools?"none":"auto"}},{signal});
  const steps=new Map<number,Record<string,unknown>>(),argumentsText=new Map<number,string>();let status="failed",text="",usage={input:0,output:0,cached:0,thought:0},finalSteps:Record<string,unknown>[]|undefined;
  for await(const raw of stream){
   const e=raw as unknown as Record<string,unknown>;
   if(e["event_type"]==="step.start")steps.set(Number(e["index"]),structuredClone(e["step"] as Record<string,unknown>));
   if(e["event_type"]==="step.delta"){
    const d=e["delta"] as Record<string,unknown>,i=Number(e["index"]),step=steps.get(i);
    if(d["type"]==="text"&&step?.["type"]==="model_output"){const part=String(d["text"]??"");text+=part;onDelta(part);const content=(step["content"]??=[]) as {type:string;text:string}[];const last=content.at(-1);if(last?.type==="text")last.text+=part;else content.push({type:"text",text:part});}
    else if(d["type"]==="arguments")argumentsText.set(i,(argumentsText.get(i)??"")+String(d["arguments"]??d["text"]??""));
    else if(d["type"]==="thought_signature"&&step)step["signature"]=d["signature"];
    else if(d["type"]==="thought_summary"&&step){const summary=(step["summary"]??=[]) as unknown[];if(d["content"])summary.push(d["content"]);}
   }
   if(e["event_type"]==="interaction.completed"||e["event_type"]==="interaction.status_update"){
    const interaction=e["interaction"] as Record<string,unknown>|undefined;if(!interaction)continue;status=String(interaction["status"]);if(Array.isArray(interaction["steps"]))finalSteps=interaction["steps"] as Record<string,unknown>[];
    const u=interaction["usage"] as Record<string,number>|undefined;if(u)usage={input:u["total_input_tokens"]??0,output:u["total_output_tokens"]??0,cached:u["total_cached_tokens"]??0,thought:u["total_thought_tokens"]??0};
   }
  }
  for(const [i,v] of argumentsText){const step=steps.get(i);if(step)step["arguments"]=JSON.parse(v);}
  const full=finalSteps??[...steps.values()];if(!text&&["completed","incomplete","budget_exceeded"].includes(status)){text=full.filter(s=>s["type"]==="model_output").flatMap(s=>Array.isArray(s["content"])?s["content"]:[]).filter(c=>c["type"]==="text").map(c=>String(c["text"])).join("");if(text)onDelta(text);}
  return {status,steps:full,text,usage};
  }catch(e){throw normalizeProviderError(e);}
 }
}
