import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_AGE_MS, UploadQueue } from "../src/shared/upload/queue.js";
import type { NewUpload, QueueDatabase, SqliteConnection } from "../src/shared/upload/queue.js";

const folders: string[] = [];
const handles: DatabaseSync[] = [];
afterEach(() => {
    handles.splice(0).forEach((db) => db.close());
    folders.splice(0).forEach((path) => {
        if (!path.startsWith(join(tmpdir(), "sigm4-mobile-queue-"))) throw new Error("Direktori uji tidak sesuai.");
        rmSync(path, { recursive: true, force: true });
    });
});
function open(path: string): QueueDatabase {
    const db = new DatabaseSync(path); handles.push(db);
    const adapter: SqliteConnection = {
        execAsync: async (sql) => { db.exec(sql); },
        runAsync: async (sql, params) => db.prepare(sql).run(...params),
        getAllAsync: async <T>(sql: string, params: (string | number | null)[] = []) => db.prepare(sql).all(...params) as T[],
    };
    return { ...adapter, withExclusiveTransactionAsync: async (task) => {
        db.exec("BEGIN IMMEDIATE");
        try { await task(adapter); db.exec("COMMIT"); } catch (error) { db.exec("ROLLBACK"); throw error; }
    } };
}
const entry = (id: string, createdAt = 1000, accountId = "1"): NewUpload => ({ id, accountId, path: `file:///queue/${id}.jpg`, ownerType: "DAMAGE_PHOTO", ownerId: "4", fileId: null, checksum: "a".repeat(64), size: 100, createdAt });

describe("PR-04-16 antrean persisten SQLite", () => {
    it("PR-05-34: foto sebelum respons tiket bertahan saat restart; owner diperbarui hanya untuk akun sendiri", async () => {
        const folder = mkdtempSync(join(tmpdir(), "sigm4-mobile-queue-")); folders.push(folder);
        const path = join(folder, "uploads.db"); const queue = new UploadQueue(open(path), { remove: async () => undefined }, () => 1000, () => undefined);
        await queue.initialize(); await queue.enqueue({ ...entry("before-post"), ownerId: null, fileId: "42" }); handles.pop()?.close();
        const restored = new UploadQueue(open(path), { remove: async () => undefined }, () => 1000, () => undefined); await restored.initialize();
        expect((await restored.list("1"))[0]).toMatchObject({ fileId: "42", ownerId: null }); await restored.setOwner("before-post", "2", "99"); expect((await restored.list("1"))[0]?.ownerId).toBeNull();
        await restored.setOwner("before-post", "1", "9"); expect((await restored.list("1"))[0]?.ownerId).toBe("9");
    });
    it("baris, file_id dan backoff bertahan saat koneksi ditutup lalu dibuka ulang", async () => {
        const folder = mkdtempSync(join(tmpdir(), "sigm4-mobile-queue-")); folders.push(folder);
        const path = join(folder, "uploads.db");
        const queue = new UploadQueue(open(path), { remove: async () => undefined }, () => 1000, () => undefined);
        await queue.initialize(); await queue.enqueue(entry("a"));
        await queue.setFileId("a", "1", "42");
        await queue.drain("1", async () => { throw new Error("Koneksi terputus"); });
        handles.pop()?.close();
        const restored = new UploadQueue(open(path), { remove: async () => undefined }, () => 1000, () => undefined);
        await restored.initialize();
        expect(await restored.list("1")).toMatchObject([{ id: "a", fileId: "42", attempts: 1, nextAttemptAt: 3000 }]);
        expect(Object.keys((await restored.list("1"))[0] ?? {})).not.toContain("uploadUrl");
    });
    it("batas 50 dan 72 jam membuang tertua, menghapus berkas, dan memberitahu pengguna", async () => {
        let now = 1000; const removed: string[] = []; const notices: number[] = [];
        const queue = new UploadQueue(open(":memory:"), { remove: async (path) => { removed.push(path); } }, () => now, (count) => notices.push(count));
        await queue.initialize();
        for (let i = 0; i < 51; i++) await queue.enqueue(entry(String(i), 1000 + i));
        expect(await queue.list("1")).toHaveLength(50);
        expect(removed).toEqual(["file:///queue/0.jpg"]);
        now = 1051 + MAX_AGE_MS; await queue.prune();
        expect(await queue.list("1")).toHaveLength(0);
        expect(removed).toHaveLength(51); expect(notices).toEqual([1, 50]);
    });
    it("pengiriman satu per satu, backoff dan pemisahan pemilik akun", async () => {
        let now = 1000; const sent: string[] = [];
        const queue = new UploadQueue(open(":memory:"), { remove: async () => undefined }, () => now, () => undefined);
        await queue.initialize(); await queue.enqueue(entry("a")); await queue.enqueue(entry("b", 1001, "2"));
        await queue.drain("1", async (item) => { sent.push(item.id); throw new Error("Jaringan"); });
        await queue.drain("1", async (item) => { sent.push(item.id); });
        expect(sent).toEqual(["a"]); expect(await queue.list("2")).toHaveLength(1);
        await queue.cancel("b", "1"); expect(await queue.list("2")).toHaveLength(1);
        now = 3000; await queue.drain("1", async (item) => { sent.push(item.id); });
        expect(sent).toEqual(["a", "a"]); expect(await queue.list("1")).toHaveLength(0);
    });
    it("pengiriman paralel menggunakan satu promise agar berkas tidak dikirim ganda", async () => {
        const queue = new UploadQueue(open(":memory:"), { remove: async () => undefined }, () => 1000, () => undefined);
        await queue.initialize(); await queue.enqueue(entry("a"));
        let sent = 0;
        const send = async () => { sent++; };
        const first = queue.drain("1", send); const second = queue.drain("1", send);
        expect(first).toBe(second); await first; expect(sent).toBe(1);
    });
    it("pembatalan milik akun yang benar menghentikan pengiriman aktif", async () => {
        const queue = new UploadQueue(open(":memory:"), { remove: async () => undefined }, () => 1000, () => undefined);
        await queue.initialize(); await queue.enqueue(entry("a"));
        let ready!: () => void;
        const started = new Promise<void>((resolve) => { ready = resolve; });
        let signal!: AbortSignal;
        const drain = queue.drain("1", async (_entry, abort) => {
            signal = abort; ready();
            await new Promise<void>((_resolve, reject) => abort.addEventListener("abort", () => reject(new Error("Dibatalkan"))));
        });
        await started; await queue.cancel("a", "2"); expect(signal.aborted).toBe(false);
        await queue.cancel("a", "1"); await drain;
        expect(signal.aborted).toBe(true); expect(await queue.list("1")).toHaveLength(0);
    });
});
