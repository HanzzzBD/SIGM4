// Repository token perangkat FCM (FR-17.2, MOB-SEC-05, SDD-08 §4.4a; SDD-AUTH-02).
// PRIVAT terhadap modul. Isi `token` = Firebase Installation ID (keputusan 80e).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface TokenPerangkat {
    readonly token: string;
    readonly platform: "ANDROID" | "IOS";
    readonly terakhir_aktif: Date;
}

export class DeviceTokenRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /**
     * FR-17.2 langkah 1. Token unik: didaftar ulang (sesi/pengguna lain di perangkat yang sama)
     * → dipindah ke pemanggil & keluarga sesinya — satu perangkat, satu penerima.
     */
    async daftarkan(ctx: AuthContext, token: string, platform: "ANDROID" | "IOS", familyId: string, pada: Date): Promise<TokenPerangkat> {
        return this.query(ctx)
            .insertInto("device_tokens")
            .values({ user_id: ctx.userId, token, platform, family_id: familyId, terakhir_aktif: pada, created_at: pada })
            .onConflict((oc) =>
                oc.column("token").doUpdateSet({ user_id: ctx.userId, platform, family_id: familyId, terakhir_aktif: pada }),
            )
            .returning(["token", "platform", "terakhir_aktif"])
            .executeTakeFirstOrThrow();
    }

    /** Hanya token milik pemanggil; `false` bila tidak ada (atau milik orang lain). */
    async cabut(ctx: AuthContext, token: string): Promise<boolean> {
        const r = await this.query(ctx).deleteFrom("device_tokens").where("token", "=", token).where("user_id", "=", String(ctx.userId)).executeTakeFirst();
        return r.numDeletedRows === 1n;
    }

    /** MOB-SEC-05: sesi dicabut (logout, cabut perangkat, reset) → tokennya ikut dicabut. */
    async cabutKeluarga(ctx: AuthContext, familyId: string): Promise<number> {
        const r = await this.query(ctx).deleteFrom("device_tokens").where("family_id", "=", familyId).executeTakeFirst();
        return Number(r.numDeletedRows);
    }

    /** FR-17.2 A4: seluruh perangkat aktif pengguna sasaran. */
    async milikPengguna(ctx: AuthContext, userId: number): Promise<readonly string[]> {
        const baris = await this.query(ctx).selectFrom("device_tokens").select("token").where("user_id", "=", String(userId)).orderBy("id").execute();
        return baris.map((b) => b.token);
    }

    /** FR-17.2 A2: token tak valid/kedaluwarsa dihapus. */
    async hapus(ctx: AuthContext, tokens: readonly string[]): Promise<number> {
        if (tokens.length === 0) return 0;
        const r = await this.query(ctx).deleteFrom("device_tokens").where("token", "in", [...tokens]).executeTakeFirst();
        return Number(r.numDeletedRows);
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDeviceTokenRepository(executor: QueryExecutor): DeviceTokenRepository {
    return defineRepository(new DeviceTokenRepository(executor));
}
