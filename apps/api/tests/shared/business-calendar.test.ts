// Kontrak jam operasional (SDD-APR-15) — bagian BusinessCalendarService yang tidak
// menuntut basis data. Perhitungannya sendiri diuji terhadap PostgreSQL nyata di
// tests/integration/business-calendar.test.ts, karena SDD-APR-06 menyatakan service
// ini MEMBACA work_days + holidays.

import { describe, expect, it } from 'vitest';
import {
  BusinessCalendarService,
  DEFAULT_OPERATING_HOURS,
} from '../../src/shared/calendar/index.js';

describe('DEFAULT_OPERATING_HOURS (SDD-APR-15)', () => {
  it('Senin–Sabtu 06.00–18.00 WIB — 06.00 = menit ke-360, 18.00 = menit ke-1080', () => {
    expect(DEFAULT_OPERATING_HOURS).toEqual({ startMinute: 360, endMinute: 1080 });
  });

  it('memberi 12 jam kerja per hari', () => {
    const { startMinute, endMinute } = DEFAULT_OPERATING_HOURS;
    expect((endMinute - startMinute) / 60).toBe(12);
  });
});

describe('BusinessCalendarService — jam operasional', () => {
  it('menerima jam operasional lain (CAL-01 menyebutnya terkonfigurasi)', () => {
    expect(() => new BusinessCalendarService({ startMinute: 480, endMinute: 900 })).not.toThrow();
  });

  it.each([
    ['terbalik', 900, 480],
    ['sama', 600, 600],
  ])('menolak jam operasional %s — kalender tanpa durasi tidak dapat maju', (_n, mulai, selesai) => {
    expect(() => new BusinessCalendarService({ startMinute: mulai, endMinute: selesai })).toThrow(
      /tidak valid/,
    );
  });
});
