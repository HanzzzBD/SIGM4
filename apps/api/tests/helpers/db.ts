// Perkakas uji integrasi: menjalankan dbmate dan membuka koneksi ke PostgreSQL nyata.

import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { AKAR } from './bab113.js';

const CWD = fileURLToPath(AKAR);

// Yang dijalankan adalah PEMBUNGKUS-nya, bukan dbmate langsung: advisory lock
// hidup di sana (SDD-DB-12), sehingga uji yang memanggil dbmate polos akan
// menguji jalur yang tidak pernah dipakai siapa pun. Berkas .mjs dipanggil lewat
// process.execPath, bukan lewat `npx` — shim `.cmd` di Windows tidak dapat
// di-spawn tanpa shell.
const PEMBUNGKUS = fileURLToPath(new URL('scripts/migrate.mjs', AKAR));

/** Menjalankan jalur migration persis seperti npm script akar menjalankannya. */
export function dbmate(...argumen: string[]): string {
  return execFileSync(process.execPath, [PEMBUNGKUS, ...argumen], {
    cwd: CWD,
    encoding: 'utf8',
    env: process.env,
  });
}

/** Varian asinkron — dipakai saat migration harus diamati SELAGI berjalan. */
export function dbmateAsync(...argumen: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [PEMBUNGKUS, ...argumen], { cwd: CWD, env: process.env }, (galat) =>
      galat ? reject(galat) : resolve(),
    );
  });
}

/** Kueri sekali jalan lewat koneksi tersendiri, agar tidak berbagi state antar-uji. */
export async function kueri<T extends Record<string, unknown>>(sql: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  await client.connect();
  try {
    return (await client.query<T>(sql)).rows;
  } finally {
    await client.end();
  }
}

/** Direktori migration — uji kemampuan runner menulis migration percobaan ke sini. */
export const DIR_MIGRATION = fileURLToPath(new URL('apps/api/migrations/', AKAR));
