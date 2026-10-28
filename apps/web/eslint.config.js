// Konfigurasi lint pohon web, di atas basis bersama di akar (SDD-REPO-08).
// Basis itu di-*spread* secara eksplisit: sejak ESLint 10 konfigurasi dicari mulai
// dari direktori berkas yang di-lint lalu naik ke atas, sehingga berkas ini
// MEMBAYANGI konfigurasi akar alih-alih menambahinya. Tanpa baris `...basis` di
// bawah, batas antar-pohon (SDD-REPO-07) diam-diam berhenti ditegakkan di sini.
import { readdirSync } from 'node:fs';
import globals from 'globals';
import basis, { akarRepo, zonaAntarPohon } from '../../eslint.config.js';

// Modul dibaca dari disk (pola apps/api): modul yang terlewat tak boleh berjalan tanpa batas.
const modul = readdirSync(new URL('./src/modules/', import.meta.url), { withFileTypes: true })
  .filter((entri) => entri.isDirectory())
  .map((entri) => entri.name);

/** SDD-11 §4.1a — cermin SDD-00 §4.2 (SDD-FE-01). */
const zonaWeb = [
  ...modul.map((nama) => ({
    target: `./apps/web/src/modules/${nama}`,
    from: './apps/web/src/modules/**',
    except: [`**/modules/${nama}/**`, '**/modules/*/index.ts'],
    message: 'Modul lain hanya boleh disentuh lewat index.ts-nya (SDD-11 §4.1a).',
  })),
  { target: './apps/web/src/modules', from: './apps/web/src/pages', message: 'Modul tidak mengimpor pages/ (SDD-11 §4.1a).' },
  { target: './apps/web/src/modules', from: './apps/web/src/app', message: 'Modul tidak mengimpor app/ (SDD-11 §4.1a).' },
  { target: './apps/web/src/shared', from: './apps/web/src/modules', message: 'shared/ tidak mengenal modul (SDD-11 §4.1a).' },
  { target: './apps/web/src/shared', from: './apps/web/src/pages' },
  { target: './apps/web/src/shared', from: './apps/web/src/app' },
  { target: './apps/web/src/pages', from: './apps/web/src/modules/**', except: ['**/modules/*/index.ts'], message: 'pages/ hanya lewat index.ts modul (SDD-11 §4.1a).' },
  { target: './apps/web/src/pages', from: './apps/web/src/app' },
];

/**
 * DS-P-07 / DSD-07 / keputusan 83: tidak ada hex, px, ms, atau nilai arbitrer Tailwind di
 * komponen — hanya token; accent tidak pernah menjadi warna teks, garis, atau border.
 */
const nilaiMentah = [
  { selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]', message: 'Warna mentah dilarang — pakai token (DS-P-07).' },
  { selector: 'Literal[value=/\\b\\d+(\\.\\d+)?(px|ms)\\b/]', message: 'px/ms mentah dilarang — pakai token (DS-P-07).' },
  { selector: 'Literal[value=/[a-z]-\\[/]', message: 'Nilai arbitrer Tailwind dilarang — pakai token (DS-P-07).' },
  { selector: 'Literal[value=/\\b(text|stroke|border|outline|ring|decoration)-accent-/]', message: 'Accent tidak boleh menjadi teks, garis, atau border (DSD-07).' },
  { selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b|\\b\\d+(px|ms)\\b|[a-z]-\\[/]', message: 'Nilai visual mentah dilarang — pakai token (DS-P-07).' },
];

export default [
  ...basis,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'import/no-restricted-paths': ['error', { basePath: akarRepo, zones: [...zonaAntarPohon, ...zonaWeb] }],
    },
  },
  {
    // Berkas token adalah satu-satunya tempat nilai mentah (FOUNDATIONS.md).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/shared/ui/tokens/**'],
    rules: { 'no-restricted-syntax': ['error', ...nilaiMentah] },
  },
];
