// Pembuktian dua kemampuan WAJIB jalur migration (SDD-DB-12), yang
// `logs/phase-00.md` §5 tuntut dilakukan justru di PR ini: "Nama yang dikunci
// tidak menggantikan pembuktian."
//
//   1. Advisory lock      — SDD-INF-03 menjalankan migration sebagai job terpisah;
//                           dua job yang berlomba harus diserialisasi. dbmate
//                           TIDAK menyediakannya (temuan 7 September 2026), jadi
//                           yang diuji di sini adalah pembungkus scripts/migrate.mjs.
//   2. Opt-out transaksi  — konsekuensi SDD-DB-02 (ALTER TYPE ... ADD VALUE) dan
//                           CREATE INDEX CONCURRENTLY pada tabel berisi data.
//                           Ini milik dbmate sendiri.
//
// Keduanya dibuktikan dengan migration percobaan yang ditulis, dijalankan, lalu
// dibuang — bukan dengan membaca dokumentasi.

import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DIR_MIGRATION, dbmate, dbmateAsync, kueri } from '../helpers/db.js';

const PROBE_LOCK = '9001_probe_advisory_lock.sql';
const PROBE_TABEL = '9002_probe_tabel.sql';
const PROBE_CONCURRENT = '9003_probe_concurrent.sql';
const SEMUA_PROBE = [PROBE_CONCURRENT, PROBE_TABEL, PROBE_LOCK];

function tulisProbe(nama: string, isi: string): void {
  writeFileSync(join(DIR_MIGRATION, nama), isi, 'utf8');
}

async function hitungAdvisoryLock(): Promise<number> {
  const rows = await kueri<{ n: string }>(
    "SELECT count(*)::text AS n FROM pg_locks WHERE locktype = 'advisory'",
  );
  return Number(rows[0]?.n ?? 0);
}

/** Berapa migration percobaan yang masih tercatat terpasang. */
async function probeTerpasang(): Promise<number> {
  const rows = await kueri<{ n: string }>(
    "SELECT count(*)::text AS n FROM schema_migrations WHERE version >= '9000'",
  );
  return Number(rows[0]?.n ?? 0);
}

describe.skipIf(process.env['DATABASE_URL'] === undefined)(
  'jalur migration — dua kemampuan wajib SDD-DB-12',
  () => {
    beforeAll(() => {
      dbmate('up');
    });

    afterAll(async () => {
      // Hanya probe yang dibatalkan; 0001/0002 tidak boleh ikut tersapu.
      for (let sisa = await probeTerpasang(); sisa > 0; sisa -= 1) dbmate('down');
      for (const nama of SEMUA_PROBE) rmSync(join(DIR_MIGRATION, nama), { force: true });
      dbmate('up');
    });

    it('memegang advisory lock selama migration berjalan (SDD-INF-03)', async () => {
      tulisProbe(PROBE_LOCK, '-- migrate:up\nSELECT pg_sleep(3);\n\n-- migrate:down\nSELECT 1;\n');
      expect(await hitungAdvisoryLock()).toBe(0);

      const selesai = dbmateAsync('up');

      // Diamati dari koneksi LAIN selagi migration masih berjalan. Tanpa kunci,
      // pg_locks tidak akan pernah memuat baris advisory milik siapa pun —
      // itulah persis yang terjadi saat dbmate dipanggil tanpa pembungkus.
      let terlihat = 0;
      for (let i = 0; i < 24 && terlihat === 0; i += 1) {
        await new Promise((r) => setTimeout(r, 250));
        terlihat = await hitungAdvisoryLock();
      }
      await selesai;

      expect(terlihat).toBeGreaterThan(0);
    });

    it('melepas advisory lock setelah migration selesai', async () => {
      expect(await hitungAdvisoryLock()).toBe(0);
    });

    it('membuka transaksi secara bawaan — CREATE INDEX CONCURRENTLY ditolak 25001', () => {
      // Kegagalan di sini justru yang membuktikan transaksi memang dibuka.
      // Satu pernyataan per migration disengaja: beberapa pernyataan dalam satu
      // perintah dibungkus transaksi implisit oleh PostgreSQL sendiri, sehingga
      // opt-out apa pun tidak akan menolongnya.
      tulisProbe(
        PROBE_TABEL,
        '-- migrate:up\nCREATE TABLE probe_tx (id bigserial PRIMARY KEY);\n\n' +
          '-- migrate:down\nDROP TABLE IF EXISTS probe_tx;\n',
      );
      tulisProbe(
        PROBE_CONCURRENT,
        '-- migrate:up\nCREATE INDEX CONCURRENTLY probe_tx_idx ON probe_tx (id);\n\n' +
          '-- migrate:down\nDROP INDEX IF EXISTS probe_tx_idx;\n',
      );

      let pesan = '';
      try {
        dbmate('up');
      } catch (galat) {
        pesan = String((galat as { stderr?: string; message?: string }).stderr ?? galat);
      }
      expect(pesan).toMatch(/25001|cannot run inside a transaction block/i);
    });

    it('menerima opt-out transaksi per-migration, lalu perintah yang sama berhasil', async () => {
      tulisProbe(
        PROBE_CONCURRENT,
        '-- migrate:up transaction:false\n' +
          'CREATE INDEX CONCURRENTLY probe_tx_idx ON probe_tx (id);\n\n' +
          '-- migrate:down transaction:false\nDROP INDEX IF EXISTS probe_tx_idx;\n',
      );
      dbmate('up');

      const rows = await kueri<{ indexname: string }>(
        "SELECT indexname FROM pg_indexes WHERE indexname = 'probe_tx_idx'",
      );
      expect(rows).toHaveLength(1);
    });
  },
);
