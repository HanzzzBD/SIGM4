import { z } from "zod";
import type { SqliteConnection } from "./upload/queue";
import type { TokenVault } from "./secure/vault";
export const OfflineOpnameSessionSchema = z.object({ user: z.object({ id: z.string(), nama: z.string(), email: z.string(), role_kode: z.string(), must_change_password: z.literal(false) }), permissions: z.record(z.string(), z.string()) });
export class OfflineOpnameAuthStore {
    constructor(private readonly db: SqliteConnection, private readonly vault: Pick<TokenVault, "read" | "revision">, private readonly hash: (s: string) => Promise<string>, private readonly now: () => number) {}
    async initialize() { await this.db.execAsync("CREATE TABLE IF NOT EXISTS offline_opname_auth(accountId TEXT PRIMARY KEY,tokenHash TEXT NOT NULL,session TEXT NOT NULL,verifiedAt INTEGER NOT NULL)"); }
    async save(value: z.infer<typeof OfflineOpnameSessionSchema>) {
        const session = OfflineOpnameSessionSchema.parse(value);
        if (!Object.hasOwn(session.permissions, "audit.execute")) return;
        const revision = this.vault.revision, tokens = await this.vault.read(); if (!tokens) return;
        const tokenHash = await this.hash(tokens.refresh_token);
        if (this.vault.revision !== revision) return;
        const permissions = Object.fromEntries(Object.entries(session.permissions).filter(([p]) => ["audit.view", "audit.execute"].includes(p)));
        await this.db.runAsync("INSERT INTO offline_opname_auth VALUES(?,?,?,?) ON CONFLICT(accountId) DO UPDATE SET tokenHash=excluded.tokenHash,session=excluded.session,verifiedAt=excluded.verifiedAt", [session.user.id, tokenHash, JSON.stringify({ user: { ...session.user, email: "" }, permissions }), this.now()]);
        if (this.vault.revision !== revision) await this.db.runAsync("DELETE FROM offline_opname_auth WHERE tokenHash=?", [tokenHash]);
    }
    async read() {
        const revision = this.vault.revision, tokens = await this.vault.read(); if (!tokens) return null;
        await this.db.runAsync("DELETE FROM offline_opname_auth WHERE verifiedAt<=?", [this.now() - 72 * 3600000]);
        const rows = await this.db.getAllAsync<{ session: string }>("SELECT session FROM offline_opname_auth WHERE tokenHash=? AND verifiedAt>?", [await this.hash(tokens.refresh_token), this.now() - 72 * 3600000]);
        if (this.vault.revision !== revision || !rows[0]) return null;
        const session = OfflineOpnameSessionSchema.parse(JSON.parse(rows[0].session));
        return Object.hasOwn(session.permissions, "audit.execute") ? { ...session, permissions: Object.fromEntries(Object.entries(session.permissions).filter(([p]) => ["audit.view", "audit.execute"].includes(p))) } : null;
    }
    async clear(account?: string) { if (account) await this.db.runAsync("DELETE FROM offline_opname_auth WHERE accountId=?", [account]); else await this.db.execAsync("DELETE FROM offline_opname_auth"); }
}
