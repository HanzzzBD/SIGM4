// Repository pendaftaran & pengelolaan 2FA sendiri (FR-01.5, SDD-AUTH-05). Semua metode terbatas
// pada baris milik pemanggil (`ctx.userId`) — scope `own`, tidak menerima id lain. Verifikasi
// faktor kedua saat LOGIN ada di `AuthRepository`: ia berjalan sebelum `AuthContext` ada.
//
// PRIVAT terhadap modul (SDD-SYS-03).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

/** Keadaan 2FA pemanggil, dibaca dengan kunci baris. */
export interface DuaFaktorRow {
    readonly email: string;
    readonly wajib_ganti: boolean;
    readonly totp_secret_enc: Buffer | null;
    readonly totp_enabled_at: Date | null;
}

export class TwoFactorRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Mengunci baris pemanggil: pendaftaran/konfirmasi serentak diserialkan. */
    async kunciUser(ctx: AuthContext): Promise<DuaFaktorRow | undefined> {
        return this.query(ctx)
            .selectFrom("users")
            .select(["email", "must_change_password as wajib_ganti", "totp_secret_enc", "totp_enabled_at"])
            .where("id", "=", String(ctx.userId))
            .forUpdate()
            .executeTakeFirst();
    }

    /** Pendaftaran baru (atau diulang): secret tersimpan tetapi 2FA BELUM berlaku sampai dikonfirmasi. */
    async simpanSecretTertunda(ctx: AuthContext, secretEnc: Buffer): Promise<void> {
        await this.query(ctx)
            .updateTable("users")
            .set({ totp_secret_enc: secretEnc, totp_enabled_at: null, totp_last_step: null })
            .where("id", "=", String(ctx.userId))
            .execute();
    }

    /** FR-01.5 langkah 4: 2FA berlaku; langkah kode konfirmasi langsung dianggap terpakai. */
    async aktifkan(ctx: AuthContext, waktu: Date, langkah: number): Promise<void> {
        await this.query(ctx)
            .updateTable("users")
            .set({ totp_enabled_at: waktu, totp_last_step: langkah })
            .where("id", "=", String(ctx.userId))
            .execute();
    }

    /** Mengganti SELURUH kode cadangan (yang lama, terpakai atau tidak, tak berlaku lagi — BR-070c). */
    async gantiKodeCadangan(ctx: AuthContext, hashKode: readonly string[]): Promise<void> {
        const q = this.query(ctx);
        await q.deleteFrom("totp_backup_codes").where("user_id", "=", String(ctx.userId)).execute();
        await q
            .insertInto("totp_backup_codes")
            .values(hashKode.map((code_hash) => ({ user_id: ctx.userId, code_hash })))
            .execute();
    }

    /** Sesi pemanggil kini membawa faktor kedua; refresh berikutnya menerbitkan `amr` yang memuat `otp`. */
    async tandaiSesiTerverifikasi(ctx: AuthContext, familyId: string): Promise<void> {
        await this.query(ctx)
            .updateTable("refresh_tokens")
            .set({ otp_verified: true })
            .where("family_id", "=", familyId)
            .where("user_id", "=", String(ctx.userId))
            .where("revoked_at", "is", null)
            .execute();
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createTwoFactorRepository(executor: QueryExecutor): TwoFactorRepository {
    return defineRepository(new TwoFactorRepository(executor));
}
