/** Satu penulis token; adapter native memakai Keychain/Keystore (SDD-MOB-08). */
import { z } from "zod";

export const TokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) });
export type Tokens = z.infer<typeof TokensSchema>;
export interface SecretStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
}
const KEY = "sigm4.tokens.v1";
export class TokenVault {
    private pending: Promise<void> = Promise.resolve();
    private generation = 0;
    constructor(private readonly storage: SecretStorage) {}
    get revision() { return this.generation; }
    async read(): Promise<Tokens | null> {
        await this.pending;
        const value = await this.storage.get(KEY);
        if (!value) return null;
        try {
            const parsed = TokensSchema.safeParse(JSON.parse(value) as unknown);
            if (parsed.success) return parsed.data;
        } catch { /* Rekaman rusak dihapus, bukan dipakai sebagai sesi. */ }
        await this.clear(); return null;
    }
    async save(tokens: Tokens, expected = this.generation): Promise<boolean> {
        const checked = TokensSchema.parse(tokens);
        let saved = false;
        const task = this.pending.then(async () => {
            if (expected !== this.generation) return;
            await this.storage.set(KEY, JSON.stringify(checked)); saved = true;
        });
        this.pending = task.catch(() => undefined); await task; return saved;
    }
    async clear(): Promise<void> {
        this.generation++;
        const task = this.pending.then(() => this.storage.remove(KEY));
        this.pending = task.catch(() => undefined); await task;
    }
}
