// Acceptance PR-00-13: "Partisi bulan berjalan ada; rantai terverifikasi;
// akun app tanpa UPDATE/DELETE" (AL-01 … AL-08, AL-03a, AL-03b, NFR-S-03d,
// SDD-DB-07/09).
//
// Terhadap PostgreSQL nyata, dan ketiganya memang tidak dapat diuji selain di
// sana: partisi adalah bentuk skema, pencabutan hak adalah keputusan basis data,
// dan rantai hash baru bermakna setelah beberapa entri benar-benar tersimpan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { sql } from 'kysely';
import { createAuthContext } from '../../src/shared/auth/index.js';
import { AuditLogger, ensurePartitions, verifyChain } from '../../src/shared/audit/index.js';
import { FixedClock } from '../../src/shared/clock/index.js';
import { closeDb, createDb, readDatabaseConfig, withTransaction } from '../../src/shared/db/index.js';
import { dbmate, kueri } from '../helpers/db.js';

const ADA_DB = process.env['DATABASE_URL'] !== undefined;
const URL_APP = process.env['APP_DATABASE_URL'];

const ctx = createAuthContext({
  userId: 42,
  roleCode: 'PETUGAS_SARPRAS',
  scopes: new Map([['asset.update', 'all']]),
});

const bulanIni = (d: Date) =>
  `activity_logs_${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

describe.skipIf(!ADA_DB)('activity_logs terhadap PostgreSQL nyata', () => {
  let db: ReturnType<typeof createDb>;
  const clock = new FixedClock(new Date());
  let audit: AuditLogger;
  const gagal: unknown[] = [];

  beforeAll(() => {
    dbmate('up');
    db = createDb({ ...readDatabaseConfig(), poolSize: 10 });
    audit = new AuditLogger({ clock, onFailure: (_e, g) => gagal.push(g) });
  });

  afterAll(async () => {
    await db.destroy();
    await closeDb();
  });

  beforeEach(async () => {
    await kueri('DELETE FROM activity_logs');
    gagal.length = 0;
  });

  const entri = (ubah: Record<string, unknown> = {}) => ({
    modul: 'INVENTARIS',
    aksi: 'ASSET_CONDITION_CHANGED',
    entitas: 'assets',
    entitasId: 3021,
    nilaiSebelum: { kondisi: 'BAIK' },
    nilaiSesudah: { kondisi: 'RUSAK_RINGAN' },
    ...ubah,
  });

  const tulis = (n = 1, ubah: Record<string, unknown> = {}) =>
    withTransaction(
      ctx,
      async (scope) => {
        for (let i = 0; i < n; i += 1) await audit.write(scope, entri({ ...ubah, entitasId: i }));
      },
      db,
    );

  // ---- Partisi (SDD-DB-07) -------------------------------------------------

  it('partisi bulan berjalan ADA sejak migration', async () => {
    const ada = await kueri<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE tablename = '${bulanIni(new Date())}'`,
    );
    expect(ada).toHaveLength(1);
  });

  it('tabelnya benar-benar terpartisi RANGE, bukan tabel biasa', async () => {
    const p = await kueri<{ partstrat: string }>(
      `SELECT partstrat FROM pg_partitioned_table pt
         JOIN pg_class c ON c.oid = pt.partrelid WHERE c.relname = 'activity_logs'`,
    );
    expect(p[0]?.partstrat).toBe('r');
  });

  it('ensurePartitions idempoten dan menyiapkan tiga bulan ke depan (JOB-03)', async () => {
    const pertama = await ensurePartitions(db, clock);
    const kedua = await ensurePartitions(db, clock);
    expect(pertama).toEqual(kedua);
    expect(pertama).toHaveLength(4);

    const ada = await kueri<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_tables WHERE tablename = ANY(ARRAY['${pertama.join("','")}'])`,
    );
    expect(Number(ada[0]?.n)).toBe(4);
  });

  it('tidak ada indeks GIN pada isi jsonb (SDD-DB-09)', async () => {
    const gin = await kueri<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE tablename = 'activity_logs' AND indexdef ILIKE '%gin%'`,
    );
    expect(gin).toEqual([]);
  });

  // ---- Penulisan (AL-01, AL-04, AL-05, AL-06, AL-07) -----------------------

  it('AL-01 — entri tersimpan di dalam transaksi yang sama', async () => {
    await tulis();
    const baris = await kueri<{ modul: string; aksi: string; role: string; user_id: string }>(
      'SELECT modul, aksi, role, user_id FROM activity_logs',
    );
    expect(baris[0]).toMatchObject({
      modul: 'INVENTARIS',
      aksi: 'ASSET_CONDITION_CHANGED',
      role: 'PETUGAS_SARPRAS',
      user_id: '42',
    });
  });

  it('AL-01 — transaksi yang GAGAL tidak meninggalkan entri log', async () => {
    await expect(
      withTransaction(
        ctx,
        async (scope) => {
          await audit.write(scope, entri());
          throw new Error('bisnis gagal');
        },
        db,
      ),
    ).rejects.toThrow('bisnis gagal');

    const n = await kueri<{ n: string }>('SELECT count(*)::text AS n FROM activity_logs');
    expect(n[0]?.n).toBe('0');
  });

  it('AL-04 — nilai sebelum dan sesudah tersimpan terstruktur', async () => {
    await tulis();
    const b = await kueri<{ nilai_sebelum: unknown; nilai_sesudah: unknown }>(
      'SELECT nilai_sebelum, nilai_sesudah FROM activity_logs',
    );
    expect(b[0]?.nilai_sebelum).toEqual({ kondisi: 'BAIK' });
    expect(b[0]?.nilai_sesudah).toEqual({ kondisi: 'RUSAK_RINGAN' });
  });

  it('AL-05 — nilai sensitif tidak pernah tersimpan', async () => {
    await tulis(1, {
      nilaiSesudah: { password: 'rahasia123', totp_secret: 'JBSWY3DP', nama: 'Sari' },
    });
    const b = await kueri<{ nilai_sesudah: Record<string, unknown> }>(
      'SELECT nilai_sesudah FROM activity_logs',
    );
    expect(JSON.stringify(b[0]?.nilai_sesudah)).not.toContain('rahasia123');
    expect(JSON.stringify(b[0]?.nilai_sesudah)).not.toContain('JBSWY3DP');
    expect(b[0]?.nilai_sesudah?.['nama']).toBe('Sari');
  });

  it('AL-06 — pekerjaan terjadwal tercatat berpelaku SYSTEM beserta namanya', async () => {
    await withTransaction(
      ctx,
      (scope) => audit.writeSystem(scope.tx, 'activity-log-verify', entri()),
      db,
    );
    const b = await kueri<{ user_id: string | null; role: string; keterangan: string }>(
      'SELECT user_id, role, keterangan FROM activity_logs',
    );
    expect(b[0]?.user_id).toBeNull();
    expect(b[0]?.role).toBe('SYSTEM');
    expect(b[0]?.keterangan).toContain('activity-log-verify');
  });

  it('AL-07 — operasi yang gagal tetap dicatat dengan hasil GAGAL', async () => {
    await withTransaction(
      ctx,
      (scope) => audit.write(scope, entri({ hasil: 'GAGAL', keterangan: 'saldo tidak cukup' })),
      db,
    );
    const b = await kueri<{ hasil: string }>('SELECT hasil FROM activity_logs');
    expect(b[0]?.hasil).toBe('GAGAL');
  });

  it('AL-08 — kegagalan tulis log TIDAK menggagalkan transaksi bisnis', async () => {
    const hasil = await withTransaction(
      ctx,
      async (scope) => {
        // `modul` NOT NULL dilanggar dengan sengaja: INSERT-nya gagal.
        const tercatat = await audit.write(scope, entri({ modul: null as unknown as string }));

        // Kueri lanjutan dijalankan pada TRANSAKSI YANG SAMA, bukan koneksi lain.
        // Di sinilah AL-08 benar-benar diuji: tanpa SAVEPOINT, INSERT yang gagal
        // membatalkan transaksi (25P02) dan pernyataan ini ikut gagal.
        const lanjut = await sql<{ n: number }>`SELECT 1 AS n`.execute(scope.tx);

        // Dan pekerjaan bisnisnya benar-benar dapat diselesaikan sesudahnya.
        await scope.tx
          .insertInto('document_counters')
          .values({ prefix: 'UJI-AL08', year: 2026, value: 1 })
          .onConflict((oc) => oc.columns(['prefix', 'year']).doNothing())
          .execute();

        return { tercatat, lanjut: lanjut.rows.length };
      },
      db,
    );

    expect(hasil.tercatat).toBe(false);
    expect(hasil.lanjut).toBe(1);
    expect(gagal).toHaveLength(1); // alarm, bukan rollback

    // Transaksi bisnisnya commit meski lognya gagal.
    const tersimpan = await kueri<{ n: string }>(
      `SELECT count(*)::text AS n FROM document_counters WHERE prefix = 'UJI-AL08'`,
    );
    expect(tersimpan[0]?.n).toBe('1');
    await kueri(`DELETE FROM document_counters WHERE prefix = 'UJI-AL08'`);
  });

  // ---- Rantai hash (AL-03a, NFR-S-03d) ------------------------------------

  it('entri pertama ber-prev_hash NULL; sesudahnya menunjuk entri sebelumnya', async () => {
    await tulis(3);
    const b = await kueri<{ prev_hash: Buffer | null; row_hash: Buffer }>(
      'SELECT prev_hash, row_hash FROM activity_logs ORDER BY id',
    );
    expect(b[0]?.prev_hash).toBeNull();
    expect(b[1]?.prev_hash).toEqual(b[0]?.row_hash);
    expect(b[2]?.prev_hash).toEqual(b[1]?.row_hash);
  });

  it('rantai utuh terverifikasi bersih', async () => {
    await tulis(5);
    const hasil = await verifyChain(db, batasBawah(), batasAtas());
    expect(hasil.diperiksa).toBe(5);
    expect(hasil.kerusakan).toEqual([]);
  });

  it('penyuntingan LANGSUNG di basis data terdeteksi sebagai ISI_BERUBAH', async () => {
    await tulis(3);
    // Dilakukan sebagai pemilik tabel — persis skenario AL-03a: akses langsung
    // ke basis data berada di luar kendali aplikasi.
    await kueri(`UPDATE activity_logs SET keterangan = 'disunting diam-diam'
                  WHERE id = (SELECT min(id) FROM activity_logs)`);

    const hasil = await verifyChain(db, batasBawah(), batasAtas());
    expect(hasil.kerusakan.map((k) => k.jenis)).toContain('ISI_BERUBAH');
  });

  it('penghapusan satu entri di tengah terdeteksi sebagai RANTAI_PUTUS', async () => {
    await tulis(4);
    await kueri(`DELETE FROM activity_logs
                  WHERE id = (SELECT id FROM activity_logs ORDER BY id OFFSET 1 LIMIT 1)`);

    const hasil = await verifyChain(db, batasBawah(), batasAtas());
    expect(hasil.kerusakan.map((k) => k.jenis)).toContain('RANTAI_PUTUS');
  });

  it('penulisan PARALEL tidak membuat rantai bercabang', async () => {
    await Promise.all(Array.from({ length: 12 }, () => tulis(1)));

    const b = await kueri<{ prev_hash: Buffer | null }>(
      'SELECT prev_hash FROM activity_logs ORDER BY id',
    );
    const jejak = b.map((r) => r.prev_hash?.toString('hex') ?? 'NULL');
    // Rantai bercabang akan menghasilkan prev_hash yang sama pada dua entri.
    expect(new Set(jejak).size).toBe(jejak.length);

    const hasil = await verifyChain(db, batasBawah(), batasAtas());
    expect(hasil.kerusakan).toEqual([]);
  });
});

