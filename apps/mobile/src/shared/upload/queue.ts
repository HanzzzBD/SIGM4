/** Antrean berkas saja; transaksi bisnis tidak pernah disimpan (MOB-OFF-02/05, MOB-SEC-06). */
export const MAX_FILES = 50;
export const MAX_AGE_MS = 72 * 60 * 60 * 1000;
export interface UploadEntry {
    id: string;
    accountId: string;
    path: string;
    ownerType: string;
    ownerId: string | null;
    fileId: string | null;
    checksum: string;
    size: number;
    createdAt: number;
    attempts: number;
    nextAttemptAt: number;
}
export type NewUpload = Omit<UploadEntry, "attempts" | "nextAttemptAt">;
export interface SqliteConnection {
    execAsync(sql: string): Promise<void>;
    runAsync(sql: string, params: (string | number | null)[]): Promise<unknown>;
    getAllAsync<T>(sql: string, params?: (string | number | null)[]): Promise<T[]>;
}
export interface QueueDatabase extends SqliteConnection {
    withExclusiveTransactionAsync(task: (transaction: SqliteConnection) => Promise<void>): Promise<void>;
}
export interface QueueFiles { remove(path: string): Promise<void> }

export class UploadQueue {
    private writePromise: Promise<void> = Promise.resolve();
    private drainPromise: Promise<void> | null = null;
    private readonly active = new Map<string, AbortController>();
    constructor(private readonly db: QueueDatabase, private readonly files: QueueFiles, private readonly now: () => number, private readonly notifyDiscarded: (count: number) => void) {}

    private write(task: (transaction: SqliteConnection) => Promise<void>): Promise<void> {
        const operation = this.writePromise.then(() => this.db.withExclusiveTransactionAsync(task));
        this.writePromise = operation.catch(() => undefined);
        return operation;
    }

    async initialize(): Promise<void> {
        await this.db.execAsync(`PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS uploads (
                id TEXT PRIMARY KEY, accountId TEXT NOT NULL, path TEXT NOT NULL,
                ownerType TEXT NOT NULL, ownerId TEXT, fileId TEXT, checksum TEXT NOT NULL,
                size INTEGER NOT NULL, createdAt INTEGER NOT NULL, attempts INTEGER NOT NULL,
                nextAttemptAt INTEGER NOT NULL
            );`);
        await this.prune();
    }

    async enqueue(entry: NewUpload): Promise<void> {
        if (entry.size <= 0 || entry.size > 500 * 1024 || !/^[0-9a-f]{64}$/.test(entry.checksum)) {
            throw new Error("Foto antrean harus terkompresi maksimal 500 KB dan memiliki checksum.");
        }
        const now = this.now();
        await this.write(async (tx) => {
            await tx.runAsync("INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)", [entry.id, entry.accountId, entry.path, entry.ownerType, entry.ownerId, entry.fileId, entry.checksum, entry.size, entry.createdAt, now]);
        });
        await this.prune();
    }

    list(accountId: string): Promise<UploadEntry[]> {
        return this.db.getAllAsync<UploadEntry>("SELECT * FROM uploads WHERE accountId = ? ORDER BY createdAt, id", [accountId]);
    }

    async setFileId(id: string, accountId: string, fileId: string): Promise<void> {
        await this.write(async (tx) => {
            await tx.runAsync("UPDATE uploads SET fileId = ? WHERE id = ? AND accountId = ?", [fileId, id, accountId]);
        });
    }

    async cancel(id: string, accountId: string): Promise<void> {
        this.active.get(`${accountId}:${id}`)?.abort();
        let removed: UploadEntry[] = [];
        await this.write(async (tx) => {
            removed = await tx.getAllAsync<UploadEntry>("SELECT * FROM uploads WHERE id = ? AND accountId = ?", [id, accountId]);
            await tx.runAsync("DELETE FROM uploads WHERE id = ? AND accountId = ?", [id, accountId]);
        });
        await Promise.all(removed.map((item) => this.files.remove(item.path)));
    }

    async prune(): Promise<void> {
        let removed: UploadEntry[] = [];
        const cutoff = this.now() - MAX_AGE_MS;
        await this.write(async (tx) => {
            const entries = await tx.getAllAsync<UploadEntry>("SELECT * FROM uploads ORDER BY createdAt, id");
            const valid = entries.filter((entry) => entry.createdAt > cutoff);
            const overflow = Math.max(0, valid.length - MAX_FILES);
            const discarded = new Set(valid.slice(0, overflow).map((entry) => entry.id));
            removed = entries.filter((entry) => entry.createdAt <= cutoff || discarded.has(entry.id));
            for (const entry of removed) await tx.runAsync("DELETE FROM uploads WHERE id = ?", [entry.id]);
        });
        if (removed.length) {
            removed.forEach((entry) => this.active.get(`${entry.accountId}:${entry.id}`)?.abort());
            this.notifyDiscarded(removed.length);
            await Promise.all(removed.map((entry) => this.files.remove(entry.path)));
        }
    }

    /** Satu pengiriman antrean; URL presign dan token tidak masuk SQLite (SDD-MOB-04). */
    drain(accountId: string, send: (entry: UploadEntry, signal: AbortSignal) => Promise<void>): Promise<void> {
        if (this.drainPromise) return this.drainPromise;
        this.drainPromise = this.performDrain(accountId, send).finally(() => { this.drainPromise = null; });
        return this.drainPromise;
    }

    private async performDrain(accountId: string, send: (entry: UploadEntry, signal: AbortSignal) => Promise<void>): Promise<void> {
        await this.prune();
        for (const entry of await this.list(accountId)) {
            if (entry.nextAttemptAt > this.now()) continue;
            const controller = new AbortController();
            const key = `${accountId}:${entry.id}`;
            this.active.set(key, controller);
            try {
                await send(entry, controller.signal);
                await this.cancel(entry.id, accountId);
            } catch {
                // MOB-OFF-03: percobaan tanpa batas, tetap dibatasi retensi 72 jam.
                const attempts = entry.attempts + 1;
                const retryAt = this.now() + Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 12));
                await this.write(async (tx) => {
                    await tx.runAsync("UPDATE uploads SET attempts = ?, nextAttemptAt = ? WHERE id = ? AND accountId = ?", [attempts, retryAt, entry.id, accountId]);
                });
            } finally {
                this.active.delete(key);
            }
        }
    }
}
