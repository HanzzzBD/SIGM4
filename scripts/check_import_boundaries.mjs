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
  // Batas antar-modul (SDD-SYS-02, SDD-SYS-03) — tabel SDD-00 §4.2 baris 1.
  { nama: 'modul -> repositories modul lain dilarang (SDD-SYS-03)', cwd: apiRoot, tolak: true,
    file: 'apps/api/src/modules/m02-users/services/__batas_repo__.ts',
    isi: "import '../../m01-auth/repositories/contoh.js';\n" },
  { nama: 'modul -> controllers modul lain dilarang (SDD-00 §4.2)', cwd: apiRoot, tolak: true,
    file: 'apps/api/src/modules/m02-users/services/__batas_ctrl__.ts',
    isi: "import '../../m01-auth/controllers/contoh.js';\n" },
  { nama: 'modul -> index.ts modul lain DIIZINKAN (SDD-SYS-03)', cwd: apiRoot, tolak: false,
    file: 'apps/api/src/modules/m02-users/services/__batas_modul_sah__.ts',
    isi: "import '../../m01-auth/index.js';\n" },
  // Aturan yang menutup modul dari isinya sendiri lulus ketiga kasus di atas
  // sekaligus salah: repositories/ privat terhadap modul LAIN, bukan terhadap pemiliknya.
  { nama: 'modul -> repositories SENDIRI DIIZINKAN', cwd: apiRoot, tolak: false,
    file: 'apps/api/src/modules/m01-auth/services/__batas_repo_sendiri__.ts',
    isi: "import '../repositories/contoh.js';\n" },
];

// Modul contoh: no-restricted-paths hanya menilai impor yang dapat diselesaikan.
// Folder modul harus sudah ada sebelum ESLint dibuat: konfigurasi apps/api membaca
// src/modules saat dimuat untuk menyusun zona antar-modulnya.
const penopang = [
  ['apps/api/src/modules/m01-auth/index.ts', 'export {};\n'],
  ['apps/api/src/modules/m01-auth/services/contoh.ts', 'export {};\n'],
  ['apps/api/src/modules/m01-auth/repositories/contoh.ts', 'export {};\n'],
  ['apps/api/src/modules/m01-auth/controllers/contoh.ts', 'export {};\n'],
  ['apps/api/src/modules/m02-users/index.ts', 'export {};\n'],
];

/** Folder modul contoh yang dibuang seluruhnya setelah pemeriksaan selesai. */
const modulContoh = ['apps/api/src/modules/m01-auth', 'apps/api/src/modules/m02-users'];

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
  for (const m of modulContoh) rmSync(join(akar, m), { recursive: true, force: true });
  for (const k of kasus) rmSync(join(akar, k.file), { force: true });
}

if (gagal > 0) {
  console.error(`\n${gagal} batas tidak ditegakkan. Aturan impor tidak menolak apa yang seharusnya ditolak.`);
  process.exit(1);
}
console.log('\nSeluruh batas impor terbukti menolak dan mengizinkan sesuai SDD-17 §4.2.');
