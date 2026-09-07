// Integration test terhadap PostgreSQL nyata (SDD-REPO-11). Menuntut DATABASE_URL.
// Terpisah dari vitest.config.ts supaya `npm test` tetap dapat dijalankan di mesin
// tanpa basis data; CI menyalakan keduanya di PR-00-17.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    environment: 'node',
    // Migration menjalankan proses dbmate dan pg_sleep; bawaan 5 detik terlalu pendek.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Berbagi satu basis data: berkas uji tidak boleh berjalan paralel.
    fileParallelism: false,
    // Cakupan diukur terpisah dari uji berkas: sebagian kode — koneksi DB
    // (PR-00-04) dan penerbitan nomor (PR-00-07) — hanya dapat dijalankan
    // terhadap PostgreSQL nyata. Menggabungkan kedua laporan menjadi satu
    // gerbang adalah pekerjaan PR-00-17.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage-integration',
      include: ['src/**/*.ts'],
      exclude: ['src/**/index.ts', 'src/worker/**'],
    },
  },
});
