// Acceptance PR-00-06 bagian kedua: "log ter-redact" (SDD-OBS-04),
// beserta bentuk entri SDD-15 §4.1 dan propagasi request_id SDD-OBS-03.

import { describe, expect, it } from 'vitest';
import { FixedClock } from '../../src/shared/clock/index.js';
import {
  DITUTUP,
  KUNCI_TERTUTUP,
  Logger,
  denganKonteks,
  konteksSaatIni,
  konteksTurunan,
  redact,
  requestIdBaru,
} from '../../src/shared/observability/index.js';

const SAAT = new Date('2026-09-07T02:31:44.812Z');

/** Logger yang menulis ke array, bukan stdout — entri dapat diperiksa utuh. */
function loggerUji(level?: 'debug' | 'info' | 'warn' | 'error') {
  const baris: string[] = [];
  const logger = new Logger({
    clock: new FixedClock(SAAT),
    ...(level === undefined ? {} : { level }),
    tulis: (b) => baris.push(b),
    modulBawaan: 'uji',
  });
  return { logger, entri: () => baris.map((b) => JSON.parse(b) as Record<string, unknown>) };
}

describe('redact (SDD-OBS-04, SDD-15 §4.2)', () => {
  it('menutup setiap kunci pada daftar tolak', () => {
    const isi = Object.fromEntries(KUNCI_TERTUTUP.map((k) => [k, 'rahasia']));
    const keluar = redact(isi) as Record<string, unknown>;
    expect(Object.values(keluar).every((v) => v === DITUTUP)).toBe(true);
  });

  it('menutup secara rekursif, bukan hanya di tingkat teratas', () => {
    const keluar = redact({ a: { b: { c: { password: 'rahasia', nama: 'Budi' } } } });
    expect(JSON.stringify(keluar)).not.toContain('rahasia');
    expect(JSON.stringify(keluar)).toContain('Budi');
  });

  it('menutup di dalam array', () => {
    const keluar = redact([{ token: 'abc' }, { nama: 'Siti' }]);
    expect(JSON.stringify(keluar)).not.toContain('abc');
  });

  it('menutup berdasarkan POLA NILAI meski kuncinya netral', () => {
    const keluar = redact({
      catatan: 'sk-abcdef1234567890',
      header: 'Bearer abc.def.ghi',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.payload',
    }) as Record<string, unknown>;
    expect(Object.values(keluar)).toEqual([DITUTUP, DITUTUP, DITUTUP]);
  });

  it('tidak menutup nilai biasa', () => {
    expect(redact({ nama: 'Budi', jumlah: 3, aktif: true })).toEqual({
      nama: 'Budi',
      jumlah: 3,
      aktif: true,
    });
  });

  it('menguraikan Error menjadi type/message/stack — bukan objek kosong', () => {
    const keluar = redact(new TypeError('rusak')) as Record<string, unknown>;
    expect(keluar['type']).toBe('TypeError');
    expect(keluar['message']).toBe('rusak');
    expect(typeof keluar['stack']).toBe('string');
  });

  it('berhenti pada struktur terlalu dalam alih-alih menggantung', () => {
    let dalam: Record<string, unknown> = { password: 'x' };
    for (let i = 0; i < 30; i += 1) dalam = { l: dalam };
    expect(JSON.stringify(redact(dalam))).toContain('TERLALU_DALAM');
  });
});

describe('Logger (SDD-OBS-02, SDD-15 §4.1)', () => {
  it('menulis JSON dengan seluruh field wajib', () => {
    const { logger, entri } = loggerUji();
    logger.info('reservation created');
    const e = entri()[0]!;
    for (const f of ['ts', 'level', 'msg', 'request_id', 'modul']) {
      expect(e).toHaveProperty(f);
    }
    expect(e['ts']).toBe(SAAT.toISOString());
    expect(e['level']).toBe('info');
  });

  it('memakai waktu dari Clock, bukan jam sistem (SDD-SYS-07)', () => {
    const { logger, entri } = loggerUji();
    logger.info('a');
    expect(entri()[0]!['ts']).toBe('2026-09-07T02:31:44.812Z');
  });

  it('objek pengguna lengkap tidak membocorkan satu pun field tertutup', () => {
    const { logger, entri } = loggerUji();
    logger.info('pengguna dimuat', {
      user: {
        id: 42,
        nama: 'Budi',
        password_hash: '$2b$rahasia',
        totp_secret: 'JBSWY3DP',
        nip_nis: '1987654321',
        telepon: '08123456789',
      },
    });
    const baris = JSON.stringify(entri()[0]);
    for (const bocor of ['$2b$rahasia', 'JBSWY3DP', '1987654321', '08123456789']) {
      expect(baris).not.toContain(bocor);
    }
    expect(baris).toContain('Budi');
  });

  it('menghormati ambang level', () => {
    const { logger, entri } = loggerUji('warn');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(entri().map((e) => e['msg'])).toEqual(['c', 'd']);
  });

  it('log galat membawa error.type dan error.message', () => {
    const { logger, entri } = loggerUji();
    logger.error('gagal menyimpan', new RangeError('di luar batas'));
    const e = entri()[0]!['error'] as Record<string, unknown>;
    expect(e['type']).toBe('RangeError');
    expect(e['message']).toBe('di luar batas');
  });
});

describe('RequestContext (SDD-OBS-03)', () => {
  it('membangkitkan request_id berprefiks yang dapat dikenali agregator', () => {
    expect(requestIdBaru()).toMatch(/^req_[0-9a-f]{20}$/);
  });

  it('logger memungut request_id, user_id, dan role dari konteks', () => {
    const { logger, entri } = loggerUji();
    denganKonteks(
      { requestId: 'req_abc', modul: 'm07-reservation-room', userId: 42, role: 'GURU' },
      () => logger.info('reservation created'),
    );
    const e = entri()[0]!;
    expect(e['request_id']).toBe('req_abc');
    expect(e['modul']).toBe('m07-reservation-room');
    expect(e['user_id']).toBe(42);
    expect(e['role']).toBe('GURU');
  });

  it('field wajib tetap ada saat tak ada konteks — mis. penyalaan proses', () => {
    const { logger, entri } = loggerUji();
    logger.info('server siap');
    expect(entri()[0]!['request_id']).toBe('-');
    expect(entri()[0]!['modul']).toBe('uji');
  });

  it('konteks bertahan melewati await — inilah sebabnya AsyncLocalStorage dipakai', async () => {
    const ctx = { requestId: 'req_async', modul: 'm09-loans' };
    const terbaca = await denganKonteks(ctx, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return konteksSaatIni()?.requestId;
    });
    expect(terbaca).toBe('req_async');
  });

  it('konteks turunan mempertahankan request_id asal saat berpindah modul (worker)', () => {
    const induk = { requestId: 'req_induk', modul: 'm07-reservation-room', userId: 7 };
    const anak = konteksTurunan(induk, 'worker-notifikasi');
    expect(anak.requestId).toBe('req_induk');
    expect(anak.modul).toBe('worker-notifikasi');
    expect(anak.userId).toBe(7);
  });

  it('tidak bocor keluar dari blok konteksnya', () => {
    denganKonteks({ requestId: 'req_x', modul: 'm01-auth' }, () => undefined);
    expect(konteksSaatIni()).toBeUndefined();
  });
});
