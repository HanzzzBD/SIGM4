// ErrorMapper (SDD-06 §4.4). Yang diuji bukan hanya pemetaannya, melainkan tiga
// hal yang mudah rusak diam-diam: katalog kode tetap cerminan Bab 17.3, galat 500
// tidak pernah membocorkan pesan asli (NFR-R-10), dan 23514 memicu alarm.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AuthError,
  DomainError,
  ForbiddenError,
  KODE_GALAT,
  NotFoundError,
  mapError,
} from '../../src/shared/errors/index.js';
import { AKAR } from '../helpers/bab113.js';

describe('katalog kode galat terhadap Bab 17.3', () => {
  // Dibaca dari berkas PRD saat uji berjalan, bukan disalin ke sini — pola yang
  // sama dengan enums.test.ts. Kode yang ditambahkan ke salah satu sisi saja
  // langsung merah.
  const bab173 = readFileSync(new URL('docs/PRD/03-architecture/api-conventions.md', AKAR), 'utf8')
    .split('## 17.3')[1]!
    .split('## 17.4')[0]!;
  const dariPrd = new Set(
    [...bab173.matchAll(/^\| (\d{3}) \| [^|]* \| ([^|]+) \|/gm)].flatMap((m) =>
      [...m[2]!.matchAll(/`([A-Z_]+)`/g)].map((k) => `${m[1]}:${k[1]}`),
    ),
  );

  it('membaca katalog dari PRD, bukan dari daftar di dalam uji ini', () => {
    expect(dariPrd.size).toBeGreaterThan(20);
  });

  it('setiap kode Bab 17.3 ada di katalog dengan status HTTP yang sama', () => {
    const selisih = [...dariPrd].filter((baris) => {
      const [status, kode] = baris.split(':') as [string, keyof typeof KODE_GALAT];
      return KODE_GALAT[kode] !== Number(status);
    });
    expect(selisih).toEqual([]);
  });

  it('katalog tidak memuat kode di luar Bab 17.3', () => {
    const kodePrd = new Set([...dariPrd].map((b) => b.split(':')[1]));
    expect(Object.keys(KODE_GALAT).filter((k) => !kodePrd.has(k))).toEqual([]);
  });
});

describe('mapError (SDD-06 §4.4)', () => {
  const pg = (code: string, constraint?: string) =>
    constraint === undefined ? { code } : { code, constraint };

  it.each([
    ['ZodError', { name: 'ZodError', issues: [] }, 400, 'INVALID_REQUEST'],
    ['DomainError BORROWER_BLOCKED', new DomainError('BORROWER_BLOCKED'), 422, 'BORROWER_BLOCKED'],
    ['DomainError DURATION_EXCEEDED', new DomainError('DURATION_EXCEEDED'), 422, 'DURATION_EXCEEDED'],
    ['DomainError INSUFFICIENT_BALANCE', new DomainError('INSUFFICIENT_BALANCE'), 422, 'INSUFFICIENT_BALANCE'],
    ['DomainError EXCEEDS_APPROVED_QTY', new DomainError('EXCEEDS_APPROVED_QTY'), 422, 'EXCEEDS_APPROVED_QTY'],
    ['DomainError CORE_PERMISSION_LOCKED', new DomainError('CORE_PERMISSION_LOCKED'), 403, 'CORE_PERMISSION_LOCKED'],
    ['AuthError', new AuthError(), 401, 'UNAUTHENTICATED'],
    ['ForbiddenError', new ForbiddenError(), 403, 'FORBIDDEN'],
    ['NotFoundError', new NotFoundError(), 404, 'NOT_FOUND'],
    ['pg 23505', pg('23505'), 409, 'DUPLICATE_CODE'],
    ['galat tak dikenal', new Error('apa pun'), 500, 'INTERNAL_ERROR'],
  ])('%s -> %d %s', (_nama, galat, status, kode) => {
    const hasil = mapError(galat);
    expect(hasil.status).toBe(status);
    expect(hasil.kode).toBe(kode);
  });

  it('23P01 pada ruangan -> RESERVATION_CONFLICT (CI-04)', () => {
    expect(mapError(pg('23P01', 'booking_slots_no_overlap')).kode).toBe('RESERVATION_CONFLICT');
  });

  it('23P01 pada aset -> ASSET_NOT_AVAILABLE, dibedakan dari nama constraint', () => {
    expect(mapError(pg('23P01', 'booking_slots_asset_no_overlap')).kode).toBe('ASSET_NOT_AVAILABLE');
  });

  it('23514 -> INSUFFICIENT_BALANCE dan WAJIB alarm — jaring terakhir SDD-DB-14 tertembus', () => {
    const hasil = mapError(pg('23514'));
    expect(hasil.kode).toBe('INSUFFICIENT_BALANCE');
    expect(hasil.alarm).toBe(true);
  });

  it('galat 500 tidak membawa pesan asli ke klien (NFR-R-10)', () => {
    const hasil = mapError(new Error('koneksi ke 10.0.0.5 gagal: password salah'));
    expect(JSON.stringify(hasil)).not.toContain('10.0.0.5');
    expect(JSON.stringify(hasil)).not.toContain('password');
    expect(hasil.alarm).toBe(true);
  });

  it('galat domain biasa TIDAK memicu alarm — hanya yang menandakan cacat kode', () => {
    expect(mapError(new DomainError('BORROWER_BLOCKED')).alarm).toBe(false);
  });

  it('detail domain diteruskan apa adanya untuk klien', () => {
    const hasil = mapError(new DomainError('DURATION_EXCEEDED', undefined, { maksJam: 8 }));
    expect(hasil.detail).toEqual({ maksJam: 8 });
  });

  it('objek bukan-galat tidak menjatuhkan mapper', () => {
    for (const aneh of [null, undefined, 'teks', 42, {}, []]) {
      expect(mapError(aneh).kode).toBe('INTERNAL_ERROR');
    }
  });
});
