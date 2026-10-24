import type { QueueDatabase, SqliteConnection, QueueFiles } from "../../shared/upload/queue";
import { MobileApiError } from "../../shared/api/client";
import { StocktakeSessionSchema, StocktakeItemSchema, StocktakeScanSchema, StocktakeFindingSchema,MaterialStocktakeCountSchema,MaterialStocktakeItemSchema } from "@sigm4/schemas";
import type { StocktakeSession, StocktakeItem,MaterialStocktakeItem } from "@sigm4/schemas";
import { z } from "zod";

export const STOCKTAKE_TTL = 72 * 60 * 60 * 1000;
export interface LocalPhoto { id: string; path: string; checksum: string; size: number; createdAt: number; fileId?: string }
export interface PendingInspection { id: string; accountId: string; sessionId: string; kind: "scan" | "finding" | "material"; entityKey: string; body: Record<string, unknown>; photos: LocalPhoto[]; createdAt: number; attempts: number; nextAttemptAt: number; error: string | null; blocked: boolean }
interface Row { id: string; accountId: string; sessionId: string; kind: "scan" | "finding" | "material"; entityKey: string; body: string; photos: string; createdAt: number; attempts: number; nextAttemptAt: number; error: string | null; blocked: number }
const decode = (r: Row): PendingInspection => ({ ...r, body: JSON.parse(r.body) as Record<string, unknown>, photos: JSON.parse(r.photos) as LocalPhoto[], blocked: !!r.blocked });
const Cache = z.object({ session: StocktakeSessionSchema, items: z.array(StocktakeItemSchema), material_items:z.array(MaterialStocktakeItemSchema).default([]), categories: z.array(z.object({ id: z.string(), nama: z.string() })).default([]) });
export class StocktakeQueue {
    private writes: Promise<void> = Promise.resolve();
    private draining: Promise<void> | null = null;
    private controller: AbortController | null = null;
    constructor(private readonly db: QueueDatabase, private readonly files: QueueFiles, private readonly now: () => number) {}
    async initialize() {
        await this.db.execAsync("CREATE TABLE IF NOT EXISTS stocktake_pending(id TEXT PRIMARY KEY,accountId TEXT NOT NULL,sessionId TEXT NOT NULL,kind TEXT NOT NULL,entityKey TEXT NOT NULL,body TEXT NOT NULL,photos TEXT NOT NULL,createdAt INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,nextAttemptAt INTEGER NOT NULL,error TEXT,blocked INTEGER NOT NULL DEFAULT 0,UNIQUE(accountId,sessionId,kind,entityKey)); CREATE TABLE IF NOT EXISTS stocktake_cache(accountId TEXT NOT NULL,sessionId TEXT NOT NULL,roomId TEXT NOT NULL,payload TEXT NOT NULL,expiresAt INTEGER NOT NULL,PRIMARY KEY(accountId,sessionId,roomId));");
        await this.prune();
    }
    private write(fn: (tx: SqliteConnection) => Promise<void>) {
        const task = this.writes.then(() => this.db.withExclusiveTransactionAsync(fn)); this.writes = task.catch(() => undefined); return task;
    }
    async list(account: string, session?: string) {
        const rows = await this.db.getAllAsync<Row>(`SELECT * FROM stocktake_pending WHERE accountId=?${session ? " AND sessionId=?" : ""} ORDER BY createdAt,id`, session ? [account, session] : [account]);
        return rows.map(decode);
    }
    async enqueue(entry: Pick<PendingInspection, "id" | "accountId" | "sessionId" | "kind" | "body" | "photos">) {
        if (!entry.accountId || !/^[1-9]\d*$/.test(entry.sessionId)) throw new Error("Akun dan sesi opname harus diketahui.");
        const checked = (entry.kind === "material"?MaterialStocktakeCountSchema:entry.kind === "scan" ? StocktakeScanSchema : StocktakeFindingSchema).parse({ ...entry.body, client_scan_id: entry.id, foto_file_ids: [] });
        if(entry.kind==="material"&&entry.photos.length)throw new Error("Hitungan Bahan tidak memerlukan antrean foto.");
        const entity = entry.kind==="material"?`${entry.body["material_id"]}:${entry.body["room_id"]}:${entry.body["revision"]}`:entry.kind === "scan" ? String(entry.body["asset_id"]) : entry.id;
        let inserted = false;
        await this.write(async tx => {
            const existing = await tx.getAllAsync<Row>("SELECT * FROM stocktake_pending WHERE accountId=? AND sessionId=? AND kind=? AND entityKey=?", [entry.accountId, entry.sessionId, entry.kind, entity]);
            if (existing.length) return;
            const rows = await tx.getAllAsync<Row>("SELECT * FROM stocktake_pending WHERE accountId=?", [entry.accountId]);
            if (rows.length >= 10000) throw new Error("Antrean opname penuh. Sinkronkan sebelum melanjutkan.");
            const photoCount = rows.reduce((n, r) => n + (JSON.parse(r.photos) as unknown[]).length, 0);
            if (photoCount + entry.photos.length > 50) throw new Error("Antrean mencapai batas 50 foto. Sinkronkan foto sebelum menambah bukti.");
            for (const p of entry.photos) if (p.size > 500 * 1024 || !/^[a-f0-9]{64}$/.test(p.checksum)) throw new Error("Foto belum dikompres atau checksum tidak sah.");
            await tx.runAsync("INSERT INTO stocktake_pending(id,accountId,sessionId,kind,entityKey,body,photos,createdAt,nextAttemptAt) VALUES(?,?,?,?,?,?,?,?,?)", [entry.id, entry.accountId, entry.sessionId, entry.kind, entity, JSON.stringify(checked), JSON.stringify(entry.photos), this.now(), this.now()]); inserted = true;
        });
        return inserted;
    }
    async save(entry: PendingInspection) { await this.write(async tx => { await tx.runAsync("UPDATE stocktake_pending SET body=?,photos=? WHERE id=? AND accountId=?", [JSON.stringify(entry.body), JSON.stringify(entry.photos), entry.id, entry.accountId]); }); }
    async cache(account: string, room: string, session: StocktakeSession, items: StocktakeItem[], categories: readonly { id: string; nama: string }[] = []) {
        const payload = Cache.parse({ session, items, categories });
        await this.write(async tx => { await tx.runAsync("INSERT INTO stocktake_cache VALUES(?,?,?,?,?) ON CONFLICT(accountId,sessionId,roomId) DO UPDATE SET payload=excluded.payload,expiresAt=excluded.expiresAt", [account, session.id, room, JSON.stringify(payload), this.now() + STOCKTAKE_TTL]); });
    }
    async cacheMaterials(account:string,room:string,session:StocktakeSession,items:MaterialStocktakeItem[]){
        if(session.domain!=="BAHAN")throw new Error("Cache hitungan hanya untuk opname Bahan.");
        const payload=Cache.parse({session,items:[],material_items:items,categories:[]});
        await this.write(async tx=>{await tx.runAsync("INSERT INTO stocktake_cache VALUES(?,?,?,?,?) ON CONFLICT(accountId,sessionId,roomId) DO UPDATE SET payload=excluded.payload,expiresAt=excluded.expiresAt",[account,session.id,room,JSON.stringify(payload),this.now()+STOCKTAKE_TTL]);});
    }
    async cached(account: string, session: string, room: string) {
        const rows = await this.db.getAllAsync<{ payload: string }>("SELECT payload FROM stocktake_cache WHERE accountId=? AND sessionId=? AND roomId=? AND expiresAt>?", [account, session, room, this.now()]);
        return rows[0] ? Cache.parse(JSON.parse(rows[0].payload)) : null;
    }
    async sessions(account: string) {
        const rows = await this.db.getAllAsync<{ payload: string }>("SELECT payload FROM stocktake_cache WHERE accountId=? AND expiresAt>? ORDER BY sessionId,roomId", [account, this.now()]);
        return [...new Map(rows.map(r => { const s = Cache.parse(JSON.parse(r.payload)).session; return [s.id, s]; })).values()];
    }
    async cachedRooms(account: string, session: string) {
        const rows = await this.db.getAllAsync<{ roomId: string }>("SELECT roomId FROM stocktake_cache WHERE accountId=? AND sessionId=? AND expiresAt>?", [account, session, this.now()]); return rows.map(r => r.roomId);
    }
    stop() { this.controller?.abort(); }
    async discard(id: string, account: string) {
        const entries = (await this.list(account)).filter(e => e.id === id);
        await this.write(async tx => { await tx.runAsync("DELETE FROM stocktake_pending WHERE id=? AND accountId=?", [id, account]); });
        await Promise.all(entries.flatMap(e => e.photos).map(p => this.files.remove(p.path)));
    }
    async clear(account: string) {
        this.stop(); await this.writes; const entries = await this.list(account);
        await this.write(async tx => { await tx.runAsync("DELETE FROM stocktake_pending WHERE accountId=?", [account]); await tx.runAsync("DELETE FROM stocktake_cache WHERE accountId=?", [account]); });
        await Promise.all(entries.flatMap(e => e.photos).map(p => this.files.remove(p.path)));
    }
    async prune() {
        // Expiring access to cached targets must not discard observations awaiting server receipt.
        await this.write(async tx => { await tx.runAsync("DELETE FROM stocktake_cache WHERE expiresAt<=?", [this.now()]); });
    }
    async retry(account: string) { await this.write(async tx => { await tx.runAsync("UPDATE stocktake_pending SET blocked=0,error=NULL,nextAttemptAt=? WHERE accountId=?", [this.now(), account]); }); }
    drain(account: string, currentAccount: () => string | null, send: (entry: PendingInspection, signal: AbortSignal) => Promise<{ duplicate: boolean }>, onResult: (entry: PendingInspection, duplicate: boolean) => void = () => undefined) {
        if (this.draining) return this.draining;
        this.controller = new AbortController();
        const signal = this.controller.signal;
        const task = async () => {
            await this.prune();
            for (const entry of await this.list(account)) {
                if (signal.aborted || currentAccount() !== account) return;
                if (entry.blocked || entry.nextAttemptAt > this.now()) continue;
                try {
                    const result = await send(entry, signal);
                    if (signal.aborted || currentAccount() !== account) return;
                    await this.discard(entry.id, account); onResult(entry, result.duplicate);
                } catch (e) {
                    if (signal.aborted || currentAccount() !== account) return;
                    const blocked = e instanceof MobileApiError && [400, 403, 404, 410, 422].includes(e.status);
                    const error = e instanceof Error ? e.message : "Hasil belum tersinkron.";
                    await this.write(async tx => { await tx.runAsync("UPDATE stocktake_pending SET attempts=attempts+1,nextAttemptAt=?,error=?,blocked=? WHERE id=? AND accountId=?", [this.now() + Math.min(300000, 1000 * 2 ** Math.min(entry.attempts, 8)), error, blocked ? 1 : 0, entry.id, account]); });
                    if (!blocked) break;
                }
            }
        };
        this.draining = task().finally(() => { this.draining = null; this.controller = null; }); return this.draining;
    }
}
