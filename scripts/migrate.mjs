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

// Akun ber-DDL (SDD-16 §4.7, SEC-CFG-03). Jatuh kembali ke DATABASE_URL bila tidak
// diisi — kemudahan pengembangan yang di production ditutup sendirinya, sebab akun
// aplikasi memang tidak dapat menjalankan DDL.
const DATABASE_URL = (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
if (!DATABASE_URL) {
  // Sejalan dengan shared/db: sebut NAMA variabel, tidak pernah nilainya (SDD-16 §4.7).
  console.error('Variabel lingkungan MIGRATION_DATABASE_URL atau DATABASE_URL wajib diisi (SDD-INF-08).');
  process.exit(1);
}

/**
 * Sandi akun aplikasi, bila lingkungan menyediakannya.
 *
 * Tempatnya di sini karena inilah satu-satunya langkah ber-DDL yang dijalankan
 * (SDD-INF-03), dan `ALTER ROLE ... PASSWORD` menuntut hak itu. Nilainya TIDAK
 * pernah datang dari berkas di repositori: di production dari secret manager
 * (SEC-CFG-01), di pengembangan dari `.env` yang tidak ikut ter-commit. Bila
 * variabelnya kosong, langkah ini dilewati dan sandi role tidak disentuh.
 */
const APP_DB_PASSWORD = process.env.APP_DB_PASSWORD?.trim();

const argumen = [
  '--migrations-dir',
  'apps/api/migrations',
  '--no-dump-schema',
  ...process.argv.slice(2),
];

/** Literal SQL untuk sebuah string. Dipakai hanya pada sandi, yang tidak dapat diparameterkan. */
function literal(nilai) {
  return `'${nilai.replaceAll("'", "''")}'`;
}

/** Menjalankan dbmate sampai selesai; mengembalikan exit code-nya. */
function jalankanDbmate() {
  return new Promise((resolve, reject) => {
    // dbmate membaca DATABASE_URL sendiri; ia diberi URL yang SUDAH diselesaikan
    // di atas, sehingga MIGRATION_DATABASE_URL berlaku juga baginya.
    const anak = spawn(process.execPath, [CLI, ...argumen], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL },
    });
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

  if (kode === 0 && APP_DB_PASSWORD) {
    const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'sigm4_app'");
    if (rowCount) {
      // Nama role tidak dapat diparameterkan; ia tetapan, bukan masukan.
      await client.query(`ALTER ROLE sigm4_app PASSWORD ${literal(APP_DB_PASSWORD)}`);
    }
  }
} finally {
  // Kunci sesi terlepas sendiri saat koneksi ditutup; pelepasan eksplisit ada
  // agar keadaan tidak bergantung pada kapan pool menutup soketnya.
  await client.query('SELECT pg_advisory_unlock($1)', [KUNCI_MIGRATION]).catch(() => undefined);
  await client.end().catch(() => undefined);
}

process.exit(kode ?? 1);
