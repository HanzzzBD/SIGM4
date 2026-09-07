// Acceptance PR-00-07: "1.000 permintaan paralel menghasilkan 1.000 nomor unik".
//
// Jaminan ini berasal dari basis data, bukan dari kode kita — ON CONFLICT DO UPDATE
// mengunci baris penghitung sampai transaksinya selesai. Karena itu ia tidak dapat
// dibuktikan dengan tiruan: uji ini menjalankan PostgreSQL nyata (SDD-REPO-11).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/shared/clock/index.js';
import { closeDb, createDb, readDatabaseConfig } from '../../src/shared/db/index.js';
import { DocumentNumberService, nomorSah } from '../../src/shared/numbering/index.js';
import { dbmate, kueri } from '../helpers/db.js';

const ADA_DB = process.env['DATABASE_URL'] !== undefined;

describe.skipIf(!ADA_DB)('DocumentNumberService terhadap PostgreSQL nyata', () => {
  const clock = new FixedClock(new Date('2026-09-07T02:31:44.812Z'));
  let db: ReturnType<typeof createDb>;
  let layanan: DocumentNumberService;

  beforeAll(() => {
    dbmate('up');
    // Pool cukup lebar agar 1.000 permintaan benar-benar bertumpuk di basis data,
    // bukan diserialisasi antrean koneksi sebelum sempat berlomba.
    db = createDb({ ...readDatabaseConfig(), poolSize: 20 });
    layanan = new DocumentNumberService(clock);
  });

  afterAll(async () => {
    await db.destroy();
    await closeDb();
  });

  beforeEach(async () => {
    await kueri('DELETE FROM document_counters');
  });

  it('menerbitkan nomor berformat SEQ-01 dan lolos SEQ-04', async () => {
    const nomor = await layanan.next(db, 'RSV-RG');
    expect(nomor).toBe('RSV-RG-2026-0001');
    expect(nomorSah(nomor)).toBe(true);
  });

  it('menaikkan urutan per pemanggilan', async () => {
    const hasil = [
      await layanan.next(db, 'PJM'),
      await layanan.next(db, 'PJM'),
      await layanan.next(db, 'PJM'),
    ];
    expect(hasil).toEqual(['PJM-2026-0001', 'PJM-2026-0002', 'PJM-2026-0003']);
  });

  it('setiap prefiks punya penghitung sendiri', async () => {
    await layanan.next(db, 'PJM');
    await layanan.next(db, 'PJM');
    expect(await layanan.next(db, 'KRS')).toBe('KRS-2026-0001');
    expect(await layanan.next(db, 'PMB')).toBe('PMB-2026-0001');
  });

  it('urutan direset per tahun anggaran (SEQ-01, AC-YR-04)', async () => {
    const clock2027 = new FixedClock(new Date('2027-01-01T00:00:00.000Z'));
    const layanan2027 = new DocumentNumberService(clock2027);
    await layanan.next(db, 'WO');
    await layanan.next(db, 'WO');
    expect(await layanan2027.next(db, 'WO')).toBe('WO-2027-0001');
    // Tahun lama tidak terganggu.
    expect(await layanan.next(db, 'WO')).toBe('WO-2026-0003');
  });

  it('menolak prefiks di luar SEQ-04 alih-alih menerbitkan nomor tak sah', async () => {
    await expect(
      layanan.next(db, 'ABC' as unknown as Parameters<typeof layanan.next>[1]),
    ).rejects.toThrow(/tidak dikenal/);
  });

  it('gap-tolerant: transaksi yang dibatalkan tidak memakai ulang nomornya (SEQ-03)', async () => {
    const pertama = await layanan.next(db, 'HPS');
    // Nomor diterbitkan lalu transaksinya gagal — kenaikan penghitung ikut batal,
    // TETAPI nomor berikutnya tidak boleh mengulang nomor yang sudah pernah dipakai
    // di transaksi yang BERHASIL.
    await db
      .transaction()
      .execute(async (tx) => {
        await layanan.next(tx, 'HPS');
        throw new Error('batal');
      })
      .catch(() => undefined);
    const berikutnya = await layanan.next(db, 'HPS');
    expect(pertama).toBe('HPS-2026-0001');
    expect(berikutnya).not.toBe(pertama);
    expect(nomorSah(berikutnya)).toBe(true);
  });

  it(
    '1.000 permintaan PARALEL menghasilkan 1.000 nomor UNIK dan berurutan tanpa lompatan',
    async () => {
      const JUMLAH = 1000;
      const hasil = await Promise.all(
        Array.from({ length: JUMLAH }, () => layanan.next(db, 'PGD')),
      );

      expect(hasil).toHaveLength(JUMLAH);
      expect(new Set(hasil).size).toBe(JUMLAH);
      expect(hasil.every((n) => nomorSah(n))).toBe(true);

      // Seluruhnya commit, jadi tidak boleh ada lompatan: 1..1000 tepat sekali.
      const urut = hasil.map((n) => Number(n.split('-').at(-1))).sort((a, b) => a - b);
      expect(urut[0]).toBe(1);
      expect(urut.at(-1)).toBe(JUMLAH);
      expect(urut).toEqual(Array.from({ length: JUMLAH }, (_, i) => i + 1));

      const baris = await kueri<{ value: string }>(
        "SELECT value FROM document_counters WHERE prefix = 'PGD' AND year = 2026",
      );
      expect(baris[0]?.value).toBe(String(JUMLAH));
    },
    120_000,
  );

  it('paralel lintas prefiks tidak saling mengganggu', async () => {
    const prefiks = ['RSV-RG', 'RSV-BR', 'PJM', 'KRS'] as const;
    const hasil = await Promise.all(
      prefiks.flatMap((p) => Array.from({ length: 50 }, () => layanan.next(db, p))),
    );
    for (const p of prefiks) {
      const milikNya = hasil.filter((n) => n.startsWith(`${p}-`));
      expect(milikNya).toHaveLength(50);
      expect(new Set(milikNya).size).toBe(50);
    }
  });
});
