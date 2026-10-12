// Batas mobile: shared tidak mengimpor fitur/app; fitur lain lewat index.ts.
import { readdirSync } from 'node:fs';
import basis, { akarRepo, zonaAntarPohon } from '../../eslint.config.js';
const features = readdirSync(new URL('./src/features/', import.meta.url), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const mobileZones = [
  { target: './apps/mobile/src/shared', from: './apps/mobile/src/features' },
  { target: './apps/mobile/src/shared', from: './apps/mobile/src/app' },
  { target: './apps/mobile/src/features', from: './apps/mobile/src/app' },
  { target: './apps/mobile/src/app', from: './apps/mobile/src/features/**', except: ['**/features/*/index.ts'] },
  ...features.map((name) => ({ target: `./apps/mobile/src/features/${name}`, from: './apps/mobile/src/features/**', except: [`**/features/${name}/**`, '**/features/*/index.ts'] })),
];
export default [...basis, {
  files: ['src/**/*.{ts,tsx}'],
  settings: { 'import/resolver': { typescript: { project: import.meta.dirname + '/tsconfig.json' } } },
  rules: { 'import/no-restricted-paths': ['error', { basePath: akarRepo, zones: [...zonaAntarPohon, ...mobileZones] }] },
}];
