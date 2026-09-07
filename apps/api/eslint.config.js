// Aturan impor SDD-00 §4.2, ber-akar pada apps/api (SDD-REPO-08): setiap pola
// diberi awalan `./apps/api/`, sehingga `modules/*` di sini TIDAK pernah mengenai
// apps/web/src/modules/* — persis bentuk yang diminta SDD-17 §4.3.
import { readdirSync } from 'node:fs';
import importPlugin from 'eslint-plugin-import';
import basis, { akarRepo, zonaAntarPohon } from '../../eslint.config.js';

// Folder modul dibaca dari disk, bukan didaftar ulang di sini. Daftar yang harus
// disunting tangan akan tertinggal dari isi src/modules, dan modul yang terlewat
// darinya berjalan tanpa batas sama sekali — tanpa satu pun galat yang menandainya.
// Pemetaan 22 modul PRD -> folder tetap milik SDD-00 §4.4 (SDD-SYS-04).
const modul = readdirSync(new URL('./src/modules/', import.meta.url), { withFileTypes: true })
  .filter((entri) => entri.isDirectory())
  .map((entri) => entri.name);

/**
 * Batas antar-modul — tabel SDD-00 §4.2 baris 1 (SDD-SYS-02, SDD-SYS-03).
 * Satu zona per modul: dari dalam modul itu, seluruh isi modul LAIN tertutup
 * kecuali `index.ts`-nya. Isi modulnya sendiri dikecualikan lebih dulu, sebab
 * `repositories/` privat terhadap modul lain — bukan terhadap modulnya sendiri.
 */
const zonaAntarModul = modul.map((nama) => ({
  target: `./apps/api/src/modules/${nama}`,
  from: './apps/api/src/modules/**',
  except: [`**/modules/${nama}/**`, '**/modules/*/index.ts'],
  message: 'Modul lain hanya boleh disentuh lewat index.ts-nya (SDD-SYS-03); repositories/ dan controllers/ privat (SDD-00 §4.2).',
}));

/** Batas lapisan di dalam pohon backend — tabel SDD-00 §4.2. */
const zonaLapisan = [
  // shared kernel tidak boleh tahu tentang modul — jika tidak, ia berubah
  // menjadi simpul ketergantungan melingkar (SDD-SYS-06, SDD-00 §4.2 baris 3).
  { target: './apps/api/src/shared', from: './apps/api/src/modules' },
  // Entrypoint hanya boleh menyentuh permukaan publik modul; internal modul
  // tertutup baginya (SDD-SYS-03).
  // `from` sengaja ditulis sebagai glob: eslint-plugin-import hanya memperlakukan
  // `except` sebagai pola glob bila `from` pun glob.
  { target: './apps/api/src/api', from: './apps/api/src/modules/**', except: ['**/modules/*/index.ts'] },
  { target: './apps/api/src/worker', from: './apps/api/src/modules/**', except: ['**/modules/*/index.ts'] },
];

// Basis akar di-*spread* lebih dulu: sejak ESLint 10 konfigurasi dicari mulai dari
// direktori berkas yang di-lint lalu naik ke atas, sehingga berkas ini MEMBAYANGI
// konfigurasi akar alih-alih menambahinya.
//
// Kedua kelompok zona digabung dalam SATU deklarasi aturan karena opsi aturan
// bernama sama saling MENGGANTIKAN, bukan bergabung. Mendeklarasikannya dua kali
// membuat zona antar-pohon diam-diam hilang atas apps/api.
export default [
  ...basis,
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
        basePath: akarRepo,
        zones: [...zonaAntarPohon, ...zonaLapisan, ...zonaAntarModul],
      }],
      // SDD-SYS-07 — waktu selalu dari Clock yang di-inject. Aturan ini yang
      // membuatnya mengikat: tanpanya, `new Date()` akan menyelinap kembali satu
      // per satu dan TD-04 (uji jatuh tempo, TTL, SLA, eskalasi) kehilangan
      // satu-satunya titik yang dapat digantikan. shared/clock dikecualikan di
      // bawah — ia justru tempat panggilan itu seharusnya berada.
      'no-restricted-syntax': ['error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Waktu selalu dari Clock yang di-inject (SDD-SYS-07). Pakai clock.now(), bukan new Date().',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Waktu selalu dari Clock yang di-inject (SDD-SYS-07). Pakai clock.now(), bukan Date.now().',
        },
      ],
    },
  },
  {
    // Satu-satunya tempat `new Date()` boleh dipanggil (SDD-SYS-07). Pengecualian
    // ini sengaja berupa berkas, bukan komentar sebaris yang bisa disalin ke mana-mana.
    files: ['src/shared/clock/**/*.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];
