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
  },
});
