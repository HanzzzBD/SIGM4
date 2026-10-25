import type { Redis } from "ioredis";
import type { AuthContext } from "../../../shared/auth/index.js";
import { DomainError } from "../../../shared/errors/index.js";
export interface ChatQuota {consume(ctx:AuthContext,limit:number,now:Date):Promise<void>;used(ctx:AuthContext,now:Date):Promise<number>}
export function quotaDay(now:Date){const day=new Date(now.getTime()+7*3600000).toISOString().slice(0,10),reset=new Date(Date.parse(`${day}T00:00:00+07:00`)+86400000);return {day,reset};}
export class RedisChatQuota implements ChatQuota {
 constructor(private readonly redis:Redis){}
 async used(ctx:AuthContext,now:Date){const {day}=quotaDay(now);try{return Number(await this.redis.get(`sigm4:chat:quota:${ctx.userId}:${day}`)??0);}catch{throw new DomainError("LLM_UNAVAILABLE","Kuota chatbot belum dapat diperiksa.");}}
 async consume(ctx:AuthContext,limit:number,now:Date){
  const {day,reset}=quotaDay(now);let value;
  try{value=Number(await this.redis.eval("local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>=tonumber(ARGV[1]) then return -1 end; n=redis.call('INCR',KEYS[1]); redis.call('EXPIRE',KEYS[1],ARGV[2]); return n",1,`sigm4:chat:quota:${ctx.userId}:${day}`,limit,Math.ceil((reset.getTime()-now.getTime())/1000)));}catch{throw new DomainError("LLM_UNAVAILABLE","Kuota chatbot belum dapat diperiksa. Gunakan pencarian manual.");}
  if(value===-1)throw new DomainError("RATE_LIMIT_EXCEEDED",`Batas harian chatbot tercapai. Tersedia kembali ${reset.toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB.`,{retry_at:reset.toISOString()});
 }
}