// ---- AL-03b: hak akun aplikasi ------------------------------------------

// Digantung pada ADA_DB saja, BUKAN pada APP_DATABASE_URL. Menggantungnya pada
// variabel sendiri membuat acceptance ini ter-skip diam-diam ketika lingkungannya
// belum lengkap — dan acceptance yang hijau tanpa pernah dijalankan lebih
// berbahaya daripada yang merah.
describe.skipIf(!ADA_DB)('AL-03b — hak akun aplikasi', () => {
  let app: pg.Client;

  beforeAll(async () => {
    if (URL_APP === undefined) return;
    dbmate('up');
    app = new pg.Client({ connectionString: URL_APP });
    await app.connect();
  });

  // Sebagai UJI, bukan sebagai beforeAll: `beforeAll` yang melempar membuat
  // Vitest menandai seluruh suite SKIPPED, dan acceptance yang hijau tanpa
  // pernah dijalankan lebih berbahaya daripada yang merah.
  it('lingkungannya lengkap — APP_DATABASE_URL ada saat DATABASE_URL ada', () => {
    expect(
      URL_APP,
      'APP_DATABASE_URL wajib diisi: acceptance AL-03b menuntut koneksi sebagai akun ' +
        'aplikasi. Sandinya disetel jalur migration lewat APP_DB_PASSWORD.',
    ).toBeDefined();
  });

  afterAll(async () => {
    await app?.end();
  });

  it('boleh INSERT dan SELECT', async () => {
    await app.query(
      `INSERT INTO activity_logs (waktu, modul, aksi, hasil, row_hash)
       VALUES (now(), $1, $2, $3, $4)`,
      ['INVENTARIS', 'ASSET_CREATED', 'SUKSES', Buffer.from('uji')],
    );
    await expect(app.query('SELECT count(*) FROM activity_logs')).resolves.toBeDefined();
  });

  it.each([
    ['UPDATE induk', `UPDATE activity_logs SET modul = 'X'`],
    ['DELETE induk', 'DELETE FROM activity_logs'],
    ['TRUNCATE', 'TRUNCATE activity_logs'],
  ])('%s ditolak 42501', async (_n, sql) => {
    await expect(app.query(sql)).rejects.toMatchObject({ code: '42501' });
  });

  it('UPDATE langsung ke PARTISI juga ditolak — bukan hanya lewat induknya', async () => {
    // Pencabutan pada induk TIDAK menutup partisinya; ini uji yang membuktikan
    // migration benar-benar mencabut keduanya.
    const nama = bulanIni(new Date());
    await expect(app.query(`UPDATE ${nama} SET modul = 'X'`)).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('DDL ditolak seluruhnya (SEC-CFG-03)', async () => {
    await expect(app.query('CREATE TABLE coba_ddl (id int)')).rejects.toMatchObject({
      code: '42501',
    });
  });
});

function batasBawah(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
}

function batasAtas(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1));
}
