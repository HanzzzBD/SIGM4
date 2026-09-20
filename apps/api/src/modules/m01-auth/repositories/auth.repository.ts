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
    /** 2FA aktif (0024, `FR-01.5`): login berhenti di tantangan, sesi baru terbit setelah faktor kedua terbukti. */
    readonly totp_enabled_at: Date | null;
}

/** Keadaan penghitung kegagalan sebuah akun, dibaca dengan kunci baris. */
export interface StatusGagalRow {
    readonly failed_login_count: number;
    readonly failed_login_window_start: Date | null;
    readonly locked_until: Date | null;
}

/** Akun yang sedang memverifikasi faktor kedua (`FR-01.5`), dibaca dengan kunci baris. */
export interface UserDuaFaktorRow extends StatusGagalRow {
    readonly id: string;
    readonly nama: string;
    readonly email: string;
    readonly status: "AKTIF" | "NONAKTIF";
    readonly wajib_ganti: boolean;
    readonly role_kode: string;
    readonly totp_secret_enc: Buffer | null;
    readonly totp_enabled_at: Date | null;
    readonly totp_last_step: number | null;
}

/** Kode cadangan yang belum terpakai: hash-nya dicocokkan satu per satu (Argon2id, `BR-070c`). */
export interface KodeCadanganRow {
    readonly id: string;
    readonly code_hash: string;
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
    /** `amr` sesi ini memuat `otp` (0024, `SDD-SESS-09`); diwarisi setiap rotasi. */
    readonly otp_verified: boolean;
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
    readonly otpVerified: boolean;
}

export class AuthRepository {
    constructor(private readonly db: Eksekutor) {}

    /** Email dicocokkan tanpa memandang huruf besar-kecil (indeks unik `lower(email)`, 0012). */
    async cariUserByEmail(email: string): Promise<UserLogin | undefined> {
        return this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select([
                "u.id",
                "u.password_hash",
                "u.status",
                "u.must_change_password as wajib_ganti",
                "r.kode as role_kode",
                "u.locked_until",
                "u.totp_enabled_at",
            ])
            .where(sql<boolean>`lower(u.email) = lower(${email})`)
            .executeTakeFirst();
    }

    async cariUserById(id: string): Promise<UserLogin | undefined> {
        return this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select([
                "u.id",
                "u.password_hash",
                "u.status",
                "u.must_change_password as wajib_ganti",
                "r.kode as role_kode",
                "u.locked_until",
                "u.totp_enabled_at",
            ])
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
                otp_verified: data.otpVerified,
            })
            .returning("id")
            .executeTakeFirstOrThrow();
        return baris.id;
    }

    /** Mengunci barisnya: dua refresh bersamaan atas token yang sama diserialkan (SDD-04 §4.3). */
    async cariRefreshUntukUbah(tokenHash: Buffer): Promise<RefreshRow | undefined> {
        return this.db
            .selectFrom("refresh_tokens")
            .select(["id", "user_id", "family_id", "platform", "expires_at", "rotated_at", "revoked_at", "otp_verified"])
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

    // ---- 2FA (FR-01.5, PR-02-07): verifikasi faktor kedua terjadi SEBELUM ada sesi, jadi tanpa `AuthContext` ----

    /**
     * Mengunci baris pengguna dan membaca semua yang dibutuhkan verifikasi faktor kedua. Verifikasi
     * serentak atas satu akun diserialkan di sini: satu kode tidak dapat diterima dua kali.
     */
    async kunciUserDuaFaktor(userId: string): Promise<UserDuaFaktorRow | undefined> {
        return this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select([
                "u.id",
                "u.nama",
                "u.email",
                "u.status",
                "u.must_change_password as wajib_ganti",
                "r.kode as role_kode",
                "u.failed_login_count",
                "u.failed_login_window_start",
                "u.locked_until",
                "u.totp_secret_enc",
                "u.totp_enabled_at",
                "u.totp_last_step",
            ])
            .where("u.id", "=", userId)
            .forUpdate()
            .executeTakeFirst();
    }

    /** Menyimpan langkah TOTP yang baru diterima: kode itu tidak berlaku lagi (RFC 6238 §5.2). */
    async simpanLangkahTotp(userId: string, langkah: number): Promise<void> {
        await this.db.updateTable("users").set({ totp_last_step: langkah }).where("id", "=", userId).execute();
    }

    async daftarKodeCadanganAktif(userId: string): Promise<KodeCadanganRow[]> {
        return this.db
            .selectFrom("totp_backup_codes")
            .select(["id", "code_hash"])
            .where("user_id", "=", userId)
            .where("used_at", "is", null)
            .orderBy("id")
            .execute();
    }

    /** Menandai satu kode terpakai; `false` bila kode itu sudah terpakai lebih dulu (sekali pakai, FR-01.5 AC). */
    async pakaiKodeCadangan(id: string, waktu: Date): Promise<boolean> {
        const hasil = await this.db
            .updateTable("totp_backup_codes")
            .set({ used_at: waktu })
            .where("id", "=", id)
            .where("used_at", "is", null)
            .executeTakeFirst();
        return Number(hasil.numUpdatedRows) === 1;
    }

    async hitungKodeCadanganAktif(userId: string): Promise<number> {
        const baris = await this.db
            .selectFrom("totp_backup_codes")
            .select((eb) => eb.fn.countAll<string>().as("n"))
            .where("user_id", "=", userId)
            .where("used_at", "is", null)
            .executeTakeFirstOrThrow();
        return Number(baris.n);
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
