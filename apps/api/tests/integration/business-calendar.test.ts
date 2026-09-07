// Acceptance PR-00-08: "Hitung jam kerja melewati akhir pekan & hari libur benar".
//
// Diuji terhadap PostgreSQL nyata karena `SDD-APR-06` menyatakan service ini
// MEMBACA `work_days` + `holidays` — menirunya berarti menguji tiruan, bukan
// perilaku yang akan berjalan.
//
// Seluruh tanggal ditulis dalam UTC dan dibaca sebagai WIB (UTC+7) — `CAL-03`
// menetapkan batas hari ditentukan di WIB meski disimpan UTC. 2026-09-07 adalah
// hari Senin, sehingga contoh di bawah dapat ditelusuri tanpa kalender di tangan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  BusinessCalendarService,
  DEFAULT_OPERATING_HOURS,
} from '../../src/shared/calendar/index.js';
import { closeDb, createDb, readDatabaseConfig } from '../../src/shared/db/index.js';
import { dbmate, kueri } from '../helpers/db.js';

const ADA_DB = process.env['DATABASE_URL'] !== undefined;

/** Jam WIB → instan UTC. `2026-09-07 08:00 WIB` = `2026-09-07T01:00:00Z`. */
function wib(iso: string): Date {
  return new Date(`${iso}+07:00`);
}

/** Kembali ke teks WIB agar harapan uji terbaca seperti jam dinding sekolah. */
function asWib(d: Date): string {
  return new Date(d.getTime() + 7 * 60 * 60_000).toISOString().replace('.000Z', '').replace('T', ' ');
}

