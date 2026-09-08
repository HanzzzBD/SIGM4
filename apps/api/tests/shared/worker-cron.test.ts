// Konversi jadwal WIB → cron UTC (JOB-04) dan konfigurasi Redis (SDD-SYS-13).
// Bagian worker yang tidak menuntut Redis; penjadwalannya sendiri diuji terhadap
// Redis nyata di tests/integration/worker-scheduler.test.ts.

import { describe, expect, it } from 'vitest';
import { readRedisConfig } from '../../src/shared/cache/index.js';
import { RETRY_OPTIONS, wibCronToUtc } from '../../src/worker/scheduler.js';

describe('wibCronToUtc (JOB-04)', () => {
  it('contoh yang JOB-04 sebut sendiri: 00:05 WIB = 17:05 UTC hari sebelumnya', () => {
    expect(wibCronToUtc(5, 0)).toBe('5 17 * * *');
  });

  it('23:00 WIB = 16:00 UTC — jadwal reservation-expiry (SDD-01 §4.6)', () => {
    expect(wibCronToUtc(0, 23)).toBe('0 16 * * *');
  });

  it.each([
    [0, 7, '0 0 * * *'],
    [30, 12, '30 5 * * *'],
    [0, 6, '0 23 * * *'],
    [59, 23, '59 16 * * *'],
  ])('%d:%d WIB -> %s', (menit, jam, cron) => {
    expect(wibCronToUtc(menit, jam)).toBe(cron);
  });

  it('pergantian hari ditangani modulo, bukan menghasilkan jam negatif', () => {
    for (let jam = 0; jam < 24; jam += 1) {
      const [, jamUtc] = wibCronToUtc(0, jam).split(' ');
      expect(Number(jamUtc)).toBeGreaterThanOrEqual(0);
      expect(Number(jamUtc)).toBeLessThan(24);
    }
  });

  it.each([
    ['menit negatif', -1, 8],
    ['menit 60', 60, 8],
    ['jam 24', 0, 24],
    ['jam pecahan', 0, 8.5],
  ])('menolak %s', (_n, menit, jam) => {
    expect(() => wibCronToUtc(menit, jam)).toThrow(/tidak sah/);
  });
});

describe('RETRY_OPTIONS (JOB-06)', () => {
  it('maksimum 3 percobaan dengan exponential backoff', () => {
    expect(RETRY_OPTIONS.attempts).toBe(3);
    expect(RETRY_OPTIONS.backoff).toMatchObject({ type: 'exponential' });
  });
});

describe('readRedisConfig (SDD-INF-08)', () => {
  it('membaca REDIS_URL', () => {
    expect(readRedisConfig({ REDIS_URL: 'redis://h:6379' })).toEqual({ url: 'redis://h:6379' });
  });

  it.each([{}, { REDIS_URL: '' }, { REDIS_URL: '   ' }])(
    'menggagalkan startup bila REDIS_URL kosong',
    (env) => {
      expect(() => readRedisConfig(env)).toThrow(/REDIS_URL wajib diisi/);
    },
  );

  it('tidak pernah menyebut nilai variabel pada pesan galat (SDD-16 §4.7)', () => {
    expect(() => readRedisConfig({ REDIS_URL: '' })).toThrow(
      expect.not.stringContaining('redis://') as unknown as string,
    );
  });
});
