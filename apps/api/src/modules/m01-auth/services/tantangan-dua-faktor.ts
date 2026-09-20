// Challenge token 2FA (SDD-SESS-10, TBD-SESS-A): berumur 5 menit, sekali pakai, dan BUKAN access
// token — nilainya buram (32 byte acak) dan hanya bermakna sebagai kunci di Redis, sehingga tidak
// mungkin diajukan sebagai `Authorization: Bearer` (bukan JWT), apa pun yang dilakukan penyerang.
//
// Yang disimpan hanya SHA-256-nya (sama seperti refresh token, SDD-SESS-03): Redis yang bocor tidak
// membocorkan challenge yang masih dapat dipakai. Ia hidup di Redis, bukan PostgreSQL: kehilangannya
// (restart cache) hanya berarti pengguna mengulang login — tidak ada kontrol keamanan yang hilang,
// karena penghitung kegagalan dan penguncian tetap di PostgreSQL (SDD-SESS-06).
//
// Challenge TIDAK dihabiskan oleh kode yang salah — kegagalan dibatasi penguncian akun (5x → 15
// menit), bukan dengan memaksa login ulang di setiap salah ketik. Ia dihabiskan saat kode BENAR.

import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import type { PlatformPerangkat } from "../../../shared/security/index.js";

/** TBD-SESS-A: 5 menit (SDD-SESS-10). */
export const TANTANGAN_TTL_DETIK = 5 * 60;

const PREFIX_KUNCI = "sigm4:2fa:tantangan";

export interface DataTantangan {
    readonly userId: string;
    readonly platform: PlatformPerangkat;
}

/** Pemetaan token buram → data; implementasi produksi di Redis, uji boleh di memori. */
export interface PenyimpanTantangan {
    /** Menyimpan tantangan baru dan mengembalikan token buramnya (sekali ini saja). */
    terbitkan(data: DataTantangan, sekarang: Date): Promise<string>;
    /** Data tantangan bila masih berlaku pada `sekarang`; kedaluwarsa menurut `Clock`, bukan jam Redis. */
    baca(token: string, sekarang: Date): Promise<DataTantangan | undefined>;
    hapus(token: string): Promise<void>;
}

interface Tersimpan extends DataTantangan {
    readonly berlakuSampai: number;
}

const BENTUK_TOKEN = /^[A-Za-z0-9_-]{43}$/;

function kunci(token: string): string {
    return `${PREFIX_KUNCI}:${createHash("sha256").update(token).digest("hex")}`;
}

function bentukPlatform(v: unknown): v is PlatformPerangkat {
    return v === "WEB" || v === "ANDROID" || v === "IOS";
}

export class PenyimpanTantanganRedis implements PenyimpanTantangan {
    constructor(private readonly redis: Redis) {}

    async terbitkan(data: DataTantangan, sekarang: Date): Promise<string> {
        const token = randomBytes(32).toString("base64url");
        const nilai: Tersimpan = { ...data, berlakuSampai: sekarang.getTime() + TANTANGAN_TTL_DETIK * 1000 };
        // `EX` hanya pembersih; batas berlaku yang menentukan adalah `berlakuSampai` menurut `Clock`.
        await this.redis.set(kunci(token), JSON.stringify(nilai), "EX", TANTANGAN_TTL_DETIK);
        return token;
    }

    async baca(token: string, sekarang: Date): Promise<DataTantangan | undefined> {
        if (!BENTUK_TOKEN.test(token)) return undefined;
        const mentah = await this.redis.get(kunci(token));
        if (mentah === null) return undefined;
        let nilai: unknown;
        try {
            nilai = JSON.parse(mentah);
        } catch {
            return undefined;
        }
        if (nilai === null || typeof nilai !== "object") return undefined;
        const { userId, platform, berlakuSampai } = nilai as Record<string, unknown>;
        if (typeof userId !== "string" || !bentukPlatform(platform) || typeof berlakuSampai !== "number") {
            return undefined;
        }
        if (berlakuSampai <= sekarang.getTime()) return undefined;
        return { userId, platform };
    }

    async hapus(token: string): Promise<void> {
        await this.redis.del(kunci(token));
    }
}
