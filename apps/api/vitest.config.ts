// Vitest untuk unit & integration di apps/api (SDD-REPO-11).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Uji berada di tests/, di luar rootDir ./src — lihat tsconfig.test.json.
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
