// Pemeriksaan read-only relasi, ledger, berkas dan hash audit dataset demonstrasi.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { DisposalCandidateSchema } from '@sigm4/schemas';
import { hashBaris } from '../apps/api/dist/shared/audit/index.js';
import { validateCondition } from '../apps/api/dist/modules/m10-approval/index.js';
import { SystemClock } from '../apps/api/dist/shared/clock/index.js';
import { PenyimpananS3 } from '../apps/api/dist/shared/storage/index.js';
try { process.loadEnvFile(); } catch { /* Env dapat dipasok proses induk. */ }
const source = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!source || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(source).hostname)) throw new Error('Verifikasi demo memerlukan database lokal.');
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: source, options: '-c timezone=UTC' }) }) });
try {
  const manifest = JSON.parse(await readFile('tmp/demo/manifest.json', 'utf8'));
  const owner = manifest.akun.find(a => a.peran === 'R-01').id;
  const assets = await db.selectFrom('assets').selectAll().where('kode_barang', 'like', 'DEMO-%').execute();
  assert.equal(assets.length, 48);
  const users = await db.selectFrom('users').selectAll().where('email', 'like', '%@demo.sigm4.test').execute();
  assert(users.length >= 7); assert(new Set(users.map(u => u.role_id)).size >= 7);
  const rules = await db.selectFrom('approval_rules').selectAll().where('created_by', '=', owner).where('prioritas', '=', 9001).execute();
  assert.equal(rules.length, 6);
  for (const rule of rules) validateCondition(rule.kondisi, rule.jenis_pengajuan);
  const ledger = await sql`select b.material_id,b.room_id,b.saldo,coalesce(sum(t.jumlah),0)::int as calculated from material_balances b join materials m on m.id=b.material_id left join material_transactions t on t.material_id=b.material_id and t.room_id=b.room_id where m.nama like '%(Demo)' group by b.id,b.material_id,b.room_id,b.saldo`.execute(db);
  assert.equal(ledger.rows.length, 8);
  for (const balance of ledger.rows) assert.equal(balance.saldo, balance.calculated, 'Saldo harus sama dengan total ledger');
  const snapshots = await db.selectFrom('asset_disposal_items as i').innerJoin('asset_disposals as d', 'd.id', 'i.disposal_id').select('i.snapshot').where('d.created_by', '=', owner).execute();
  for (const row of snapshots) DisposalCandidateSchema.parse(row.snapshot);
  // Database pengembangan dapat memuat log fixture performa lama tanpa hash sah.
  // Periksa seluruh sambungan sejak seed pertama, berjangkar pada ekor sebelumnya.
  const first = await db.selectFrom('activity_logs').select(eb => eb.fn.min('id').as('id')).where('aksi', '=', 'DEMO_DATA_CREATED').executeTakeFirstOrThrow();
  assert(first.id);
  const prior = await db.selectFrom('activity_logs').select('row_hash').where('id', '<', first.id).orderBy('id', 'desc').executeTakeFirst();
  const auditRows = await db.selectFrom('activity_logs').selectAll().where('id', '>=', first.id).orderBy('id').execute();
  let previous = prior?.row_hash ?? null;
  for (const row of auditRows) {
    assert(previous === null ? row.prev_hash === null : row.prev_hash?.equals(previous), `Sambungan audit ${row.id}`);
    assert(hashBaris(row.prev_hash, { ...row, user_id: row.user_id === null ? null : Number(row.user_id), entitas_id: row.entitas_id === null ? null : Number(row.entitas_id) }).equals(row.row_hash), `Isi audit ${row.id}`);
    previous = row.row_hash;
  }
  const files = await db.selectFrom('stored_files').selectAll().where('object_key', 'like', 'demo/sigm4-v1/%').execute();
  assert.equal(files.length, 6);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.S3_ENDPOINT).hostname));
  const storage = new PenyimpananS3({ endpoint: process.env.S3_ENDPOINT, publicEndpoint: process.env.S3_PUBLIC_ENDPOINT, region: process.env.S3_REGION, bucket: process.env.S3_BUCKET, accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY }, new SystemClock());
  for (const f of files) {
    assert.equal(f.scan_status, 'CLEAN');
    const bytes = await storage.ambil(f.object_key);
    assert(bytes && bytes.length === Number(f.ukuran));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), f.checksum);
  }
  const result = { lulus: true, aset: assets.length, pengguna: users.length, aturan: rules.length, saldo_ledger: ledger.rows.length, snapshot_penghapusan: snapshots.length, baris_audit: auditRows.length, lingkup_audit: 'Sejak seed demo pertama, berjangkar pada hash baris sebelumnya', kerusakan_rantai: 0, objek_lampiran: files.length };
  await writeFile('tmp/demo/verification.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await db.destroy(); }
