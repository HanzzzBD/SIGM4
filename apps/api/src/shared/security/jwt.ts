// Access token JWT EdDSA / Ed25519 (SDD-SESS-02, NFR-S-03, PR-02-02).
//
// Ditulis di atas `node:crypto`, bukan pustaka JWT: token kita satu bentuk saja —
// satu algoritma, satu kunci, klaim tetap — sehingga seluruh permukaan yang
// dibutuhkan kurang dari seratus baris dan tidak menambah dependensi pada jalur
// autentikasi (SCA, rantai pasok). Kelas bug JWT yang nyata dijaga di sini dan diuji
// satu per satu: algoritma dipatok `EdDSA` (bukan yang dinyatakan token — `none` dan
// kebingungan HS256↔kunci publik), `kid` harus dikenal, tanda tangan diperiksa
// SEBELUM klaim dipercaya, dan penguraian base64url ketat.
//
// Waktu selalu dari `Clock` yang di-inject (SDD-SYS-07): `verify` menerima `Date`.

import {
    createHash,
    createPrivateKey,
    createPublicKey,
    randomUUID,
    sign,
    verify,
} from "node:crypto";
import type { KeyObject } from "node:crypto";

/** Masa berlaku access token (`FR-01.1` langkah 6). */
export const ACCESS_TOKEN_TTL_DETIK = 60 * 60;

/** Penerbit dan audiens tetap: token milik sistem ini, untuk API ini. */
export const JWT_ISSUER = "sigm4";
export const JWT_AUDIENCE = "sigm4-api";

/** Selisih jam yang ditoleransi pada `iat` di masa depan. */
const TOLERANSI_JAM_DETIK = 60;

const PANJANG_TANDA_TANGAN = 64;

export type AlasanJwt = "EXPIRED" | "INVALID";

export class JwtError extends Error {
    constructor(
        readonly alasan: AlasanJwt,
        pesan: string,
    ) {
        super(pesan);
        this.name = "JwtError";
    }
}

/** Klaim yang diterbitkan dan diperiksa. Tidak ada klaim bebas. */
export interface AccessClaims {
    /** Id pengguna (string, seperti bigint dari driver `pg`). */
    readonly sub: string;
    /** Id sesi = `family_id` refresh token; dasar pencabutan sesi (`SDD-SESS-04`). */
    readonly sid: string;
    /** `pwd_change_required` (`FR-01.1` A4, `SDD-AUTH-09` gerbang 2). */
    readonly pwd: boolean;
    /** Metode autentikasi (`SDD-SESS-09`): `pwd`, kelak `otp`. */
    readonly amr: readonly string[];
    readonly iat: number;
    readonly exp: number;
}

export interface KlaimBaru {
    readonly sub: string;
    readonly sid: string;
    readonly pwd: boolean;
    readonly amr: readonly string[];
}

function b64u(data: Buffer | string): string {
    return Buffer.from(data).toString("base64url");
}

/** base64url ketat: `Buffer.from` mengabaikan karakter asing, dan itu bukan sifat yang kita inginkan. */
function dariB64u(teks: string): Buffer {
    const hasil = Buffer.from(teks, "base64url");
    if (hasil.toString("base64url") !== teks) {
        throw new JwtError("INVALID", "Token bukan base64url yang sah.");
    }
    return hasil;
}

function ujiJson(teks: Buffer, apa: string): Record<string, unknown> {
    try {
        const nilai: unknown = JSON.parse(teks.toString("utf8"));
        if (nilai === null || typeof nilai !== "object" || Array.isArray(nilai)) {
            throw new Error("bukan objek");
        }
        return nilai as Record<string, unknown>;
    } catch {
        throw new JwtError("INVALID", `${apa} token bukan objek JSON.`);
    }
}

/** Thumbprint RFC 7638 kunci publik OKP/Ed25519 — `kid` tetap selama kuncinya sama. */
function thumbprint(kunciPublik: KeyObject): string {
    const jwk = kunciPublik.export({ format: "jwk" });
    const kanonik = `{"crv":"${String(jwk.crv)}","kty":"${String(jwk.kty)}","x":"${String(jwk.x)}"}`;
    return b64u(createHash("sha256").update(kanonik).digest());
}

function bacaPem(pem: string): string {
    // Berkas env satu baris memakai `\n` literal untuk pemisah baris PEM.
    return pem.includes("\\n") ? pem.replaceAll("\\n", "\n") : pem;
}

export class JwtKeys {
    private constructor(
        private readonly kunciPrivat: KeyObject,
        private readonly kunciPublik: KeyObject,
        readonly kid: string,
    ) {}

