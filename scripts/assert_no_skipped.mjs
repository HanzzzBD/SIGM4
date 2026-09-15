// Penjaga CI: uji yang ter-skip adalah kegagalan, bukan hijau (PR-00-17).
//
// Seluruh suite integrasi digantung pada `describe.skipIf(!DATABASE_URL)` agar
// `npm test` tetap dapat dijalankan di mesin tanpa basis data. Di CI, suite yang
// ter-skip berarti lingkungannya tidak lengkap — dan acceptance yang hijau tanpa
// pernah dijalankan lebih berbahaya daripada yang merah (templates/PULL-REQUEST.md,
// temuan false green Phase 00). Skrip ini membaca laporan JSON Vitest dan gagal
// bila satu pun uji berstatus skipped, pending, atau todo.
//
// Pemakaian: node scripts/assert_no_skipped.mjs <laporan-json-vitest>

import { readFileSync } from "node:fs";

const berkas = process.argv[2];
if (!berkas) {
    console.error("Pemakaian: node scripts/assert_no_skipped.mjs <laporan-json-vitest>");
    process.exit(2);
}

const laporan = JSON.parse(readFileSync(berkas, "utf8"));
const terlewat = [];
for (const hasil of laporan.testResults ?? []) {
    for (const uji of hasil.assertionResults ?? []) {
        if (uji.status !== "passed" && uji.status !== "failed")
            terlewat.push(`${uji.status.padEnd(8)} ${hasil.name} › ${uji.fullName}`);
    }
}

if (laporan.numTotalTests === undefined || laporan.numTotalTests === 0) {
    console.error(`${berkas}: laporan tidak memuat satu pun uji — penjaga ini tidak membuktikan apa pun.`);
    process.exit(1);
}

if (terlewat.length > 0) {
    console.error(`${terlewat.length} uji tidak dijalankan. Lengkapi lingkungan CI (DATABASE_URL, REDIS_URL, APP_DATABASE_URL, APP_DB_PASSWORD):`);
    for (const baris of terlewat) console.error(`  ${baris}`);
    process.exit(1);
}

console.log(`${laporan.numTotalTests} uji dijalankan, 0 ter-skip.`);
