import type { TransactionScope } from "../../../shared/db/index.js";
export type MaintenanceCompletionHook=(scope:TransactionScope,id:number,completedAt:Date)=>Promise<void>;
const hooks=new Map<string,MaintenanceCompletionHook>();
/** PR-04-07 mendaftarkan hitung ulang jadwal; transaksi penutupan WO memanggilnya sekali. */
export function registerMaintenanceCompletionHook(name:string,hook:MaintenanceCompletionHook){if(!hooks.has(name))hooks.set(name,hook);}
export async function runMaintenanceCompletionHooks(scope:TransactionScope,id:number,completedAt:Date){for(const hook of hooks.values())await hook(scope,id,completedAt);}
