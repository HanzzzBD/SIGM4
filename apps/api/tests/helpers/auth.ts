// Bantuan uji autentikasi (PR-02-02): pasangan kunci Ed25519 sekali-pakai dan dependensi
// `AppDeps.auth` untuk uji yang merakit `createApp` tanpa pernah login.

import { generateKeyPairSync, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import type { Kysely } from "kysely";
import type { AppDeps } from "../../src/api/index.js";
import { PenyimpanTantanganRedis } from "../../src/modules/m01-auth/index.js";
import type { PenyimpanTantangan } from "../../src/modules/m01-auth/index.js";
import type { UsersModuleDeps } from "../../src/modules/m02-users/index.js";
import type { PermissionCache } from "../../src/shared/auth/index.js";
import type { Database } from "../../src/shared/db/index.js";
import {
    JwtKeys,
    KotakRahasia,
    bangkitkanKodeCadangan,
    bangkitkanKodeTunggal,
    bangkitkanSecretTotp,
    hashPassword,
    kodeTotp,
    langkahTotp,
    tampilkanKodeCadangan,
} from "../../src/shared/security/index.js";

export interface PasanganPem {
    readonly privat: string;
    readonly publik: string;
}

export function bangkitkanPem(): PasanganPem {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    return {
        privat: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        publik: publicKey.export({ type: "spki", format: "pem" }).toString(),
    };
}

/** Env `JWT_*` sah untuk `readApiConfig`. */
export function envJwtUji(pem: PasanganPem = bangkitkanPem()): {
    JWT_PRIVATE_KEY: string;
    JWT_PUBLIC_KEY: string;
} {
    return { JWT_PRIVATE_KEY: pem.privat, JWT_PUBLIC_KEY: pem.publik };
}

export function kunciUji(pem: PasanganPem = bangkitkanPem()): JwtKeys {
    return JwtKeys.dariPem(pem.privat, pem.publik);
}

/** `AppDeps.auth` untuk uji yang tidak mengautentikasi siapa pun: cache tak pernah dipanggil. */
export function authPalsu(): AppDeps["auth"] {
    const permissions = { load: () => Promise.resolve(undefined) } as unknown as PermissionCache;
    // Tanpa basis data: setiap sesi dianggap hidup — uji yang membuktikan pencabutan memakai `SessionStore` nyata.
    return {
        jwtKeys: kunciUji(),
        permissions,
        sessions: { aktif: () => Promise.resolve(true) },
        twoFactor: { kotak: KOTAK_TOTP_UJI, tantangan: penyimpanTantanganMemori() },
    };
}

/**
 * Kunci enkripsi secret TOTP milik SELURUH uji dalam satu proses: aplikasi yang dirakit uji dan
 * `daftarkanTotpUji` (yang menanam secret lewat basis data) harus memegang kunci yang sama.
 */
export const KOTAK_TOTP_UJI = KotakRahasia.dariBase64(randomBytes(32).toString("base64"));

/** Penyimpan challenge di memori: uji tanpa Redis. Kedaluwarsanya menurut `Clock`, sama seperti produksi. */
export function penyimpanTantanganMemori(): PenyimpanTantangan {
    const isi = new Map<string, { userId: string; platform: "WEB" | "ANDROID" | "IOS"; berlakuSampai: number }>();
    return {
        terbitkan: (data, sekarang) => {
            const token = randomBytes(32).toString("base64url");
            isi.set(token, { ...data, berlakuSampai: sekarang.getTime() + 5 * 60_000 });
            return Promise.resolve(token);
        },
        baca: (token, sekarang) => {
            const nilai = isi.get(token);
            if (nilai === undefined || nilai.berlakuSampai <= sekarang.getTime()) return Promise.resolve(undefined);
            return Promise.resolve({ userId: nilai.userId, platform: nilai.platform });
        },
        hapus: (token) => {
            isi.delete(token);
            return Promise.resolve();
        },
    };
}

/** `AppDeps.auth.twoFactor` bagi uji integrasi: Redis nyata bila diberikan, memori bila tidak. */
export function duaFaktorUji(redis?: Redis): AppDeps["auth"]["twoFactor"] {
    return {
        kotak: KOTAK_TOTP_UJI,
        tantangan: redis === undefined ? penyimpanTantanganMemori() : new PenyimpanTantanganRedis(redis),
    };
}

export interface TotpUji {
    readonly secret: Buffer;
    /** Kode cadangan dalam bentuk NORMAL (10 karakter), persis yang dihash. */
    readonly kodeCadangan: readonly string[];
}

/**
 * Mengaktifkan 2FA pada akun lewat basis data, tanpa melalui endpoint pendaftaran: uji yang butuh akun
 * ber-2FA sebagai PRASYARAT tidak perlu mengulang alur pendaftaran (yang dibuktikan uji tersendiri).
 */
export async function daftarkanTotpUji(db: Kysely<Database>, userId: number | string, sekarang: Date): Promise<TotpUji> {
    const secret = bangkitkanSecretTotp();
    const kodeCadangan = bangkitkanKodeCadangan();
    const hash = await Promise.all(kodeCadangan.map((k) => hashPassword(k)));
    await db
        .updateTable("users")
        .set({ totp_secret_enc: KOTAK_TOTP_UJI.enkripsi(secret, `totp:${String(userId)}`), totp_enabled_at: sekarang, totp_last_step: null })
        .where("id", "=", String(userId))
        .execute();
    await db.deleteFrom("totp_backup_codes").where("user_id", "=", String(userId)).execute();
    await db.insertInto("totp_backup_codes").values(hash.map((code_hash) => ({ user_id: String(userId), code_hash }))).execute();
    return { secret, kodeCadangan };
}

/**
 * Menerbitkan kode aktivasi 2FA (BR-070d) lewat basis data, seperti Administrator/CLI tanpa melalui endpoint
 * penerbit: prasyarat bagi uji yang mendaftarkan 2FA akun role wajib. Mengembalikan kode dalam bentuk tampil.
 */
export async function terbitkanKodeAktivasiUji(
    db: Kysely<Database>,
    userId: number | string,
    sekarang: Date,
    opsi: { readonly berlakuMs?: number; readonly gagal?: number } = {},
): Promise<string> {
    const normal = bangkitkanKodeTunggal();
    await db.deleteFrom("totp_activation_codes").where("user_id", "=", String(userId)).where("consumed_at", "is", null).execute();
    await db
        .insertInto("totp_activation_codes")
        .values({
            user_id: String(userId),
            code_hash: await hashPassword(normal),
            issued_by: null,
            metode_verifikasi: null,
            issued_at: sekarang,
            expires_at: new Date(sekarang.getTime() + (opsi.berlakuMs ?? 72 * 3600_000)),
            failed_attempts: opsi.gagal ?? 0,
        })
        .execute();
    return tampilkanKodeCadangan(normal);
}

/** Kode TOTP yang berlaku pada `sekarang` (langkah ke-`geser` dari langkah saat ini). */
export function kodeTotpUji(secret: Buffer, sekarang: Date, geser = 0): string {
    return kodeTotp(secret, langkahTotp(sekarang) + geser);
}

/** Pintu reset password langsung yang tak dipakai: uji yang membangun `usersRouter` sendiri tidak menyentuhnya. */
/** Pengelola 2FA pengguna lain yang tak dipakai: uji yang membangun `usersRouter` sendiri tidak menyentuhnya. */
export const pengelolaPalsu: UsersModuleDeps["pengelolaDuaFaktor"] = {
    terbitkanKodeAktivasi: () => Promise.reject(new Error("pengelolaPalsu: tidak boleh dipanggil")),
    reset: () => Promise.reject(new Error("pengelolaPalsu: tidak boleh dipanggil")),
};

export const penerbitPalsu: UsersModuleDeps["penerbitPassword"] = {
    terbitkanLangsung: () => Promise.reject(new Error("penerbitPalsu: tidak boleh dipanggil")),
};

const SECRET_PER_PENGGUNA = new Map<string, Buffer>();

export interface SesiDuaFaktor {
    readonly accessToken: string;
    readonly refreshToken: string;
}

/**
 * Masuk sebagai akun WAJIB 2FA (R-01/R-03) lewat alur SUNGGUHAN: login → challenge → verifikasi TOTP.
 * Untuk uji yang membutuhkan sesi Administrator yang sah sebagai prasyarat (BR-070), bukan yang menguji 2FA.
 *
 * `totp_last_step` di-reset sebelum verifikasi: uji berjam-tetap (`FixedClock`) selalu berada pada langkah
 * TOTP yang sama, sehingga login kedua oleh akun yang sama akan ditolak sebagai pemakaian ulang. Penjaga
 * pemakaian ulangnya sendiri dibuktikan uji tersendiri (`auth-two-factor.test.ts`).
 */
export async function loginDuaFaktor(opsi: {
    readonly url: string;
    readonly db: Kysely<Database>;
    readonly userId: number | string;
    readonly email: string;
    readonly password: string;
    /** Jam yang sama dengan jam aplikasi (`Clock` yang di-inject). */
    readonly sekarang: Date;
    readonly platform?: "ANDROID" | "IOS";
}): Promise<SesiDuaFaktor> {
    const kunci = String(opsi.userId);
    let secret = SECRET_PER_PENGGUNA.get(kunci);
    if (secret === undefined) {
        secret = (await daftarkanTotpUji(opsi.db, kunci, opsi.sekarang)).secret;
        SECRET_PER_PENGGUNA.set(kunci, secret);
    }
    const kirim = async (path: string, body: unknown): Promise<{ status: number; json: { data?: Record<string, unknown> } }> => {
        const res = await fetch(`${opsi.url}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${String(1 + Math.floor(Math.random() * 250))}` },
            body: JSON.stringify(body),
        });
        return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown> } };
    };
    const login = await kirim("/auth/login", { email: opsi.email, password: opsi.password, platform: opsi.platform ?? "ANDROID" });
    const tantangan = login.json.data?.["challenge_token"];
    if (login.status !== 200 || typeof tantangan !== "string") {
        throw new Error(`loginDuaFaktor: login tidak menghasilkan challenge (status ${String(login.status)})`);
    }
    await opsi.db.updateTable("users").set({ totp_last_step: null }).where("id", "=", kunci).execute();
    const verif = await kirim("/auth/2fa/verify", { challenge_token: tantangan, kode: kodeTotpUji(secret, opsi.sekarang) });
    const tokens = verif.json.data?.["tokens"] as { access_token: string; refresh_token: string } | null | undefined;
    if (verif.status !== 200 || tokens === null || tokens === undefined) {
        throw new Error(`loginDuaFaktor: verifikasi gagal (status ${String(verif.status)})`);
    }
    return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
}
