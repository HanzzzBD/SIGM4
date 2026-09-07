// Koneksi basis data: pool `pg` di bawah Kysely (SDD-DB-15).

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

/**
 * Bawaan pool. Nilai produksinya adalah `TBD-AVL-C` — dikalibrasi setelah uji beban
 * Phase 07-08 dan dibatasi tier langganan penyedia (SDD-16 §5), bukan ditebak di sini.
 */
const UKURAN_POOL_BAWAAN = 10;

export interface DatabaseConfig {
  readonly connectionString: string;
  readonly poolSize: number;
}

/**
 * Membaca konfigurasi dari variabel lingkungan (SDD-INF-08). Konfigurasi tidak
 * valid menggagalkan startup; pesannya menyebut NAMA variabel, tidak pernah
 * nilainya (SDD-16 §4.7).
 */
export function readDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const connectionString = env['DATABASE_URL']?.trim();
  if (!connectionString) {
    throw new Error('Variabel lingkungan DATABASE_URL wajib diisi (SDD-INF-08).');
  }

  const mentah = env['DB_POOL_SIZE']?.trim();
  if (mentah === undefined || mentah === '') {
    return { connectionString, poolSize: UKURAN_POOL_BAWAAN };
  }

  const poolSize = Number(mentah);
  if (!Number.isInteger(poolSize) || poolSize < 1) {
    throw new Error('Variabel lingkungan DB_POOL_SIZE harus bilangan bulat >= 1 (SDD-INF-08).');
  }
  return { connectionString, poolSize };
}

/** Membangun instance Kysely baru di atas pool `pg` sendiri. */
export function createDb(config: DatabaseConfig): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: config.connectionString, max: config.poolSize }),
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
