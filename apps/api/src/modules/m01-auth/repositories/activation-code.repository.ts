// Repository kode aktivasi 2FA (BR-070d, SDD-SESS-17, SDD-AUTH-05). Semua metode menerima `AuthContext` sebagai
// PELAKU; akun yang dituju adalah `userId` eksplisit — pemilik sendiri pada `enroll`, akun target pada
// penerbitan/reset Administrator (scope `all` ditegakkan `authorize('user.reset_2fa')` di routenya).
//
// PRIVAT terhadap modul (SDD-SYS-03).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export type MetodeVerifikasi = "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS";

export interface KodeAktivasiRow {
    readonly id: string;
    readonly code_hash: string;
    readonly expires_at: Date;
    readonly failed_attempts: number;
    readonly verified_at: Date | null;
}

export interface KodeAktivasiBaru {
    readonly codeHash: string;
    /** Pelaku penerbit; `null` bila CLI (`SYSTEM:CLI`, `PR-02-08`). */
    readonly diterbitkanOleh: number | null;
    readonly metode: MetodeVerifikasi | null;
    readonly diterbitkanPada: Date;
    readonly kedaluwarsaPada: Date;
}

export class ActivationCodeRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Baris AKTIF (belum dihabiskan) akun itu, dikunci: pencocokan serentak diserialkan agar penghitung tak bocor. */
    async kunciAktif(ctx: AuthContext, userId: string): Promise<KodeAktivasiRow | undefined> {
        return this.query(ctx)
            .selectFrom("totp_activation_codes")
            .select(["id", "code_hash", "expires_at", "failed_attempts", "verified_at"])
            .where("user_id", "=", userId)
            .where("consumed_at", "is", null)
            .forUpdate()
            .executeTakeFirst();
    }

    /** Penerbitan baru MENGGANTIKAN yang lama (satu baris aktif per akun, indeks unik parsial `0025`). */
    async ganti(ctx: AuthContext, userId: string, data: KodeAktivasiBaru): Promise<void> {
        const q = this.query(ctx);
        await q.deleteFrom("totp_activation_codes").where("user_id", "=", userId).where("consumed_at", "is", null).execute();
        await q
            .insertInto("totp_activation_codes")
            .values({
                user_id: userId,
                code_hash: data.codeHash,
                issued_by: data.diterbitkanOleh,
                metode_verifikasi: data.metode,
                issued_at: data.diterbitkanPada,
                expires_at: data.kedaluwarsaPada,
            })
            .execute();
    }

    /** Menambah satu kesalahan; mengembalikan jumlahnya SESUDAH ditambah. */
    async tambahGagal(ctx: AuthContext, id: string): Promise<number> {
        const baris = await this.query(ctx)
            .updateTable("totp_activation_codes")
            .set((eb) => ({ failed_attempts: eb("failed_attempts", "+", 1) }))
            .where("id", "=", id)
            .returning("failed_attempts")
            .executeTakeFirstOrThrow();
        return baris.failed_attempts;
    }

    async tandaiTerverifikasi(ctx: AuthContext, id: string, waktu: Date): Promise<void> {
        await this.query(ctx).updateTable("totp_activation_codes").set({ verified_at: waktu }).where("id", "=", id).execute();
    }

    async habiskan(ctx: AuthContext, id: string, waktu: Date): Promise<void> {
        await this.query(ctx).updateTable("totp_activation_codes").set({ consumed_at: waktu }).where("id", "=", id).execute();
    }

    /** Menghapus kode aktif akun itu (reset 2FA: kode lama tak berlaku lagi sebelum yang baru terbit). */
    async hapusAktif(ctx: AuthContext, userId: string): Promise<void> {
        await this.query(ctx).deleteFrom("totp_activation_codes").where("user_id", "=", userId).where("consumed_at", "is", null).execute();
    }
}

/** Pintu masuk repository: `defineRepository` menolak metode yang tidak menerima `AuthContext` (SDD-AUTH-02). */
export function createActivationCodeRepository(executor: QueryExecutor): ActivationCodeRepository {
    return defineRepository(new ActivationCodeRepository(executor));
}
