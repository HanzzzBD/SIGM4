// Pembungkus advisory lock bagi dbmate (SDD-DB-12, SDD-INF-03).
//
// Mengapa ada berkas ini. `SDD-DB-12` mewajibkan dua kemampuan pada jalur
// migration: opt-out transaksi per-migration, dan advisory lock. Verifikasi
// `PR-00-05` menunjukkan dbmate 2.35.1 memenuhi yang pertama dan TIDAK memiliki
// yang kedua — `pg_locks` kosong sepanjang migration yang terbukti berjalan, dan
// CLI-nya tidak punya opsi lock. Yang dituntut `SDD-INF-03` adalah agar dua job
// migration tidak berlomba; itu syarat pada JALUR, bukan pada runner-nya. Berkas
// ini memegang kunci selama dbmate bekerja dan melepasnya sesudahnya.
//
// Ini bukan "runner buatan sendiri" yang `SDD-DB-12` tolak: urutan, tabel versi,
// checksum, dan eksekusi `down` seluruhnya tetap milik dbmate. Yang ditambahkan
// hanya satu kunci.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import pg from 'pg';

const require = createRequire(import.meta.url);
const CLI = require.resolve('dbmate/dist/cli.js');

/**
 * Kunci advisory. Nilai tetap, bukan hash nama basis data: seluruh proses yang
 * bermigrasi pada basis data ini wajib memakai angka yang sama, dan angka yang
 * dihitung dari sesuatu akan berubah diam-diam saat sesuatu itu berubah.
 */
const KUNCI_MIGRATION = 4_815_162_342;

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  // Sejalan dengan shared/db: sebut NAMA variabel, tidak pernah nilainya (SDD-16 §4.7).
  console.error('Variabel lingkungan DATABASE_URL wajib diisi (SDD-INF-08).');
  process.exit(1);
}

const argumen = [
  '--migrations-dir',
  'apps/api/migrations',
  '--no-dump-schema',
  ...process.argv.slice(2),
];

/** Menjalankan dbmate sampai selesai; mengembalikan exit code-nya. */
function jalankanDbmate() {
  return new Promise((resolve, reject) => {
    const anak = spawn(process.execPath, [CLI, ...argumen], { stdio: 'inherit' });
    anak.on('error', reject);
    anak.on('close', (kode) => resolve(kode ?? 1));
  });
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

let kode;
try {
  // Menunggu, bukan menyerah: job kedua yang datang saat job pertama masih
  // berjalan harus mendapat skema yang sudah lengkap, bukan galat (SDD-INF-03).
  await client.query('SELECT pg_advisory_lock($1)', [KUNCI_MIGRATION]);
  kode = await jalankanDbmate();
} finally {
  // Kunci sesi terlepas sendiri saat koneksi ditutup; pelepasan eksplisit ada
  // agar keadaan tidak bergantung pada kapan pool menutup soketnya.
  await client.query('SELECT pg_advisory_unlock($1)', [KUNCI_MIGRATION]).catch(() => undefined);
  await client.end().catch(() => undefined);
}

process.exit(kode ?? 1);
