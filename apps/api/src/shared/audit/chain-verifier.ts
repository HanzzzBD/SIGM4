// Verifikasi rantai hash dan pemeliharaan partisi (NFR-S-03d, AL-03a,
// SDD-05 §4.4). Dijalankan job harian di worker; kegagalannya memicu alarm
// (`OBS-05`).
//
// Rantai hanya perlu DIVERIFIKASI, tidak diperbaiki: memperbaikinya berarti
// menulis ulang hash atas isi yang sudah berubah, yang persis menghapus bukti
// yang hendak dijaga.

import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Clock } from '../clock/index.js';
import type { Database } from '../db/index.js';
import type { BarisKanonik } from './canonical.js';
import { hashBaris } from './canonical.js';

/** Berapa bulan ke depan partisinya dijaga tersedia. */
export const BULAN_PARTISI_KE_DEPAN = 3;

export interface KerusakanRantai {
  readonly id: string;
  readonly waktu: Date;
  /** `prev_hash` tidak cocok dengan `row_hash` entri sebelumnya. */
  readonly jenis: 'RANTAI_PUTUS' | 'ISI_BERUBAH';
}

export interface HasilVerifikasi {
  readonly diperiksa: number;
  readonly kerusakan: readonly KerusakanRantai[];
}

interface BarisTerverifikasi {
  id: string;
  waktu: Date;
  user_id: string | null;
  user_nama: string | null;
  role: string | null;
  ip: string | null;
  user_agent: string | null;
  modul: string;
  aksi: string;
  entitas: string | null;
  entitas_id: string | null;
  nilai_sebelum: unknown;
  nilai_sesudah: unknown;
  keterangan: string | null;
  hasil: string;
  request_id: string | null;
  prev_hash: Buffer | null;
  row_hash: Buffer;
}

function keKanonik(b: BarisTerverifikasi): BarisKanonik {
  return {
    waktu: b.waktu,
    user_id: b.user_id === null ? null : Number(b.user_id),
    user_nama: b.user_nama,
    role: b.role,
    ip: b.ip,
    user_agent: b.user_agent,
    modul: b.modul,
    aksi: b.aksi,
    entitas: b.entitas,
    entitas_id: b.entitas_id === null ? null : Number(b.entitas_id),
    nilai_sebelum: b.nilai_sebelum ?? null,
    nilai_sesudah: b.nilai_sesudah ?? null,
    keterangan: b.keterangan,
    hasil: b.hasil,
    request_id: b.request_id,
  };
}

/**
 * Memverifikasi rantai atas rentang waktu tertentu.
 *
 * Rantainya **satu untuk seluruh tabel** (`SDD-05 §4.4`), jadi verifikasi sebuah
 * partisi membawa hash batas dari entri sebelum rentang — tanpanya, entri
 * pertama tiap bulan akan selalu tampak putus.
 */
export async function verifyChain(
  db: Kysely<Database>,
  dari: Date,
  sampai: Date,
): Promise<HasilVerifikasi> {
  const batas = await sql<{ row_hash: Buffer }>`
    SELECT row_hash FROM activity_logs WHERE waktu < ${dari} ORDER BY id DESC LIMIT 1
  `.execute(db);

  const baris = await sql<BarisTerverifikasi>`
    SELECT id, waktu, user_id, user_nama, role, ip, user_agent, modul, aksi,
           entitas, entitas_id, nilai_sebelum, nilai_sesudah, keterangan,
           hasil::text AS hasil, request_id, prev_hash, row_hash
      FROM activity_logs
     WHERE waktu >= ${dari} AND waktu < ${sampai}
     ORDER BY id
  `.execute(db);

  const kerusakan: KerusakanRantai[] = [];
  let sebelumnya: Buffer | null = batas.rows[0]?.row_hash ?? null;

  for (const b of baris.rows) {
    const prev = b.prev_hash;
    // Dua kerusakan yang berbeda dan sengaja dibedakan: rantai putus berarti
    // ada entri yang DIHAPUS atau disisipkan; isi berubah berarti sebuah baris
    // DISUNTING di tempatnya.
    if (!samaHash(prev, sebelumnya)) {
      kerusakan.push({ id: b.id, waktu: b.waktu, jenis: 'RANTAI_PUTUS' });
    } else if (!hashBaris(prev, keKanonik(b)).equals(b.row_hash)) {
      kerusakan.push({ id: b.id, waktu: b.waktu, jenis: 'ISI_BERUBAH' });
    }
    sebelumnya = b.row_hash;
  }

  return { diperiksa: baris.rows.length, kerusakan };
}

function samaHash(a: Buffer | null, b: Buffer | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/**
 * Memastikan partisi bulan berjalan dan beberapa bulan ke depan ada.
 *
 * Idempoten (`JOB-03`). Pencabutan hak diulang untuk setiap partisi baru: `AL-03b`
 * pada tabel induk tidak menutup partisinya, sebab PostgreSQL memeriksa hak pada
 * relasi yang benar-benar disebut kueri.
 */
export async function ensurePartitions(
  db: Kysely<Database>,
  clock: Clock,
  bulanKeDepan = BULAN_PARTISI_KE_DEPAN,
): Promise<readonly string[]> {
  const dibuat: string[] = [];
  const awal = clock.now();

  for (let i = 0; i <= bulanKeDepan; i += 1) {
    const dari = new Date(Date.UTC(awal.getUTCFullYear(), awal.getUTCMonth() + i, 1));
    const sampai = new Date(Date.UTC(awal.getUTCFullYear(), awal.getUTCMonth() + i + 1, 1));
    const nama = `activity_logs_${dari.getUTCFullYear()}_${String(dari.getUTCMonth() + 1).padStart(2, '0')}`;

    // `sql.lit`, bukan bind parameter: DDL tidak menerima parameter sama sekali
    // (`bind message supplies 2 parameters, but prepared statement requires 0`).
    // Aman di sini karena kedua nilainya diturunkan dari `Date`, bukan dari
    // masukan pemanggil.
    await sql`
      CREATE TABLE IF NOT EXISTS ${sql.ref(nama)}
        PARTITION OF activity_logs
        FOR VALUES FROM (${sql.lit(dari.toISOString())}) TO (${sql.lit(sampai.toISOString())})
    `.execute(db);
    await sql`REVOKE UPDATE, DELETE, TRUNCATE ON ${sql.ref(nama)} FROM sigm4_app`.execute(db);
    dibuat.push(nama);
  }

  return dibuat;
}
