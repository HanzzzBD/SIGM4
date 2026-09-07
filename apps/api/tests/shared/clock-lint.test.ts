// Uji negatif acceptance PR-00-06: "`new Date()` di luar `shared/clock` ditolak lint".
//
// Aturan lint yang tidak pernah dibuktikan menolak apa pun adalah aturan yang
// tidak ada — pola yang sama dengan scripts/check_import_boundaries.mjs milik
// PR-00-02. Bedanya: di sini ESLint dipanggil sebagai pustaka atas teks, sehingga
// tidak ada berkas sementara yang perlu ditulis dan dibersihkan.

import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AKAR } from '../helpers/bab113.js';

const API = fileURLToPath(new URL('apps/api/', AKAR));

async function galatLint(berkas: string, kode: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: API, errorOnUnmatchedPattern: false });
  const hasil = await eslint.lintText(kode, { filePath: fileURLToPath(new URL(berkas, AKAR)) });
  return hasil.flatMap((r) => r.messages.map((m) => m.ruleId ?? m.message));
}

const DI_MODUL = 'apps/api/src/shared/db/__probe__.ts';
const DI_CLOCK = 'apps/api/src/shared/clock/__probe__.ts';

describe('SDD-SYS-07 — waktu selalu dari Clock yang di-inject', () => {
  it('menolak `new Date()` di luar shared/clock', async () => {
    const galat = await galatLint(DI_MODUL, 'export const t = new Date();\n');
    expect(galat).toContain('no-restricted-syntax');
  });

  it('menolak `Date.now()` di luar shared/clock — celah yang sama, ejaan berbeda', async () => {
    const galat = await galatLint(DI_MODUL, 'export const t = Date.now();\n');
    expect(galat).toContain('no-restricted-syntax');
  });

  it('MENGIZINKAN `new Date()` di dalam shared/clock', async () => {
    const galat = await galatLint(DI_CLOCK, 'export const t = new Date();\n');
    expect(galat).not.toContain('no-restricted-syntax');
  });

  it('tidak menghalangi `new Date(nilai)` — parsing waktu tersimpan bukan pembacaan jam', async () => {
    const galat = await galatLint(DI_MODUL, 'export const t = new Date(1757200000000);\n');
    expect(galat).not.toContain('no-restricted-syntax');
  });

  it('tidak ada satu pun `new Date()` telanjang di src/ selain shared/clock', async () => {
    const eslint = new ESLint({ cwd: API, errorOnUnmatchedPattern: false });
    const hasil = await eslint.lintFiles(['src']);
    const pelanggar = hasil
      .filter((r) => r.messages.some((m) => m.ruleId === 'no-restricted-syntax'))
      .map((r) => r.filePath);
    expect(pelanggar).toEqual([]);
  });
});
