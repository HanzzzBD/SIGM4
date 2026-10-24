import type { AxiosInstance } from "axios";
import { z } from "zod";
import { StocktakeResponseSchema, StocktakeListSchema, StocktakeItemsSchema,MaterialStocktakeItemsSchema,parseMaterialQr } from "@sigm4/schemas";
import type { StocktakeItem,MaterialStocktakeItem } from "@sigm4/schemas";
import type { StocktakeQueue } from "./queue";
/** A new inspection starts from its own snapshot, never the previous asset's edit. */
export function initialInspectionCondition(item: Pick<StocktakeItem, "kondisi_sistem"> | null): StocktakeItem["kondisi_sistem"] {
    return item?.kondisi_sistem ?? "BAIK";
}
export function snapshotCode(value: string, trustedOrigin: string): { uuid?: string; code?: string } {
    const text = value.trim();
    if (!text || text.length > 500) throw new Error("Kode aset tidak sah.");
    if (!text.includes(":")) return { code: text };
    try {
        const url = new URL(text), uuid = url.pathname.slice(3);
        if (url.protocol !== "https:" || url.origin !== new URL(trustedOrigin).origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith("/a/") || !/^[0-9a-f-]{36}$/i.test(uuid)) throw new Error();
        return { uuid };
    } catch { throw new Error("QR bukan label aset sekolah ini. Gunakan kode aset manual."); }
}
export function cachedAsset(value: string, origin: string, items: readonly StocktakeItem[]) {
    const parsed = snapshotCode(value, origin);
    return items.find(i => parsed.uuid ? i.uuid.toLowerCase() === parsed.uuid.toLowerCase() : i.kode_barang.toLowerCase() === parsed.code!.toLowerCase()) ?? null;
}
export async function loadStocktakeLocation(api: AxiosInstance, queue: StocktakeQueue, account: string, id: string, room: string, signal: AbortSignal) {
    const session = StocktakeResponseSchema.parse((await api.get(`/audit-sessions/${id}`, { signal })).data).data;
    const context = z.object({ data: z.object({ categories: z.array(z.object({ id: z.string(), nama: z.string() })) }) }).parse((await api.get(`/audit-sessions/${id}/context`, { signal })).data).data;
    const items: StocktakeItem[] = [];
    for (let page = 1; ; page++) { const r = StocktakeItemsSchema.parse((await api.get(`/audit-sessions/${id}/items`, { params: { room_id: Number(room), page, per_page: 500 }, signal })).data); items.push(...r.data); if (page >= r.meta.total_pages) break; }
    if (signal.aborted) throw new Error("Pemuatan dibatalkan.");
    await queue.cache(account, room, session, items, context.categories); return { session, items, categories: context.categories };
}
export const loadMine = async (api: AxiosInstance, page: number, signal: AbortSignal) => StocktakeListSchema.parse((await api.get("/audit-sessions/mine", { params: { page, per_page: 20 }, signal })).data);
export async function requireEmptyLocationQueue(queue: StocktakeQueue, account: string, session: string, room: string) {
    const pending = (await queue.list(account, session)).filter(e => String(e.body["room_id"]) === room);
    if (pending.length) throw new Error(`${pending.length} pemeriksaan/foto lokasi ini belum tersinkron. Sinkronkan atau tangani hasil bermasalah dahulu.`);
}

export function cachedMaterial(value:string,origin:string,items:readonly MaterialStocktakeItem[],room:string){
 const uuid=parseMaterialQr(value,origin);if(!uuid)throw new Error("QR bukan label Bahan sekolah ini. Pilih bahan dari daftar lokasi.");
 return items.find(i=>i.uuid.toLowerCase()===uuid&&i.room_id===room)??null;
}
export async function loadMaterialStocktakeLocation(api:AxiosInstance,queue:StocktakeQueue,account:string,id:string,room:string,signal:AbortSignal){
 const session=StocktakeResponseSchema.parse((await api.get(`/audit-sessions/${id}`,{signal})).data).data;if(session.domain!=="BAHAN")throw new Error("Sesi bukan opname Bahan.");
 const material_items:MaterialStocktakeItem[]=[];for(let page=1;;page++){const result=MaterialStocktakeItemsSchema.parse((await api.get(`/audit-sessions/${id}/material-items`,{params:{room_id:Number(room),page,per_page:500},signal})).data);material_items.push(...result.data);if(page>=result.meta.total_pages)break;}
 if(signal.aborted)throw new Error("Pemuatan dibatalkan.");await queue.cacheMaterials(account,room,session,material_items);return {session,material_items};
}
