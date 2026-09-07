// Vitest unit & uji berkas untuk apps/api (SDD-REPO-11).
// tests/integration/ dikecualikan di sini: ia menuntut PostgreSQL nyata dan
// dijalankan konfigurasi tersendiri (vitest.integration.config.ts).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Uji berada di tests/, di luar rootDir ./src — lihat tsconfig.test.json.
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    environment: 'node',
    coverage: {
      // Gerbang CD-02/NFR-M-03 mengukur "logika bisnis inti". Yang diukur di sini
      // adalah src/ pohon backend; ambangnya sendiri belum dipasang sebagai
      // gerbang karena tahap CI-nya milik PR-00-17.
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      // Barrel hanya meneruskan ekspor; menghitungnya menggelembungkan angka
      // tanpa menambah satu pun cabang yang benar-benar diuji.
      exclude: ['src/**/index.ts', 'src/api/**', 'src/worker/**'],
    },
  },
});
