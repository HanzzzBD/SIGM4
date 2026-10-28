// Repository pengelolaan 2FA pengguna LAIN oleh Administrator (FR-01.5 A3/A7, SDD-AUTH-05). Berbeda dari
// `TwoFactorRepository` (scope `own`), metode di sini menerima `userId` sasaran; hak atasnya ditegakkan
// `authorize('user.reset_2fa')` pada route M-02 (scope `all`), dan larangan akun sendiri pada service.
//
// PRIVAT terhadap modul (SDD-SYS-03).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface SasaranDuaFaktor {
    readonly id: string;
    readonly status: "AKTIF" | "NONAKTIF";
    readonly role_kode: string;
    readonly totp_enabled_at: Date | null;
}

export class AdminDuaFaktorRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Mengunci baris sasaran: penerbitan/reset serentak atas satu akun diserialkan. */
    async kunciSasaran(ctx: AuthContext, userId: string): Promise<SasaranDuaFaktor | undefined> {
        return this.query(ctx)
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.status", "r.kode as role_kode", "u.totp_enabled_at"])
            .where("u.id", "=", userId)
            .forUpdate("u")
            .executeTakeFirst();
    }

    /** FR-01.5 A3: 2FA dilepas seluruhnya — secret (termasuk yang tertunda), penanda aktif, dan langkah terakhir. */
    async lepasDuaFaktor(ctx: AuthContext, userId: string): Promise<void> {
        await this.query(ctx)
            .updateTable("users")
            .set({ totp_secret_enc: null, totp_enabled_at: null, totp_last_step: null })
            .where("id", "=", userId)
            .execute();
    }

    async hapusKodeCadangan(ctx: AuthContext, userId: string): Promise<void> {
        await this.query(ctx).deleteFrom("totp_backup_codes").where("user_id", "=", userId).execute();
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createAdminDuaFaktorRepository(executor: QueryExecutor): AdminDuaFaktorRepository {
    return defineRepository(new AdminDuaFaktorRepository(executor));
}
