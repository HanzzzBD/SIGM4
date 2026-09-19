// Repository autentikasi (SDD-04). PENGECUALIAN SDD-AUTH-02: metodenya TIDAK menerima
// `AuthContext` — autentikasi berjalan SEBELUM ada `AuthContext` (yang justru
// dihasilkannya), sama seperti `PermissionCache`. Karena itu ia tidak memakai
// `BaseRepository`/`defineRepository` dan hanya dipanggil `AuthService`; tidak diekspor
// dari `index.ts` modul. Setiap kueri menyaring pada kunci yang pasti (email, hash token),
// tidak pernah mengembalikan daftar.

import { sql } from "kysely";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "../../../shared/db/index.js";

type Eksekutor = Kysely<Database> | Transaction<Database>;

export interface UserLogin {
    readonly id: string;
    readonly password_hash: string;
    readonly status: "AKTIF" | "NONAKTIF";
    /** `users.must_change_password` (FR-01.1 A4), dialiaskan agar penanda ini tidak tampak sebagai data sensitif pada jalur token. */
    readonly wajib_ganti: boolean;
    readonly role_kode: string;
}

export interface RefreshRow {
    readonly id: string;
    readonly user_id: string;
    readonly family_id: string;
    readonly platform: "WEB" | "ANDROID" | "IOS";
    readonly expires_at: Date;
    readonly rotated_at: Date | null;
    readonly revoked_at: Date | null;
}

export interface RefreshBaru {
    readonly userId: string;
    readonly familyId: string;
    readonly parentId: string | null;
    readonly tokenHash: Buffer;
    readonly platform: "WEB" | "ANDROID" | "IOS";
    readonly ip: string | null;
    readonly userAgent: string | null;
    readonly issuedAt: Date;
    readonly expiresAt: Date;
}

export class AuthRepository {
    constructor(private readonly db: Eksekutor) {}

    /** Email dicocokkan tanpa memandang huruf besar-kecil (indeks unik `lower(email)`, 0012). */
    async cariUserByEmail(email: string): Promise<UserLogin | undefined> {
        return this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.password_hash", "u.status", "u.must_change_password as wajib_ganti", "r.kode as role_kode"])
            .where(sql<boolean>`lower(u.email) = lower(${email})`)
            .executeTakeFirst();
    }

    async cariUserById(id: string): Promise<UserLogin | undefined> {
        return this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.password_hash", "u.status", "u.must_change_password as wajib_ganti", "r.kode as role_kode"])
            .where("u.id", "=", id)
            .executeTakeFirst();
    }

    async sisipRefresh(data: RefreshBaru): Promise<string> {
        const baris = await this.db
            .insertInto("refresh_tokens")
            .values({
                user_id: data.userId,
                family_id: data.familyId,
                parent_id: data.parentId,
                token_hash: data.tokenHash,
                platform: data.platform,
                ip: data.ip,
                user_agent: data.userAgent,
                issued_at: data.issuedAt,
                expires_at: data.expiresAt,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        return baris.id;
    }

    /** Mengunci barisnya: dua refresh bersamaan atas token yang sama diserialkan (SDD-04 §4.3). */
    async cariRefreshUntukUbah(tokenHash: Buffer): Promise<RefreshRow | undefined> {
        return this.db
            .selectFrom("refresh_tokens")
            .select(["id", "user_id", "family_id", "platform", "expires_at", "rotated_at", "revoked_at"])
            .where("token_hash", "=", tokenHash)
            .forUpdate()
            .executeTakeFirst();
    }

    async tandaiDirotasi(id: string, waktu: Date): Promise<void> {
        await this.db.updateTable("refresh_tokens").set({ rotated_at: waktu }).where("id", "=", id).execute();
    }

    /** Mencabut SELURUH keluarga yang belum dicabut; mengembalikan jumlah token yang dicabut. */
    async cabutKeluarga(familyId: string, waktu: Date, alasan: string): Promise<number> {
        const hasil = await this.db
            .updateTable("refresh_tokens")
            .set({ revoked_at: waktu, revoke_reason: alasan })
            .where("family_id", "=", familyId)
            .where("revoked_at", "is", null)
            .executeTakeFirst();
        return Number(hasil.numUpdatedRows);
    }

    async catatLoginTerakhir(userId: string, waktu: Date): Promise<void> {
        await this.db.updateTable("users").set({ login_terakhir_pada: waktu }).where("id", "=", userId).execute();
    }
}
