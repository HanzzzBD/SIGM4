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
    /** Penguncian akun (0022, `SDD-SESS-06`): terkunci bila masih di depan `sekarang`. */
    readonly locked_until: Date | null;
}

/** Keadaan penghitung kegagalan sebuah akun, dibaca dengan kunci baris. */
export interface StatusGagalRow {
    readonly failed_login_count: number;
    readonly failed_login_window_start: Date | null;
    readonly locked_until: Date | null;
}

/** Permintaan reset password yang sudah diterbitkan (FR-01.3): dasar kedaluwarsa 72 jam saat login. */
export interface PermintaanTerbitRow {
    readonly id: string;
    readonly status: "DITERBITKAN" | "SELESAI" | "KEDALUWARSA";
    readonly kedaluwarsa_pada: Date;
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
            .select(["u.id", "u.password_hash", "u.status", "u.must_change_password as wajib_ganti", "r.kode as role_kode", "u.locked_until"])
            .where(sql<boolean>`lower(u.email) = lower(${email})`)
            .executeTakeFirst();
    }

    async cariUserById(id: string): Promise<UserLogin | undefined> {
        return this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["u.id", "u.password_hash", "u.status", "u.must_change_password as wajib_ganti", "r.kode as role_kode", "u.locked_until"])
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

    /** Login berhasil: catat waktunya dan hapus penghitung kegagalan beserta sisa kunci (FR-01.1 A2). */
    async catatLoginBerhasil(userId: string, waktu: Date): Promise<void> {
        await this.db
            .updateTable("users")
            .set({ login_terakhir_pada: waktu, failed_login_count: 0, failed_login_window_start: null, locked_until: null })
            .where("id", "=", userId)
            .execute();
    }

    /**
     * Mengunci BARIS pengguna dan membaca penghitungnya. Kegagalan serentak atas satu akun
     * diserialkan di sini, sehingga penguncian terjadi tepat sekali (bukan dua kali pada
     * kegagalan kelima dan keenam yang berbarengan).
     */
    async kunciStatusGagal(userId: string): Promise<StatusGagalRow | undefined> {
        return this.db
            .selectFrom("users")
            .select(["failed_login_count", "failed_login_window_start", "locked_until"])
            .where("id", "=", userId)
            .forUpdate()
            .executeTakeFirst();
    }

    async simpanStatusGagal(userId: string, status: { hitungan: number; awalJendela: Date | null; terkunciSampai: Date | null }): Promise<void> {
        await this.db
            .updateTable("users")
            .set({ failed_login_count: status.hitungan, failed_login_window_start: status.awalJendela, locked_until: status.terkunciSampai })
            .where("id", "=", userId)
            .execute();
    }

    // ---- Reset password (FR-01.3, PR-02-05): pra-autentikasi, sama seperti login ------------------

    /** Mengunci baris pengguna: permintaan serentak atas satu akun diserialkan (batas 3/24 jam, A4). */
    async kunciUser(userId: string): Promise<boolean> {
        const baris = await this.db.selectFrom("users").select("id").where("id", "=", userId).forUpdate().executeTakeFirst();
        return baris !== undefined;
    }

    /** Permintaan reset akun ini sejak `sejak`, apa pun statusnya (FR-01.3 A4). */
    async hitungPermintaanReset(userId: string, sejak: Date): Promise<number> {
        const baris = await this.db
            .selectFrom("password_reset_requests")
            .select((eb) => eb.fn.countAll<string>().as("n"))
            .where("user_id", "=", userId)
            .where("diminta_pada", ">=", sejak)
            .executeTakeFirstOrThrow();
        return Number(baris.n);
    }

    async sisipPermintaanReset(userId: string, waktu: Date): Promise<string> {
        const baris = await this.db
            .insertInto("password_reset_requests")
            .values({ user_id: userId, diminta_pada: waktu })
            .returning("id")
            .executeTakeFirstOrThrow();
        return baris.id;
    }

    /**
     * Penerbitan password sementara TERAKHIR akun ini (yang menetapkan password saat ini bila
     * `must_change_password`). Akun tanpa penerbitan — mis. akun baru buatan Administrator — tidak
     * punya batas 72 jam (FR-02.1).
     */
    async cariPenerbitanTerakhir(userId: string): Promise<PermintaanTerbitRow | undefined> {
        const baris = await this.db
            .selectFrom("password_reset_requests")
            .select(["id", "status", "kedaluwarsa_pada"])
            .where("user_id", "=", userId)
            .where("status", "in", ["DITERBITKAN", "SELESAI", "KEDALUWARSA"])
            .orderBy("diproses_pada", "desc")
            .orderBy("id", "desc")
            .limit(1)
            .executeTakeFirst();
        if (baris === undefined || baris.kedaluwarsa_pada === null) return undefined;
        return {
            id: baris.id,
            status: baris.status as PermintaanTerbitRow["status"],
            kedaluwarsa_pada: baris.kedaluwarsa_pada,
        };
    }

    /** Menutup penerbitan yang lewat 72 jam (FR-01.3 A3); hanya bila masih `DITERBITKAN`. */
    async kedaluwarsakanPermintaan(id: string): Promise<void> {
        await this.db
            .updateTable("password_reset_requests")
            .set({ status: "KEDALUWARSA" })
            .where("id", "=", id)
            .where("status", "=", "DITERBITKAN")
            .execute();
    }
}
