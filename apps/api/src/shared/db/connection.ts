// Koneksi basis data: pool `pg` di bawah Kysely (SDD-DB-15).

import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { parseDatabaseEnv } from "../config/index.js";
import type { DatabaseEnv } from "../config/index.js";
import type { Database } from "./schema.js";
import { OPSI_SESI_UTC } from "./timezone.js";

export type DatabaseConfig = DatabaseEnv;

/**
 * Membaca konfigurasi dari variabel lingkungan. Aturannya milik skema
 * `shared/config` (SDD-SYS-14), bukan ditulis ulang di sini.
 */
export function readDatabaseConfig(
    env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
    return parseDatabaseEnv(env);
}

/** Membangun instance Kysely baru di atas pool `pg` sendiri. */
export function createDb(config: DatabaseConfig): Kysely<Database> {
    return new Kysely<Database>({
        dialect: new PostgresDialect({
            pool: new pg.Pool({
                connectionString: config.connectionString,
                max: config.poolSize,
                // Setiap sesi dipaksa UTC, apa pun zona bawaan basis datanya (SDD-INF-09).
                options: OPSI_SESI_UTC,
            }),
        }),
    });
}

let instance: Kysely<Database> | undefined;

/**
 * Instance bersama seluruh proses. Dibuat saat pertama diminta, bukan saat modul
 * diimpor: mengimpor modul ini tidak boleh membuka koneksi, karena `api` dan
 * `worker` berbagi basis kode yang sama (SDD-SYS-08).
 */
export function getDb(): Kysely<Database> {
    instance ??= createDb(readDatabaseConfig());
    return instance;
}

/** Menutup pool bersama. Dipanggil saat proses berhenti (drain, SDD-16 §5). */
export async function closeDb(): Promise<void> {
    const db = instance;
    instance = undefined;
    await db?.destroy();
}
