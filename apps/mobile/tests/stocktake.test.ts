import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import axios from "axios";
import { afterEach, describe, expect, it } from "vitest";
import { StocktakeQueue, STOCKTAKE_TTL } from "../src/features/stocktake/queue.js";
import { OfflineOpnameAuthStore } from "../src/shared/offline-opname-auth.js";
import { MobileApiError } from "../src/shared/api/client.js";
import { createStocktakeSender } from "../src/features/stocktake/sender.js";
import type { QueueDatabase, SqliteConnection } from "../src/shared/upload/queue.js";
import { cachedMaterial,loadMaterialStocktakeLocation, initialInspectionCondition } from "../src/features/stocktake/model.js";
import type { MaterialStocktakeItem,StocktakeSession } from "@sigm4/schemas";
const handles: DatabaseSync[] = [], folders: string[] = [];
afterEach(() => { handles.splice(0).forEach(db => db.close()); folders.splice(0).forEach(p => { if (!p.startsWith(join(tmpdir(), "sigm4-stocktake-"))) throw new Error("Direktori uji tidak sah"); rmSync(p, { recursive: true, force: true }); }); });
function open(path = ":memory:"): QueueDatabase {
    const db = new DatabaseSync(path); handles.push(db);
    const connection: SqliteConnection = { execAsync: async sql => { db.exec(sql); }, runAsync: async (sql, args) => db.prepare(sql).run(...args), getAllAsync: async <T>(sql: string, args: (string | number | null)[] = []) => db.prepare(sql).all(...args) as T[] };
    return { ...connection, withExclusiveTransactionAsync: async fn => { db.exec("BEGIN IMMEDIATE"); try { await fn(connection); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}
const entry = (asset: number, accountId = "1") => ({ id: randomUUID(), accountId, sessionId: "10", kind: "scan" as const, body: { asset_id: asset, room_id: 2, kondisi: "BAIK", catatan: "Diperiksa luring" }, photos: [] });
const files = { remove: async () => undefined };
const materialSession:StocktakeSession={id:"10",nomor:"OPN-2026-0010",nama:"Bahan",domain:"BAHAN",periode_mulai:"2026-10-14",periode_selesai:"2026-10-20",cakupan:{jenis:"RUANGAN",id:2},status:"BERJALAN",created_by:"1",finalized_at:null,catatan_keputusan:null,disetujui_oleh:null,disetujui_pada:null,target:1,diperiksa:0,selisih:0,temuan_baru:0,belum_dilengkapi:1,temuan_belum_dilengkapi:0,foto_tertunda:0,pelaksana:[{id:"1",nama:"Petugas"}],lokasi:[{id:"2",nama:"Gudang",target:1,diperiksa:0,selesai:false}],report_status:"BELUM"};
const materialItem:MaterialStocktakeItem={id:"1",material_id:"9",room_id:"2",nama:"Kertas",uuid:"93a2d3fe-1c97-40fb-98fe-b4ad03ecf479",satuan_id:"1",satuan_nama:"Rim",satuan_simbol:"rim",lokasi:"Gudang",saldo_sistem:10,jumlah_fisik:null,basis_saldo:null,basis_ledger_id:null,selisih:null,selisih_snapshot:null,revision:0,keterangan:null,diperiksa_oleh:null,diperiksa_pada:null,saldo_sekarang:10,ledger_id_sekarang:"11",satuan_berubah:false,perlu_hitung_ulang:false};
const materialCount=()=>({id:randomUUID(),accountId:"1",sessionId:"10",kind:"material" as const,body:{material_id:9,room_id:2,jumlah_fisik:0,basis:{saldo:10,ledger_id:"11"},revision:0,keterangan:"Fisik kosong"},photos:[]});

describe("UX-020 per-asset inspection condition", () => {
 it("starts each new asset from its own snapshot after a damaged asset or new finding", () => {
  expect(initialInspectionCondition({kondisi_sistem:"RUSAK_BERAT"})).toBe("RUSAK_BERAT");
  expect(initialInspectionCondition({kondisi_sistem:"BAIK"})).toBe("BAIK");
  expect(initialInspectionCondition({kondisi_sistem:"RUSAK_RINGAN"})).toBe("RUSAK_RINGAN");
  expect(initialInspectionCondition(null)).toBe("BAIK");
 });
});

describe("PR-05-24: hitungan Bahan luring",()=>{
 it("persists a measured zero across restart, retains pending count beyond cache TTL and clears only that account",async()=>{
  const dir=mkdtempSync(join(tmpdir(),"sigm4-stocktake-"));folders.push(dir);const path=join(dir,"bahan.sqlite");let now=1000;const q=new StocktakeQueue(open(path),files,()=>now);await q.initialize();await q.cacheMaterials("1","2",materialSession,[materialItem]);const entry=materialCount();expect(await q.enqueue(entry)).toBe(true);expect(await q.enqueue({...entry,id:randomUUID(),body:{...entry.body,jumlah_fisik:7}})).toBe(false);
  const restart=new StocktakeQueue(open(path),files,()=>now);await restart.initialize();expect((await restart.list("1"))[0]?.body["jumlah_fisik"]).toBe(0);expect((await restart.cached("1","10","2"))?.material_items[0]?.uuid).toBe(materialItem.uuid);expect(await restart.cached("2","10","2")).toBeNull();now+=STOCKTAKE_TTL;await restart.prune();expect(await restart.cached("1","10","2")).toBeNull();expect(await restart.list("1")).toHaveLength(1);await restart.clear("2");expect(await restart.list("1")).toHaveLength(1);await restart.clear("1");expect(await restart.list("1")).toHaveLength(0);
 });
 it("retry uses original count UUID/body; stock conflict stays visible without changing stored basis",async()=>{
  let now=1000;const q=new StocktakeQueue(open(),files,()=>now);await q.initialize();await q.enqueue(materialCount());const entry=(await q.list("1"))[0]!,api=axios.create(),bodies:string[]=[];
  api.defaults.adapter=async config=>{expect(config.url).toBe("/audit-sessions/10/material-counts");expect(config.headers.get("Idempotency-Key")).toBe(entry.id);bodies.push(String(config.data));if(bodies.length===1)throw new Error("Respons terputus");throw new MobileApiError(422,"VALIDATION_ERROR","Ada transaksi baru. Hitung ulang.",[]);};
  const sender=createStocktakeSender(api,q,()=>"1",async()=>true);await q.drain("1",()=>"1",sender);now+=2000;await q.drain("1",()=>"1",sender);expect(bodies).toHaveLength(2);expect(bodies[0]).toBe(bodies[1]);const blocked=(await q.list("1"))[0]!;expect(blocked.blocked).toBe(true);expect(blocked.body["basis"]).toEqual({saldo:10,ledger_id:"11"});
 });
 it("QR selects material within current location and rejects /a/, foreign origin and another room",()=>{
  const origin="https://opname.test",value=`${origin}/b/${materialItem.uuid}`;expect(cachedMaterial(value,origin,[materialItem],"2")).toBe(materialItem);expect(cachedMaterial(value,origin,[materialItem],"3")).toBeNull();for(const qr of [`${origin}/a/${materialItem.uuid}`,`https://evil.test/b/${materialItem.uuid}`])expect(()=>cachedMaterial(qr,origin,[materialItem],"2")).toThrow();
 });
 it("downloads and caches 1000 targets by location through material endpoints, never assets",async()=>{
  const q=new StocktakeQueue(open(),files,()=>1000);await q.initialize();const calls:{url:string;room:unknown}[]=[],api=axios.create();api.defaults.adapter=async config=>{calls.push({url:config.url!,room:config.params?.room_id});const page=Number(config.params?.page??1);return {data:config.url==="/audit-sessions/10"?{success:true,data:materialSession,meta:null}:{success:true,data:Array.from({length:500},(_,n)=>({...materialItem,id:String((page-1)*500+n+1),material_id:String((page-1)*500+n+1)})),meta:{page,per_page:500,total:1000,total_pages:2}},status:200,statusText:"OK",headers:{},config};};
  const loaded=await loadMaterialStocktakeLocation(api,q,"1","10","2",new AbortController().signal);expect(loaded.material_items).toHaveLength(1000);expect(calls).toEqual([{url:"/audit-sessions/10",room:undefined},{url:"/audit-sessions/10/material-items",room:2},{url:"/audit-sessions/10/material-items",room:2}]);expect((await q.cached("1","10","2"))?.material_items).toHaveLength(1000);
 });
});
describe("opname SQLite persisten", () => {
    it("respons scan hilang tidak menggandakan pesanan foto; retry memakai file_id, payload dan UUID yang sama", async () => {
        const q = new StocktakeQueue(open(), files, () => 1000); await q.initialize(); const e = entry(1);
        await q.enqueue({ ...e, photos: [{ id: "p", path: "file:///opname/p.jpg", checksum: "a".repeat(64), size: 100, createdAt: 1000 }] });
        const api = axios.create(); let presigned = 0, scans = 0, uploaded = false; const scanBodies: string[] = [];
        api.defaults.adapter = async config => {
            let data: unknown;
            if (config.url === "/files/presign") { presigned++; data = { data: { file_id: "8", upload_url: "https://storage.test/8" } }; }
            else if (config.url?.endsWith("/scan")) { scans++; scanBodies.push(String(config.data)); expect(config.headers.get("Idempotency-Key")).toBe(e.id); if (scans === 1) throw new Error("Respons scan terputus"); data = { success: true, data: { item_id: "1", duplicate: false, hasil: "DITEMUKAN" }, meta: null }; }
            else if (config.url === "/files/8/presign") data = { data: { file_id: "8", upload_url: "https://storage.test/8" } };
            else { if (!uploaded) throw new MobileApiError(422, "VALIDATION_ERROR", "Belum terunggah", [{ field: "file_id", message: "Belum terunggah" }]); data = {}; }
            return { data, status: 200, statusText: "OK", headers: {}, config };
        };
        const sender = createStocktakeSender(api, q, () => "1", async (_url, path) => { expect(path).toBe("file:///opname/p.jpg"); uploaded = true; return true; }), signal = new AbortController().signal;
        await expect(sender((await q.list("1"))[0]!, signal)).rejects.toThrow("terputus");
        expect((await q.list("1"))[0]!.photos[0]!.fileId).toBe("8"); await sender((await q.list("1"))[0]!, signal);
        expect(presigned).toBe(1); expect(scans).toBe(2); expect(scanBodies[0]).toBe(scanBodies[1]); expect(uploaded).toBe(true);
    });
    it("duplikat server tidak mengunggah foto tambahan dan pergantian akun menghentikan POST scan", async () => {
        const q = new StocktakeQueue(open(), files, () => 1000); await q.initialize(); await q.enqueue(entry(1)); const e = (await q.list("1"))[0]!;
        const api = axios.create(); let requests = 0, puts = 0;
        api.defaults.adapter = async config => { requests++; return { data: { success: true, data: { item_id: "1", duplicate: true, hasil: "DITEMUKAN" }, meta: null }, status: 200, statusText: "OK", headers: {}, config }; };
        const sender = createStocktakeSender(api, q, () => "1", async () => { puts++; return true; }); expect(await sender(e, new AbortController().signal)).toEqual({ duplicate: true }); expect(puts).toBe(0);
        await expect(createStocktakeSender(api, q, () => "2", async () => true)(e, new AbortController().signal)).rejects.toThrow("Sesi akun berubah"); expect(requests).toBe(1);
    });
    it("200 scan bertahan saat database ditutup, duplikat lokal mempertahankan hasil pertama, lalu seluruhnya terkirim", async () => {
        const folder = mkdtempSync(join(tmpdir(), "sigm4-stocktake-")); folders.push(folder); const path = join(folder, "opname.db");
        const q = new StocktakeQueue(open(path), files, () => 1000); await q.initialize();
        for (let i = 1; i <= 200; i++) expect(await q.enqueue(entry(i))).toBe(true);
        expect(await q.enqueue({ ...entry(1), body: { asset_id: 1, room_id: 2, kondisi: "RUSAK_BERAT" } })).toBe(false);
        handles.pop()!.close(); const restored = new StocktakeQueue(open(path), files, () => 1000); await restored.initialize();
        expect(await restored.list("1")).toHaveLength(200); expect(await restored.list("2")).toEqual([]);
        expect((await restored.list("1"))[0]!.body["kondisi"]).toBe("BAIK");
        const sent = new Set<string>(); await restored.drain("1", () => "1", async e => { sent.add(e.id); return { duplicate: false }; });
        expect(sent.size).toBe(200); expect(await restored.list("1")).toEqual([]);
    });
    it("respons hilang memakai UUID yang sama; kesalahan izin diblokir dan pergantian akun tidak menghapus hasil", async () => {
        let now = 1000, account: string | null = "1"; const q = new StocktakeQueue(open(), files, () => now); await q.initialize(); const e = entry(1); await q.enqueue(e);
        await q.drain("1", () => account, async () => { throw new Error("Respons terputus"); }); expect((await q.list("1"))[0]).toMatchObject({ id: e.id, attempts: 1 });
        now += 2000; await q.drain("1", () => account, async result => { expect(result.id).toBe(e.id); account = "2"; return { duplicate: false }; }); expect(await q.list("1")).toHaveLength(1);
        account = "1"; await q.drain("1", () => account, async () => { throw new MobileApiError(403, "FORBIDDEN", "Penugasan dicabut"); }); expect((await q.list("1"))[0]!.blocked).toBe(true);
        await q.clear("2"); expect(await q.list("1")).toHaveLength(1); await q.clear("1"); expect(await q.list("1")).toEqual([]);
    });
    it("metadata foto tersimpan sebelum pengiriman; cache kedaluwarsa tidak membuang hasil yang belum tersinkron", async () => {
        let now = 1000; const removed: string[] = []; const db = open(), q = new StocktakeQueue(db, { remove: async p => { removed.push(p); } }, () => now); await q.initialize();
        const e = entry(1); await q.enqueue({ ...e, photos: [{ id: "p", path: "file:///opname/p.jpg", checksum: "a".repeat(64), size: 100, createdAt: now }] });
        const saved = (await q.list("1"))[0]!; saved.photos[0]!.fileId = "8"; saved.body["foto_file_ids"] = [8]; await q.save(saved);
        expect((await q.list("1"))[0]).toMatchObject({ body: { foto_file_ids: [8] }, photos: [{ fileId: "8" }] });
        await db.runAsync("INSERT INTO stocktake_cache VALUES(?,?,?,?,?)", ["1", "10", "2", "{}", now + STOCKTAKE_TTL]);
        now += STOCKTAKE_TTL; await q.prune(); expect(await q.list("1")).toHaveLength(1); expect(await q.cached("1", "10", "2")).toBeNull(); expect(removed).toEqual([]);
        await q.clear("1"); expect(removed).toEqual(["file:///opname/p.jpg"]);
    });
});
describe("identitas opname luring", () => {
    it("hanya menyimpan izin minimum, cocok dengan token SecureStore, kedaluwarsa tepat 72 jam, dan logout menghapusnya", async () => {
        let now = 1000, revision = 0, refresh = "secret-account-1"; const db = open();
        const vault = { get revision() { return revision; }, read: async () => ({ access_token: "access", refresh_token: refresh }) };
        const store = new OfflineOpnameAuthStore(db, vault, async s => createHash("sha256").update(s).digest("hex"), () => now); await store.initialize();
        const session = { user: { id: "1", nama: "Petugas", email: "private@example.com", role_kode: "R-02", must_change_password: false as const }, permissions: { "audit.view": "all", "audit.execute": "own", "asset.create": "all", "audit.approve": "all" } };
        await store.save(session); expect(await store.read()).toMatchObject({ user: { email: "" }, permissions: { "audit.view": "all", "audit.execute": "own" } }); expect(Object.keys((await store.read())!.permissions)).toHaveLength(2);
        const raw = await db.getAllAsync<{ session: string; tokenHash: string }>("SELECT session,tokenHash FROM offline_opname_auth"); expect(JSON.stringify(raw)).not.toContain("secret-account"); expect(JSON.stringify(raw)).not.toContain("private@example");
        refresh = "secret-account-2"; revision++; expect(await store.read()).toBeNull(); refresh = "secret-account-1"; revision++; now += STOCKTAKE_TTL; expect(await store.read()).toBeNull();
        now = 2000; await store.save(session); await store.clear(); expect(await store.read()).toBeNull();
    });
    it("izin yang dicabut tidak menghasilkan sesi luring dan perubahan revisi selama hashing tidak dapat memulihkannya", async () => {
        let revision = 0; const db = open(), vault = { get revision() { return revision; }, read: async () => ({ access_token: "a", refresh_token: "r" }) };
        const store = new OfflineOpnameAuthStore(db, vault, async () => { revision++; return "hash"; }, () => 1000); await store.initialize();
        const user = { id: "1", nama: "P", email: "", role_kode: "R-02", must_change_password: false as const };
        await store.save({ user, permissions: { "audit.execute": "own" } }); expect(await store.read()).toBeNull(); await store.save({ user, permissions: { "asset.view": "all" } }); expect(await db.getAllAsync("SELECT * FROM offline_opname_auth")).toEqual([]);
    });
});
