// Penjaga urutan id lintas `dbmate down` di lingkungan uji (utang §10 log phase-02).
//
// `dbmate down` sampai sebelum tabel dibuat men-DROP tabel beserta sequence-nya, sehingga
// `up` berikutnya memulai id dari 1 lagi dan berkas uji sesudahnya memakai id yang sama
// untuk orang yang berbeda — keadaan bersama berkunci id (cache, rate limit) tertukar
// diam-diam. Sebelum dbmate, `simpan` mencatat `last_value` tiap sequence ke berkas
// sementara (gabungan nilai terbesar); sesudahnya `pulihkan` menaikkan sequence yang
// lahir ulang ke nilai itu. Tidak ada jejak di basis data — uji skema tidak terdampak.
//
// Pemakaian: node urutan.mjs simpan|pulihkan <berkas-json>   (DATABASE_URL dari env)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import pg from 'pg';

const [perintah, berkas] = process.argv.slice(2);
const url = (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
if (!url || !berkas || (perintah !== 'simpan' && perintah !== 'pulihkan')) process.exit(0);

const baca = () => (existsSync(berkas) ? JSON.parse(readFileSync(berkas, 'utf8')) : {});
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query(
    "SELECT format('%I.%I', schemaname, sequencename) AS nama, last_value::text AS nilai FROM pg_sequences WHERE schemaname = 'public'",
  );
  const catatan = baca();
  if (perintah === 'simpan') {
    for (const r of rows) {
      if (r.nilai !== null && BigInt(r.nilai) > BigInt(catatan[r.nama] ?? '0')) catatan[r.nama] = r.nilai;
    }
    writeFileSync(berkas, JSON.stringify(catatan));
  } else {
    for (const r of rows) {
      const tercatat = catatan[r.nama];
      // Hanya menaikkan, tidak pernah menurunkan: sequence yang tidak lahir ulang dibiarkan.
      if (tercatat !== undefined && (r.nilai === null || BigInt(r.nilai) < BigInt(tercatat))) {
        await client.query('SELECT setval($1::regclass, $2::bigint, true)', [r.nama, tercatat]);
      }
    }
  }
} finally {
  await client.end();
}
