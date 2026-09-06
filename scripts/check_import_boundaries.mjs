// Uji negatif batas impor (SDD-17 §4.3, SDD-REPO-07/08).
// Aturan batas yang tidak pernah dibuktikan menolak apa pun adalah aturan yang tidak ada.
// Skrip ini menulis berkas contoh berisi impor terlarang, menjalankan ESLint atasnya,
// lalu memastikan setiap satunya BENAR-BENAR ditolak — dan bahwa impor yang sah lolos.
import { ESLint } from 'eslint';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const akar = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(akar, 'apps/api');
const BERKAS = '__batas_impor__.ts';

/** cwd: akar tempat konfigurasi lint dicari. tolak: apakah impor ini harus gagal. */
const kasus = [
  { nama: 'apps/web -> apps/api dilarang (SDD-REPO-07)', cwd: akar, tolak: true,
    file: 'apps/web/src/app/' + BERKAS, isi: "import '../../../api/src/api/index.js';\n" },
  { nama: 'apps/api -> apps/web dilarang (SDD-REPO-07)', cwd: akar, tolak: true,
    file: 'apps/api/src/api/' + BERKAS, isi: "import '../../../web/src/app/index.js';\n" },
  { nama: 'packages/schemas -> apps/* dilarang (SDD-REPO-06)', cwd: akar, tolak: true,
    file: 'packages/schemas/src/' + BERKAS, isi: "import '../../../apps/api/src/api/index.js';\n" },
  { nama: 'shared -> modules dilarang (SDD-SYS-06, SDD-00 §4.2)', cwd: apiRoot, tolak: true,
    file: 'apps/api/src/shared/clock/' + BERKAS, isi: "import '../../modules/m01-auth/index.js';\n" },
  { nama: 'entrypoint -> internal modul dilarang (SDD-SYS-03)', cwd: apiRoot, tolak: true,
    file: 'apps/api/src/api/__batas_internal__.ts', isi: "import '../modules/m01-auth/services/contoh.js';\n" },
  { nama: 'entrypoint -> modules/*/index.ts DIIZINKAN', cwd: apiRoot, tolak: false,
    file: 'apps/api/src/api/__batas_sah__.ts', isi: "import '../modules/m01-auth/index.js';\n" },
];

// Modul contoh: no-restricted-paths hanya menilai impor yang dapat diselesaikan.
const penopang = [
  ['apps/api/src/modules/m01-auth/index.ts', 'export {};\n'],
  ['apps/api/src/modules/m01-auth/services/contoh.ts', 'export {};\n'],
];

const semua = [...penopang.map(([f, i]) => [f, i]), ...kasus.map((k) => [k.file, k.isi])];
for (const [f, isi] of semua) {
  mkdirSync(dirname(join(akar, f)), { recursive: true });
  writeFileSync(join(akar, f), isi, 'utf8');
}

let gagal = 0;
try {
  for (const k of kasus) {
    const eslint = new ESLint({ cwd: k.cwd, errorOnUnmatchedPattern: false });
    const hasil = await eslint.lintFiles([join(akar, k.file)]);
    const errors = hasil.reduce((n, r) => n + r.errorCount, 0);
    const ditolak = errors > 0;
    const lulus = ditolak === k.tolak;
    if (!lulus) gagal += 1;
    const label = k.tolak ? 'harus DITOLAK' : 'harus DIIZINKAN';
    console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${k.nama} — ${label}, errors=${errors}`);
  }
} finally {
  rmSync(join(akar, 'apps/api/src/modules/m01-auth'), { recursive: true, force: true });
  for (const k of kasus) rmSync(join(akar, k.file), { force: true });
}

if (gagal > 0) {
  console.error(`\n${gagal} batas tidak ditegakkan. Aturan impor tidak menolak apa yang seharusnya ditolak.`);
  process.exit(1);
}
console.log('\nSeluruh batas impor terbukti menolak dan mengizinkan sesuai SDD-17 §4.2.');
