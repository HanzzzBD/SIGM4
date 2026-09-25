// Basis lint bersama seluruh repositori (SDD-REPO-08).
// Yang ditegakkan DI SINI hanyalah batas ANTAR-POHON (SDD-REPO-06, SDD-REPO-07).
// Batas di dalam apps/api ditegakkan apps/api/eslint.config.js — pola `modules/*`
// dan `shared/*` di sana tidak boleh mengenai pohon lain (SDD-REPO-08).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

/** Akar repositori — seluruh zona di bawah ditulis relatif terhadap ini. */
export const akarRepo = import.meta.dirname;

/** Zona batas antar-pohon — tabel SDD-17 §4.2. */
export const zonaAntarPohon = [
  // Impor lintas apps/* dilarang seluruhnya (SDD-REPO-07).
  { target: './apps/api', from: './apps/web' },
  { target: './apps/api', from: './apps/mobile' },
  { target: './apps/web', from: './apps/api' },
  { target: './apps/web', from: './apps/mobile' },
  { target: './apps/mobile', from: './apps/api' },
  { target: './apps/mobile', from: './apps/web' },
  // packages/* dilarang mengimpor apps/* — ketergantungan mengalir satu arah
  // apps/* -> packages/* (SDD-REPO-06).
  { target: './packages', from: './apps' },
];

export default tseslint.config(
  {
    // wireframe/ berisi artefak desain (.dc.html beserta bundel pendukungnya),
    // bukan kode sumber pohon mana pun — di luar apps/* dan packages/*.
    ignores: ['**/dist/**', '**/build/**', '**/node_modules/**', '**/*.d.ts', 'wireframe/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    settings: {
      'import/resolver': { typescript: { project: ['./apps/*/tsconfig.json', './packages/*/tsconfig.json'] } },
    },
    rules: {
      // basePath eksplisit: sejak ESLint 10 konfigurasi ini juga dimuat dari
      // konfigurasi per-pohon, sehingga jalur zona tidak boleh bergantung pada cwd.
      'import/no-restricted-paths': ['error', { basePath: akarRepo, zones: zonaAntarPohon }],
      // Jalur relatif yang menyelinap keluar akar pohonnya. Lapis kedua penegakan
      // ada pada rootDir tiap tsconfig — lint dapat dimatikan sebaris, rootDir tidak
      // (SDD-17 §4.3).
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/apps/api/*', '**/apps/web/*', '**/apps/mobile/*'],
          message: 'Impor lintas pohon apps/* dilarang (SDD-REPO-07). Yang dibagi hanya lewat packages/schemas.',
        }],
      }],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
);