describe.skipIf(!ADA_DB)('BusinessCalendarService terhadap PostgreSQL nyata', () => {
  let db: ReturnType<typeof createDb>;
  const kalender = new BusinessCalendarService();

  beforeAll(() => {
    dbmate('up');
    db = createDb(readDatabaseConfig());
  });

  afterAll(async () => {
    await db.destroy();
    await closeDb();
  });

  beforeEach(async () => {
    await kueri('DELETE FROM holidays');
    await kueri('DELETE FROM work_days');
    // Bawaan Lampiran E.2: Senin–Sabtu aktif, Minggu tidak.
    await kueri(`
      INSERT INTO work_days (hari, aktif) VALUES
        (1,true),(2,true),(3,true),(4,true),(5,true),(6,true),(7,false)
    `);
  });

  describe('jam operasional', () => {
    it('bawaannya Senin–Sabtu 06.00–18.00 WIB (SDD-APR-15)', () => {
      expect(DEFAULT_OPERATING_HOURS).toEqual({ startMinute: 360, endMinute: 1080 });
    });

    it('menolak jam operasional terbalik', () => {
      expect(() => new BusinessCalendarService({ startMinute: 600, endMinute: 480 })).toThrow(
        /tidak valid/,
      );
    });
  });

  describe('isWorkingDay', () => {
    it('Senin adalah hari kerja', async () => {
      expect(await kalender.isWorkingDay(db, wib('2026-09-07T09:00:00'))).toBe(true);
    });

    it('Minggu bukan hari kerja — `work_days` menonaktifkannya', async () => {
      expect(await kalender.isWorkingDay(db, wib('2026-09-13T09:00:00'))).toBe(false);
    });

    it('hari libur bukan hari kerja meski jatuh pada hari aktif', async () => {
      await kueri(
        "INSERT INTO holidays (tanggal, nama, jenis) VALUES ('2026-09-08','Maulid Nabi','NASIONAL')",
      );
      expect(await kalender.isWorkingDay(db, wib('2026-09-08T09:00:00'))).toBe(false);
    });

    it('batas hari ditentukan di WIB, bukan UTC (CAL-03)', async () => {
      await kueri(
        "INSERT INTO holidays (tanggal, nama, jenis) VALUES ('2026-09-08','Maulid Nabi','NASIONAL')",
      );
      // 2026-09-07T20:00Z masih 7 September di UTC, tetapi sudah 8 September di WIB.
      expect(await kalender.isWorkingDay(db, new Date('2026-09-07T20:00:00Z'))).toBe(false);
      expect(await kalender.isWorkingDay(db, new Date('2026-09-07T10:00:00Z'))).toBe(true);
    });
  });

  describe('addWorkingHours — CAL-01', () => {
    it('menambah di dalam hari yang sama', async () => {
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T08:00:00'), 3);
      expect(asWib(hasil)).toBe('2026-09-07 11:00:00');
    });

    it('berhenti tepat di jam tutup', async () => {
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T06:00:00'), 12);
      expect(asWib(hasil)).toBe('2026-09-07 18:00:00');
    });

    it('melimpah ke hari berikutnya, bukan ke malam hari', async () => {
      // Mulai 16.00, sisa 2 jam hari ini; 1 jam sisanya jatuh ke esok 06.00–07.00.
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T16:00:00'), 3);
      expect(asWib(hasil)).toBe('2026-09-08 07:00:00');
    });

    it('mulai sebelum jam buka: hitungan mulai saat operasional dibuka', async () => {
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T04:00:00'), 2);
      expect(asWib(hasil)).toBe('2026-09-07 08:00:00');
    });

    it('mulai setelah jam tutup: hitungan mulai esok pagi', async () => {
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T21:00:00'), 2);
      expect(asWib(hasil)).toBe('2026-09-08 08:00:00');
    });

    it('MELEWATI AKHIR PEKAN — Minggu tidak menambah hitungan', async () => {
      // Sabtu 2026-09-12 pukul 17.00, sisa 1 jam. Tambah 3 jam:
      // 1 jam Sabtu, lalu Minggu dilewati, sisa 2 jam jatuh Senin 06.00–08.00.
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-12T17:00:00'), 3);
      expect(asWib(hasil)).toBe('2026-09-14 08:00:00');
    });

    it('MELEWATI HARI LIBUR — hari libur tidak menambah hitungan', async () => {
      await kueri(
        "INSERT INTO holidays (tanggal, nama, jenis) VALUES ('2026-09-08','Maulid Nabi','NASIONAL')",
      );
      // Senin 17.00, sisa 1 jam. Selasa libur. Sisa 2 jam jatuh Rabu 06.00–08.00.
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T17:00:00'), 3);
      expect(asWib(hasil)).toBe('2026-09-09 08:00:00');
    });

    it('melewati akhir pekan DAN hari libur berturut-turut', async () => {
      await kueri(`
        INSERT INTO holidays (tanggal, nama, jenis) VALUES
          ('2026-09-14','Cuti Bersama','CUTI_BERSAMA'),
          ('2026-09-15','Cuti Bersama','CUTI_BERSAMA')
      `);
      // Sabtu 17.00 (sisa 1 jam) → Minggu libur pekanan → Senin & Selasa cuti
      // bersama → sisa 2 jam jatuh Rabu 06.00–08.00.
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-12T17:00:00'), 3);
      expect(asWib(hasil)).toBe('2026-09-16 08:00:00');
    });

    it('SLA 24 jam kerja = dua hari kerja penuh (DEFAULT_RULE, RE-06)', async () => {
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T06:00:00'), 24);
      expect(asWib(hasil)).toBe('2026-09-08 18:00:00');
    });

    it('nol jam mengembalikan saat yang sama bila sedang jam kerja', async () => {
      const hasil = await kalender.addWorkingHours(db, wib('2026-09-07T09:00:00'), 0);
      expect(asWib(hasil)).toBe('2026-09-07 09:00:00');
    });

    it('menolak jumlah jam negatif', async () => {
      await expect(kalender.addWorkingHours(db, wib('2026-09-07T09:00:00'), -1)).rejects.toThrow(
        /non-negatif/,
      );
    });

    it('gagal terang-terangan bila tidak ada satu pun hari kerja', async () => {
      await kueri('UPDATE work_days SET aktif = false');
      await expect(kalender.addWorkingHours(db, wib('2026-09-07T09:00:00'), 1)).rejects.toThrow(
        /work_days/,
      );
    });
  });

  describe('workingMinutesBetween — CAL-01', () => {
    it('menghitung hanya menit di dalam jam operasional', async () => {
      const menit = await kalender.workingMinutesBetween(
        db,
        wib('2026-09-07T04:00:00'),
        wib('2026-09-07T20:00:00'),
      );
      expect(menit).toBe(12 * 60); // 06.00–18.00 saja
    });

    it('tidak menghitung akhir pekan maupun hari libur', async () => {
      await kueri(
        "INSERT INTO holidays (tanggal, nama, jenis) VALUES ('2026-09-14','Cuti','CUTI_BERSAMA')",
      );
      // Sabtu 06.00 → Selasa 18.00: Sabtu 12j + Minggu 0 + Senin libur 0 + Selasa 12j
      const menit = await kalender.workingMinutesBetween(
        db,
        wib('2026-09-12T06:00:00'),
        wib('2026-09-15T18:00:00'),
      );
      expect(menit).toBe(24 * 60);
    });

    it('nol bila urutan terbalik atau sama', async () => {
      expect(
        await kalender.workingMinutesBetween(db, wib('2026-09-07T10:00:00'), wib('2026-09-07T09:00:00')),
      ).toBe(0);
    });

    it('kebalikan addWorkingHours pada rentang yang sama', async () => {
      const mulai = wib('2026-09-11T15:00:00'); // Jumat sore
      const tenggat = await kalender.addWorkingHours(db, mulai, 5);
      expect(await kalender.workingMinutesBetween(db, mulai, tenggat)).toBe(5 * 60);
    });
  });

  describe('countCalendarDays — CAL-02, BR-028c', () => {
    it('menghitung hari KALENDER secara bawaan, termasuk akhir pekan', async () => {
      const hari = await kalender.countCalendarDays(
        db,
        wib('2026-09-11T10:00:00'), // Jumat
        wib('2026-09-15T10:00:00'), // Selasa
      );
      expect(hari).toBe(4);
    });

    it('mengecualikan libur & akhir pekan bila parameter BR-028c aktif', async () => {
      await kueri(
        "INSERT INTO holidays (tanggal, nama, jenis) VALUES ('2026-09-14','Cuti','CUTI_BERSAMA')",
      );
      // Jumat → Selasa: Sabtu(kerja) + Minggu(-) + Senin(libur) + Selasa(kerja) = 2
      const hari = await kalender.countCalendarDays(
        db,
        wib('2026-09-11T10:00:00'),
        wib('2026-09-15T10:00:00'),
        { excludeHolidays: true },
      );
      expect(hari).toBe(2);
    });

    it('batas hari memakai WIB, bukan UTC (CAL-03)', async () => {
      // 2026-09-07T18:00Z = 2026-09-08 01:00 WIB → sudah berganti hari di WIB.
      const hari = await kalender.countCalendarDays(
        db,
        new Date('2026-09-07T10:00:00Z'),
        new Date('2026-09-07T18:00:00Z'),
      );
      expect(hari).toBe(1);
    });
  });
});
