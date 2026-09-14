// Rate limit berjenjang per kelas endpoint (NFR-S-07, SDD-SEC-05, SDD-13 §4.3).
//
// Sliding window di Redis: setiap permintaan tercatat sebagai anggota sorted set
// berskor waktu, dan yang dihitung hanya anggota di dalam jendela yang berakhir
// sekarang. Berbeda dari fixed window, batas tidak dapat digandakan dengan
// menembak tepat di pergantian jendela.

import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { Clock } from "../clock/index.js";
import type { RateLimitClass } from "./route.js";

export interface KelasLimit {
    readonly batas: number;
    readonly jendelaMs: number;
    /** Siapa yang dihitung (SDD-13 §4.3). */
    readonly kunci: "user" | "ip";
    /** Redis tidak tersedia → tolak (`true`) atau loloskan dengan alarm (`false`). */
    readonly gagalTertutup: boolean;
}

const MENIT = 60_000;
const JAM = 60 * MENIT;

/** Tabel SDD-13 §4.3. Uji membandingkannya dengan berkas SDD, bukan dengan salinan. */
export const KELAS_LIMIT: Readonly<Record<RateLimitClass, KelasLimit>> = {
    default: {
        batas: 100,
        jendelaMs: MENIT,
        kunci: "user",
        gagalTertutup: false,
    },
    // Sumbu akun (PostgreSQL, SDD-SESS-07) menyusul tabel akun di Phase 02; yang
    // ada di sini sumbu IP-nya. Satu-satunya kelas yang fail closed (SDD-13 §4.3).
    login: {
        batas: 5,
        jendelaMs: 15 * MENIT,
        kunci: "ip",
        gagalTertutup: true,
    },
    "public-asset": {
        batas: 20,
        jendelaMs: MENIT,
        kunci: "ip",
        gagalTertutup: false,
    },
    export: { batas: 10, jendelaMs: JAM, kunci: "user", gagalTertutup: false },
    "qr-print": {
        batas: 5,
        jendelaMs: JAM,
        kunci: "user",
        gagalTertutup: false,
    },
    chat: { batas: 10, jendelaMs: MENIT, kunci: "user", gagalTertutup: false },
    upload: { batas: 60, jendelaMs: JAM, kunci: "user", gagalTertutup: false },
};

export interface Pemohon {
    readonly userId?: number;
    readonly ip: string;
}

/**
 * Kunci penghitung. Kelas berkunci pengguna jatuh ke IP bila permintaan belum
 * terautentikasi — probe publik dan seluruh trafik sebelum Phase 02 (keputusan
 * pemilik produk, 14 September 2026). Nama kelas ikut di kunci, sehingga
 * habisnya satu kelas tidak menyentuh kelas lain.
 */
export function kunciLimit(kelas: RateLimitClass, pemohon: Pemohon): string {
    const pengguna =
        KELAS_LIMIT[kelas].kunci === "user" && pemohon.userId !== undefined;
    return `sigm4:rl:${kelas}:${pengguna ? `u:${String(pemohon.userId)}` : `ip:${pemohon.ip}`}`;
}

export interface HasilLimit {
    readonly lolos: boolean;
    readonly batas: number;
    readonly sisa: number;
    /** Detik sampai slot tertua di jendela terlepas. */
    readonly resetDetik: number;
}

export interface RateLimiter {
    hit(kelas: RateLimitClass, pemohon: Pemohon): Promise<HasilLimit>;
}

// Atomik di sisi Redis: buang yang keluar jendela, hitung, catat bila masih muat.
// Permintaan yang ditolak tidak dicatat — penolakan tidak memperpanjang hukuman.
const SKRIP = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]) - tonumber(ARGV[2]))
local n = redis.call('ZCARD', KEYS[1])
local lolos = 0
if n < tonumber(ARGV[3]) then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4])
  n = n + 1
  lolos = 1
end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
local tertua = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
return {lolos, n, tertua[2] or ARGV[1]}
`;

export class RedisRateLimiter implements RateLimiter {
    constructor(
        private readonly redis: Redis,
        private readonly clock: Clock,
    ) {}

    async hit(kelas: RateLimitClass, pemohon: Pemohon): Promise<HasilLimit> {
        const { batas, jendelaMs } = KELAS_LIMIT[kelas];
        const sekarang = this.clock.now().getTime();
        const [lolos, n, tertua] = (await this.redis.eval(
            SKRIP,
            1,
            kunciLimit(kelas, pemohon),
            sekarang,
            jendelaMs,
            batas,
            `${String(sekarang)}:${randomUUID()}`,
        )) as [number, number, string];
        return {
            lolos: lolos === 1,
            batas,
            sisa: Math.max(0, batas - n),
            resetDetik: Math.max(
                0,
                Math.ceil((Number(tertua) + jendelaMs - sekarang) / 1000),
            ),
        };
    }
}
