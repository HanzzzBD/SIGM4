/** Date-only values remain calendar dates; API receives YYYY-MM-DD. */
export function resumeDateError(value:string,today:string):string|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)return "Pilih tanggal lanjut yang sah.";
 return value<today?"Tanggal lanjut tidak boleh sebelum hari ini.":null;
}
export function monthDates(month:string):string[]{const first=new Date(`${month}-01T00:00:00Z`);if(!Number.isFinite(first.getTime()))return [];const next=new Date(first);next.setUTCMonth(next.getUTCMonth()+1);return Array.from({length:Math.round((next.getTime()-first.getTime())/86400000)},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}`);}
export function moveMonth(month:string,offset:number){const value=new Date(`${month}-01T00:00:00Z`);value.setUTCMonth(value.getUTCMonth()+offset);return value.toISOString().slice(0,7);}
export const dateLabel=(date:string)=>new Date(`${date}T00:00:00Z`).toLocaleDateString("id-ID",{timeZone:"UTC",weekday:"long",day:"numeric",month:"long",year:"numeric"});
