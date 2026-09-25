// Koneksi Redis (SDD-SYS-13, INF-03).
//
// Sejajar dengan `shared/db/connection.ts`: konfigurasi dari variabel lingkungan,
// startup gagal bila kosong (`SDD-INF-08`), dan instance bersama dibuat saat
// pertama diminta — mengimpor modul ini tidak boleh membuka koneksi.
//
// Klien `ioredis` mengikuti BullMQ (`SDD-AVL-10`) yang menuntutnya. Redis dipakai
// tiga hal berbeda: antrean pekerjaan (`JOB-01`), rate limit (`NFR-S-07`), dan
// cache permission ber-TTL 60 detik (`SDD-AUTH-04`) — karena itu ia di kernel,
// bukan di salah satu entrypoint.

import { Redis } from "ioredis";
import { parseRedisEnv } from "../config/index.js";

export interface RedisConfig {
    readonly url: string;
}

/**
 * Membaca konfigurasi dari lingkungan. Aturannya milik skema `shared/config`
 * (SDD-SYS-14); pesan galat menyebut NAMA variabel, tidak pernah nilainya —
 * URL Redis dapat memuat sandi.
 */
export function readRedisConfig(
    env: NodeJS.ProcessEnv = process.env,
): RedisConfig {
    return parseRedisEnv(env);
}

/**
 * Membuat klien baru.
 *
 * `maxRetriesPerRequest: null` diwajibkan BullMQ: tanpanya, perintah yang
 * menunggu pekerjaan (blocking) akan dibatalkan klien di tengah jalan dan worker
 * berhenti memungut job tanpa satu pun galat yang menandainya.
 */
export function createRedis(config: RedisConfig): Redis {
    return new Redis(config.url, {
        maxRetriesPerRequest: null,
        // Perintah tidak diantre saat koneksi terputus: lebih baik gagal cepat dan
        // terlihat daripada menumpuk diam-diam lalu terkirim ganda saat pulih.
        enableOfflineQueue: false,
    });
}

let instance: Redis | undefined;

/** Instance bersama seluruh proses, dibuat saat pertama diminta. */
export function getRedis(): Redis {
    instance ??= createRedis(readRedisConfig());
    return instance;
}

/** Menutup koneksi bersama. Dipanggil saat proses berhenti (drain, `SDD-16 §5`). */
export async function closeRedis(): Promise<void> {
    const klien = instance;
    instance = undefined;
    await klien?.quit();
}
