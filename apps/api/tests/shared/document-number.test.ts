// Katalog prefiks dan format nomor (SEQ-01, SEQ-04).
//
// Yang diuji di sini tidak menuntut basis data. Penerbitan nomornya sendiri —
// termasuk acceptance "1.000 permintaan paralel menghasilkan 1.000 nomor unik" —
// ada di tests/integration/document-number.test.ts, karena jaminannya berasal
// dari basis data dan tidak dapat dibuktikan dengan tiruan.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POLA_NOMOR, PREFIKS, nomorSah } from '../../src/shared/numbering/index.js';
import { AKAR } from '../helpers/bab113.js';

const PRD = readFileSync(
  new URL('docs/PRD/03-architecture/availability-concurrency.md', AKAR),
  'utf8',
);

describe('katalog prefiks terhadap SEQ-04', () => {
  // Dibaca dari berkas PRD saat uji berjalan, bukan disalin ke sini — prefiks
  // yang ditambahkan ke salah satu sisi saja langsung merah.
  const dariRegex = new Set(
    /\| SEQ-04 \| Regex validasi: `\^\(([^)]+)\)/
      .exec(PRD)![1]!
      .split('\\|')
      .map((p) => p.trim()),
  );
  const dariTabel = new Set(
    [...PRD.matchAll(/^\| `([A-Z-]+)` \| `?(\w+)`? \(?(?:ruangan|aset)?\)? ?\| M-\d+ \|$/gm)].map(
      (m) => m[1]!,
    ),
  );

  it('membaca regex SEQ-04 dari PRD, bukan dari daftar di dalam uji ini', () => {
    expect(dariRegex.size).toBeGreaterThan(5);
    expect(dariRegex.has('PMB')).toBe(true);
  });

  it('setiap prefiks pada regex SEQ-04 ada di katalog kode', () => {
    expect([...dariRegex].filter((p) => !(p in PREFIKS))).toEqual([]);
  });

  it('katalog kode tidak memuat prefiks di luar regex SEQ-04', () => {
    expect(Object.keys(PREFIKS).filter((p) => !dariRegex.has(p))).toEqual([]);
  });

  it('setiap prefiks punya entitas pemilik pada tabel PRD — tidak ada yang menganggur', () => {
    expect([...dariRegex].filter((p) => !dariTabel.has(p))).toEqual([]);
  });
});

describe('POLA_NOMOR (SEQ-04)', () => {
  it.each([
    'RSV-RG-2026-0001',
    'RSV-BR-2026-0087',
    'PJM-2026-0001',
    'KRS-2026-9999',
    'WO-2026-0001',
    'OPN-2026-0001',
    'PGD-2026-0001',
    'HPS-2026-0001',
    'PMB-2026-0001',
  ])('menerima %s', (nomor) => {
    expect(nomorSah(nomor)).toBe(true);
  });

  it('menerima urutan lebih dari 4 digit — SEQ-04 menulis \\d{4,}, bukan \\d{4}', () => {
    expect(nomorSah('PJM-2026-12345')).toBe(true);
  });

  it.each([
    ['prefiks tak dikenal', 'ABC-2026-0001'],
    ['tahun bukan 4 digit', 'PJM-26-0001'],
    ['urutan kurang dari 4 digit', 'PJM-2026-001'],
    ['tanpa pemisah', 'PJM20260001'],
    ['huruf kecil', 'pjm-2026-0001'],
    ['ada imbuhan di belakang', 'PJM-2026-0001-A'],
    ['kosong', ''],
  ])('menolak %s', (_nama, nomor) => {
    expect(nomorSah(nomor)).toBe(false);
  });

  it('RSV-RG tidak tertukar dengan RSV-BR', () => {
    expect(nomorSah('RSV-RG-2026-0001')).toBe(true);
    expect(nomorSah('RSV-XX-2026-0001')).toBe(false);
  });

  it('pola dirakit dari PREFIKS, sehingga tidak dapat menyimpang darinya', () => {
    for (const p of Object.keys(PREFIKS)) {
      expect(POLA_NOMOR.test(`${p}-2026-0001`)).toBe(true);
    }
  });
});
