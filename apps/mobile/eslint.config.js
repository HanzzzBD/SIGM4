// Konfigurasi lint pohon mobile, di atas basis bersama di akar (SDD-REPO-08).
// Basis itu di-*spread* secara eksplisit: sejak ESLint 10 konfigurasi dicari mulai
// dari direktori berkas yang di-lint lalu naik ke atas, sehingga berkas ini
// MEMBAYANGI konfigurasi akar alih-alih menambahinya. Tanpa baris `...basis` di
// bawah, batas antar-pohon (SDD-REPO-07) diam-diam berhenti ditegakkan di sini.
// Batas DI DALAM pohon ini diatur berkas perancangnya sendiri dan ditambahkan
// bersama PR yang membangun strukturnya.
import basis from '../../eslint.config.js';

export default [
  ...basis,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {},
  },
];
