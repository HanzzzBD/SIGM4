// Aturan impor SDD-00 §4.2, ber-akar pada apps/api (SDD-REPO-08): setiap pola
// diberi awalan `./apps/api/`, sehingga `modules/*` di sini TIDAK pernah mengenai
// apps/web/src/modules/* — persis bentuk yang diminta SDD-17 §4.3.
import importPlugin from 'eslint-plugin-import';
import basis, { akarRepo, zonaAntarPohon } from '../../eslint.config.js';

/** Batas lapisan di dalam pohon backend — tabel SDD-00 §4.2. */
const zonaLapisan = [
  // shared kernel tidak boleh tahu tentang modul — jika tidak, ia berubah
  // menjadi simpul ketergantungan melingkar (SDD-SYS-06, SDD-00 §4.2 baris 3).
  { target: './apps/api/src/shared', from: './apps/api/src/modules' },
  // Entrypoint hanya boleh menyentuh permukaan publik modul; internal modul
  // tertutup baginya (SDD-SYS-03). Batas antar-modul yang lebih halus
  // (modules/*/repositories/*) ditegakkan PR-00-02.
  // `from` sengaja ditulis sebagai glob: eslint-plugin-import hanya memperlakukan
  // `except` sebagai pola glob bila `from` pun glob.
  { target: './apps/api/src/api', from: './apps/api/src/modules/**', except: ['**/modules/*/index.ts'] },
  { target: './apps/api/src/worker', from: './apps/api/src/modules/**', except: ['**/modules/*/index.ts'] },
];

// Basis akar di-*spread* lebih dulu: sejak ESLint 10 konfigurasi dicari mulai dari
// direktori berkas yang di-lint lalu naik ke atas, sehingga berkas ini MEMBAYANGI
// konfigurasi akar alih-alih menambahinya.
//
// Kedua kelompok zona digabung dalam SATU deklarasi aturan karena opsi aturan
// bernama sama saling MENGGANTIKAN, bukan bergabung. Mendeklarasikannya dua kali
// membuat zona antar-pohon diam-diam hilang atas apps/api.
export default [
  ...basis,
  {
    files: ['src/**/*.ts'],
    plugins: { import: importPlugin },
    // Tanpa resolver TypeScript, impor bergaya NodeNext ('./x.js' -> x.ts) tidak
    // pernah terselesaikan dan no-restricted-paths diam-diam tidak menilai apa pun.
    settings: {
      'import/resolver': { typescript: { project: import.meta.dirname + '/tsconfig.json' } },
    },
    rules: {
      'import/no-restricted-paths': ['error', {
        basePath: akarRepo,
        zones: [...zonaAntarPohon, ...zonaLapisan],
      }],
    },
  },
];
