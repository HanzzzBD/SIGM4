// Konfigurasi lint pohon mobile, di atas basis bersama di akar (SDD-REPO-08).
// Batas ANTAR-pohon ditegakkan eslint.config.js akar (SDD-REPO-07); batas DI DALAM
// pohon ini diatur berkas perancangnya sendiri dan ditambahkan bersama PR yang
// membangun strukturnya.
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {},
  },
];
