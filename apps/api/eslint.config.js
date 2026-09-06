// Aturan impor SDD-00 §4.2, ber-akar pada apps/api (SDD-REPO-08).
// Pola `modules/*` dan `shared/*` di sini TIDAK pernah mengenai apps/web/src/modules/*
// karena seluruh jalur diberi awalan akar pohon ini.
import importPlugin from 'eslint-plugin-import';

export default [
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
        basePath: import.meta.dirname,
        zones: [
          // shared kernel tidak boleh tahu tentang modul — jika tidak, ia berubah
          // menjadi simpul ketergantungan melingkar (SDD-SYS-06, SDD-00 §4.2 baris 3).
          { target: './src/shared', from: './src/modules' },
          // Entrypoint hanya boleh menyentuh permukaan publik modul; internal modul
          // tertutup baginya (SDD-SYS-03). Batas antar-modul yang lebih halus
          // (modules/*/repositories/*) ditegakkan PR-00-02.
          // `from` sengaja ditulis sebagai glob: eslint-plugin-import hanya
          // memperlakukan `except` sebagai pola glob bila `from` pun glob.
          { target: './src/api', from: './src/modules/**', except: ['**/modules/*/index.ts'] },
          { target: './src/worker', from: './src/modules/**', except: ['**/modules/*/index.ts'] },
        ],
      }],
    },
  },
];