    /**
     * Membangun dari PEM (PKCS#8 privat, SPKI publik). Ditolak bila bukan Ed25519 atau
     * pasangannya tidak cocok — salah pasang kunci harus gagal saat startup, bukan
     * membuat setiap token ditolak diam-diam (`SDD-INF-08`).
     */
    static dariPem(privatPem: string, publikPem: string): JwtKeys {
        let privat: KeyObject;
        let publik: KeyObject;
        try {
            privat = createPrivateKey(bacaPem(privatPem));
            publik = createPublicKey(bacaPem(publikPem));
        } catch {
            throw new Error("Kunci JWT bukan PEM yang sah.");
        }
        if (privat.asymmetricKeyType !== "ed25519" || publik.asymmetricKeyType !== "ed25519") {
            throw new Error("Kunci JWT harus Ed25519 (SDD-SESS-02).");
        }
        const contoh = Buffer.from("sigm4-pasangan-kunci");
        if (!verify(null, contoh, publik, sign(null, contoh, privat))) {
            throw new Error("Kunci publik JWT bukan pasangan kunci privatnya.");
        }
        return new JwtKeys(privat, publik, thumbprint(publik));
    }

    /** Menerbitkan token. `sekarang` dari `Clock`; `ttlDetik` bawaan 60 menit. */
    terbitkan(klaim: KlaimBaru, sekarang: Date, ttlDetik: number = ACCESS_TOKEN_TTL_DETIK): string {
        const iat = Math.floor(sekarang.getTime() / 1000);
        const header = b64u(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: this.kid }));
        const badan = b64u(
            JSON.stringify({
                iss: JWT_ISSUER,
                aud: JWT_AUDIENCE,
                sub: klaim.sub,
                sid: klaim.sid,
                pwd: klaim.pwd,
                amr: klaim.amr,
                iat,
                exp: iat + ttlDetik,
                jti: randomUUID(),
            }),
        );
        const tandaTangan = sign(null, Buffer.from(`${header}.${badan}`), this.kunciPrivat);
        return `${header}.${badan}.${b64u(tandaTangan)}`;
    }

    /**
     * Memverifikasi token. Melempar `JwtError`: `EXPIRED` HANYA bila tanda tangan sah
     * dan masa berlaku lewat (klien boleh menukar refresh token); selain itu `INVALID`.
     */
    verifikasi(token: string, sekarang: Date): AccessClaims {
        const bagian = token.split(".");
        if (bagian.length !== 3 || bagian.some((b) => b === "")) {
            throw new JwtError("INVALID", "Token bukan JWT tiga bagian.");
        }
        const [hBagian, pBagian, sBagian] = bagian as [string, string, string];
        const header = ujiJson(dariB64u(hBagian), "Header");
        // Algoritma dipatok di sini, bukan dibaca dari token: `none`, HS256, dan RS256 ditolak.
        if (header["alg"] !== "EdDSA") throw new JwtError("INVALID", "Algoritma token bukan EdDSA.");
        if (header["kid"] !== this.kid) throw new JwtError("INVALID", "kid token tidak dikenal.");
        if ("crit" in header || "jku" in header || "jwk" in header || "x5u" in header) {
            throw new JwtError("INVALID", "Header token memuat parameter yang tidak diterima.");
        }

        const tandaTangan = dariB64u(sBagian);
        if (
            tandaTangan.length !== PANJANG_TANDA_TANGAN ||
            !verify(null, Buffer.from(`${hBagian}.${pBagian}`), this.kunciPublik, tandaTangan)
        ) {
            throw new JwtError("INVALID", "Tanda tangan token tidak sah.");
        }

        // Baru setelah tanda tangan sah, isi dipercaya.
        const badan = ujiJson(dariB64u(pBagian), "Klaim");
        if (badan["iss"] !== JWT_ISSUER || badan["aud"] !== JWT_AUDIENCE) {
            throw new JwtError("INVALID", "Penerbit atau audiens token salah.");
        }
        const { sub, sid, pwd, amr, iat, exp } = badan;
        if (
            typeof sub !== "string" || !/^\d+$/.test(sub) ||
            typeof sid !== "string" || sid === "" ||
            typeof pwd !== "boolean" ||
            !Array.isArray(amr) || !amr.every((a) => typeof a === "string") ||
            typeof iat !== "number" || typeof exp !== "number" ||
            !Number.isFinite(iat) || !Number.isFinite(exp)
        ) {
            throw new JwtError("INVALID", "Klaim token tidak lengkap atau salah tipe.");
        }
        const detik = Math.floor(sekarang.getTime() / 1000);
        if (iat > detik + TOLERANSI_JAM_DETIK) throw new JwtError("INVALID", "Token diterbitkan di masa depan.");
        if (exp <= detik) throw new JwtError("EXPIRED", "Token kedaluwarsa.");
        return { sub, sid, pwd, amr: amr as string[], iat, exp };
    }
}
