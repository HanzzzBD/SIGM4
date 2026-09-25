// Repository CLI break-glass (FR-01.6, BR-070b) dan kode aktivasi 2FA darurat (FR-01.5 A6,
// BR-070d), dijalankan operator server berakses shell (SDD-SESS-11, PR-02-08).
//
// PENGECUALIAN SDD-AUTH-02: metodenya TIDAK menerima `AuthContext` — pelaksananya bukan
// pengguna sistem, melainkan operator dengan akses shell (FR-01.6 AC "hanya dapat dijalankan
// dari server, tidak pernah melalui antarmuka web maupun API"); tidak ada sesi HTTP yang dapat
// menghasilkan satu. Pola yang sama dengan `AuthRepository` (autentikasi pra-`AuthContext`):
// tidak memakai `BaseRepository`/`defineRepository`, dan hanya dipanggil `BreakGlassService` —
// tidak diekspor dari `index.ts` modul.

import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../../shared/db/index.js";

type Eksekutor = Kysely<Database> | Transaction<Database>;

export interface AdminTargetRow {
    readonly id: string;
    readonly nama: string;
    readonly email: string;
    readonly nip_nis: string;
    readonly status: "AKTIF" | "NONAKTIF";
    readonly role_kode: string;
    readonly totp_enabled_at: Date | null;
}

export interface SesiDicabutSistem {
    readonly userId: string;
    readonly familyId: string;
    readonly platform: "WEB" | "ANDROID" | "IOS";
}

export class CliRepository {
    constructor(private readonly db: Eksekutor) {}

    /** Email dicocokkan tanpa memandang huruf besar-kecil (indeks unik `lower(email)`, 0012), baris dikunci. */
    async kunciUserByEmail(email: string): Promise<AdminTargetRow | undefined> {
        return this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.nama", "u.email", "u.nip_nis", "u.status", "r.kode as role_kode", "u.totp_enabled_at"])
            .where(sql<boolean>`lower(u.email) = lower(${email})`)
            .forUpdate("u")
            .executeTakeFirst();
    }

    /**
     * FR-01.6 AC: ada Administrator LAIN yang masih AKTIF dan login dalam 24 jam terakhir —
     * bila ya, break-glass ditolak kecuali `--force` (`A1`: pemulihan biasa lewat reset 2FA).
     */
    async adaAdminLainAktifBaruLogin(kecualiUserId: string, sejak: Date): Promise<boolean> {
        const baris = await this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select("u.id")
            .where("r.kode", "=", "R-01")
            .where("u.status", "=", "AKTIF")
            .where("u.id", "<>", kecualiUserId)
            .where("u.login_terakhir_pada", ">=", sejak)
            .limit(1)
            .executeTakeFirst();
        return baris !== undefined;
    }

    /** FR-01.6 langkah 2: nonaktifkan 2FA target. */
    async lepasDuaFaktor(userId: string): Promise<void> {
        await this.db
            .updateTable("users")
            .set({ totp_secret_enc: null, totp_enabled_at: null, totp_last_step: null })
            .where("id", "=", userId)
            .execute();
    }

    async hapusKodeCadangan(userId: string): Promise<void> {
        await this.db.deleteFrom("totp_backup_codes").where("user_id", "=", userId).execute();
    }

    /** Kode aktif sebelumnya (bila ada) tak berlaku lagi sebelum yang baru menggantikannya. */
    async hapusKodeAktivasiAktif(userId: string): Promise<void> {
        await this.db.deleteFrom("totp_activation_codes").where("user_id", "=", userId).where("consumed_at", "is", null).execute();
    }

    /** FR-01.6 langkah 3: password sementara + wajib ganti. */
    async simpanPasswordSementara(userId: string, hash: string): Promise<void> {
        await this.db.updateTable("users").set({ password_hash: hash, must_change_password: true }).where("id", "=", userId).execute();
    }

    /**
     * Kode aktivasi 2FA diterbitkan CLI: `issued_by`/`metode_verifikasi` NULL (`0025` CHECK
     * `totp_activation_metode_penerbit` mengizinkannya) — pembeda dari penerbitan Administrator
     * lewat HTTP, yang keduanya wajib terisi. `hapusKodeAktivasiAktif` dipanggil pemanggil
     * lebih dulu bila menggantikan kode lama (indeks unik parsial `0025`: satu baris aktif/akun).
     */
    async simpanKodeAktivasi(userId: string, hash: string, diterbitkanPada: Date, kedaluwarsaPada: Date): Promise<void> {
        await this.db
            .insertInto("totp_activation_codes")
            .values({
                user_id: userId,
                code_hash: hash,
                issued_by: null,
                metode_verifikasi: null,
                issued_at: diterbitkanPada,
                expires_at: kedaluwarsaPada,
            })
            .execute();
    }

    /**
     * FR-01.6 langkah 4: cabut SELURUH refresh token DI SISTEM (bukan hanya milik target) —
     * satu-satunya operasi sesi yang benar-benar lintas-pengguna di seluruh basis kode.
     * Satu baris per KELUARGA (bukan per token) yang benar-benar tercabut, untuk event per sesi.
     */
    async cabutSeluruhRefreshTokenSistem(waktu: Date, alasan: string): Promise<readonly SesiDicabutSistem[]> {
        const baris = await this.db
            .updateTable("refresh_tokens")
            .set({ revoked_at: waktu, revoke_reason: alasan })
            .where("revoked_at", "is", null)
            .returning(["user_id", "family_id", "platform"])
            .execute();
        const perKeluarga = new Map<string, SesiDicabutSistem>();
        for (const b of baris) {
            perKeluarga.set(b.family_id, { userId: b.user_id, familyId: b.family_id, platform: b.platform });
        }
        return [...perKeluarga.values()];
    }
}

/** Pintu masuk: hanya dipanggil `BreakGlassService`, tidak pernah diekspor `index.ts` modul. */
export function createCliRepository(executor: Eksekutor): CliRepository {
    return new CliRepository(executor);
}
