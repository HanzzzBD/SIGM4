// Uji pembanding: Bab 11.3 PRD <-> 0002_enums.sql (SDD-DB-02).
//
// Nilai enum dibaca LANGSUNG dari berkas PRD dan diturunkan menjadi kode teknis
// secara mekanis, bukan disalin ke dalam berkas ini. Salinan akan ikut disunting
// bersama migration-nya dan berhenti menguji apa pun; pembacaan dari sumber
// membuat perubahan istilah di PRD yang tidak diikuti migration menjadi merah.
//
// Yang TIDAK diturunkan mekanis hanyalah nama tipe: Bab 11.3 memberi nama
// kelompok dalam Bahasa Indonesia, sementara SDD-05 §4.1 mewajibkan nama tipe
// `<domain>_<konsep>` dalam Bahasa Inggris. Pemetaannya ada di helpers/bab113.ts,
// dan ketidaklengkapannya sendiri ikut diuji di bawah.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AKAR, NAMA_TIPE, bacaBab113, kodeTeknis } from './helpers/bab113.js';

const MIGRATION = new URL('apps/api/migrations/0002_enums.sql', AKAR);

/** Membaca `CREATE TYPE <nama> AS ENUM (...)` dari migration-nya. */
function bacaMigration(): ReadonlyMap<string, readonly string[]> {
  const teks = readFileSync(MIGRATION, 'utf8');
  const naik = teks.split('-- migrate:up')[1]?.split('-- migrate:down')[0] ?? '';
  const tipe = new Map<string, readonly string[]>();
  for (const cocok of naik.matchAll(/CREATE TYPE\s+(\w+)\s+AS ENUM\s*\(([^)]*)\)/g)) {
    const [, nama, isi] = cocok;
    if (nama === undefined || isi === undefined) continue;
    tipe.set(
      nama,
      [...isi.matchAll(/'([^']*)'/g)].map((m) => m[1] ?? ''),
    );
  }
  return tipe;
}

const bab113 = bacaBab113();
const migration = bacaMigration();

describe('kodeTeknis (ketetapan audit Bab 11.3)', () => {
  it.each([
    ['Baik', 'BAIK'],
    ['Rusak Ringan', 'RUSAK_RINGAN'],
    ['Bantuan Pemerintah', 'BANTUAN_PEMERINTAH'],
    ['In-App', 'IN_APP'],
    ['Disimpan sebagai Suku Cadang', 'DISIMPAN_SEBAGAI_SUKU_CADANG'],
    ['BAHAN (`BR-093`)', 'BAHAN'],
  ])('%s -> %s', (label, kode) => {
    expect(kodeTeknis(label)).toBe(kode);
  });
});

describe('0002_enums.sql terhadap Bab 11.3', () => {
  it('membaca kelompok dari PRD, bukan dari daftar di dalam uji ini', () => {
    expect(bab113.size).toBeGreaterThan(20);
    expect(bab113.get('Kondisi Aset')).toEqual(['BAIK', 'RUSAK_RINGAN', 'RUSAK_BERAT', 'HILANG']);
  });

  it('setiap kelompok Bab 11.3 punya nama tipe', () => {
    const tanpaNama = [...bab113.keys()].filter((k) => !NAMA_TIPE.has(k));
    expect(tanpaNama).toEqual([]);
  });

  it('tidak ada nama tipe yang menganggur — peta tidak boleh melampaui PRD', () => {
    const yatim = [...NAMA_TIPE.keys()].filter((k) => !bab113.has(k));
    expect(yatim).toEqual([]);
  });

  it('setiap kelompok Bab 11.3 terbentuk sebagai tipe di migration', () => {
    const hilang = [...bab113.keys()]
      .map((k) => NAMA_TIPE.get(k))
      .filter((tipe) => tipe !== undefined && !migration.has(tipe));
    expect(hilang).toEqual([]);
  });

  it('nilai tiap tipe identik dengan Bab 11.3, baris per baris', () => {
    const selisih: string[] = [];
    for (const [kelompok, nilai] of bab113) {
      const tipe = NAMA_TIPE.get(kelompok);
      if (tipe === undefined) continue;
      const aktual = migration.get(tipe) ?? [];
      if (aktual.join(',') !== nilai.join(',')) {
        selisih.push(`${tipe}: PRD=[${nilai.join(',')}] migration=[${aktual.join(',')}]`);
      }
    }
    expect(selisih).toEqual([]);
  });

  it('migration tidak membuat tipe di luar Bab 11.3', () => {
    const diizinkan = new Set(NAMA_TIPE.values());
    expect([...migration.keys()].filter((t) => !diizinkan.has(t))).toEqual([]);
  });

  it('setiap tipe punya pasangan DROP pada migrate:down (CD-05)', () => {
    const turun = readFileSync(MIGRATION, 'utf8').split('-- migrate:down')[1] ?? '';
    const dijatuhkan = new Set([...turun.matchAll(/DROP TYPE IF EXISTS (\w+)/g)].map((m) => m[1]));
    expect([...migration.keys()].filter((t) => !dijatuhkan.has(t))).toEqual([]);
  });
});

describe('0001_extensions.sql', () => {
  const teks = readFileSync(new URL('apps/api/migrations/0001_extensions.sql', AKAR), 'utf8');

  it('menyalakan btree_gist — tanpanya exclusion constraint CI-01 mustahil dibuat', () => {
    expect(teks).toMatch(/CREATE EXTENSION IF NOT EXISTS btree_gist;/);
  });

  it('menyalakan pgcrypto — assets.uuid (FR-05.1) dan rantai hash (NFR-S-03d)', () => {
    expect(teks).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto;/);
  });

  it('punya pasangan down yang mencabut keduanya (CD-05)', () => {
    const turun = teks.split('-- migrate:down')[1] ?? '';
    expect(turun).toMatch(/DROP EXTENSION IF EXISTS btree_gist;/);
    expect(turun).toMatch(/DROP EXTENSION IF EXISTS pgcrypto;/);
  });
});
