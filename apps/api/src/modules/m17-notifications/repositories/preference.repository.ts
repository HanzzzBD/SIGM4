// Repository preferensi notifikasi (FR-17.3, SDD-NTF-06, SDD-08 §4.5; SDD-AUTH-02). PRIVAT.
// Ketiadaan baris = kanal aktif — pengguna baru menerima segalanya tanpa seed.

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { KelompokNotifikasi, QueryExecutor } from "../../../shared/db/index.js";

export interface Preferensi {
    readonly jenis: KelompokNotifikasi;
    readonly inApp: boolean;
    readonly push: boolean;
}

export class PreferenceRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Baris tersimpan milik pemanggil (scope pemilik, SDD-NTF-10). */
    async milik(ctx: AuthContext): Promise<readonly Preferensi[]> {
        const baris = await this.query(ctx).selectFrom("notification_preferences").select(["jenis", "in_app", "push"]).where("user_id", "=", String(ctx.userId)).execute();
        return baris.map((b) => ({ jenis: b.jenis, inApp: b.in_app, push: b.push }));
    }

    async simpan(ctx: AuthContext, daftar: readonly Preferensi[]): Promise<void> {
        await this.query(ctx)
            .insertInto("notification_preferences")
            .values(daftar.map((p) => ({ user_id: ctx.userId, jenis: p.jenis, in_app: p.inApp, push: p.push })))
            .onConflict((oc) => oc.columns(["user_id", "jenis"]).doUpdateSet((eb) => ({ in_app: eb.ref("excluded.in_app"), push: eb.ref("excluded.push") })))
            .execute();
    }

    /** SDD-NTF-06 (keputusan 81a): penerima yang MEMATIKAN in-app kelompok ini — dilewati saat terbit. */
    async inAppDimatikan(ctx: AuthContext, userIds: readonly number[], jenis: KelompokNotifikasi): Promise<ReadonlySet<number>> {
        if (userIds.length === 0) return new Set();
        const baris = await this.query(ctx)
            .selectFrom("notification_preferences")
            .select("user_id")
            .where("jenis", "=", jenis)
            .where("in_app", "=", false)
            .where("user_id", "in", userIds.map(String))
            .execute();
        return new Set(baris.map((b) => Number(b.user_id)));
    }

    /** SDD-NTF-06 (keputusan 81b): diperiksa job push saat kirim. */
    async pushDimatikan(ctx: AuthContext, userId: number, jenis: KelompokNotifikasi): Promise<boolean> {
        const b = await this.query(ctx)
            .selectFrom("notification_preferences")
            .select("push")
            .where("user_id", "=", String(userId))
            .where("jenis", "=", jenis)
            .executeTakeFirst();
        return b !== undefined && !b.push;
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createPreferenceRepository(executor: QueryExecutor): PreferenceRepository {
    return defineRepository(new PreferenceRepository(executor));
}
