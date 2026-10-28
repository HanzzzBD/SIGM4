// Partisi `activity_logs` untuk jendela tanggal uji (keputusan log phase-02 §7, 1 Oktober 2026).
//
// Migration 0008 hanya membuat partisi bulan BERJALAN + tiga bulan ke depan, dan job
// `activity-log-partition` meneruskannya ke depan. Uji integrasi memakai `FixedClock`
// bertanggal tetap (kebanyakan September 2026): begitu basis data dibuat pada bulan
// sesudahnya, entri log berwaktu itu tidak punya partisi ("no partition of relation") —
// diam-diam, karena kegagalan tulis log tidak menggagalkan transaksi (AL-08). Berkas ini
// menyiapkan partisi seluruh jendela uji dengan SQL yang sama dengan `ensurePartitions`
// (CREATE + REVOKE, AL-03b). Hanya lingkungan uji; produksi tetap pada job terjadwal.
//
// Pemakaian: node partisi.mjs   (DATABASE_URL / MIGRATION_DATABASE_URL dari env)

import process from 'node:process';
import pg from 'pg';

/** Jendela tanggal FixedClock pada `tests/**` — perluas bila uji baru memakai bulan di luarnya. */
export const JENDELA = { dari: [2026, 1], sampai: [2027, 12] };

const url = (process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL)?.trim();
if (!url) process.exit(0);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // `activity_logs` belum ada (mis. sesudah `down` melewati 0008): tidak ada yang disiapkan.
  const { rows } = await client.query("SELECT to_regclass('public.activity_logs') IS NOT NULL AS ada");
  if (rows[0]?.ada === true) {
    for (let t = JENDELA.dari[0], b = JENDELA.dari[1]; t < JENDELA.sampai[0] || (t === JENDELA.sampai[0] && b <= JENDELA.sampai[1]); b === 12 ? ((t += 1), (b = 1)) : (b += 1)) {
      const dari = new Date(Date.UTC(t, b - 1, 1)).toISOString();
      const sampai = new Date(Date.UTC(t, b, 1)).toISOString();
      const nama = `activity_logs_${t}_${String(b).padStart(2, '0')}`;
      await client.query(`CREATE TABLE IF NOT EXISTS "${nama}" PARTITION OF activity_logs FOR VALUES FROM ('${dari}') TO ('${sampai}')`);
      await client.query(`REVOKE UPDATE, DELETE, TRUNCATE ON "${nama}" FROM sigm4_app`);
    }
  }
} finally {
  await client.end();
}
