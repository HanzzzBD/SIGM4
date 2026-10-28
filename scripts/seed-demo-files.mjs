// Lampiran demonstrasi nyata: PDF/PNG/CSV lokal, dipindai ClamAV sebelum CLEAN.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import sharp from 'sharp';
import { SystemClock } from '../apps/api/dist/shared/clock/index.js';
import { AuditLogger } from '../apps/api/dist/shared/audit/index.js';
import { PenyimpananS3 } from '../apps/api/dist/shared/storage/index.js';
import { PembangkitPdfChromium } from '../apps/api/dist/shared/pdf/index.js';
import { svgQr } from '../apps/api/dist/shared/qr/index.js';
import { KlienClamd } from '../apps/api/dist/modules/m06-documents/index.js';
import { ASSET_IMPORT_COLUMNS, ROOM_SCHEDULE_IMPORT_COLUMNS } from '@sigm4/schemas';

try { process.loadEnvFile(); } catch { /* Lingkungan dapat memasok env langsung. */ }
const source = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
const local = value => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname);
if (process.env.NODE_ENV === 'production' || !source || !local(source) || !local(process.env.S3_ENDPOINT) || !local(process.env.CLAMAV_URL)) throw new Error('Lampiran demo hanya untuk database, S3, dan ClamAV lokal.');
const clock = new SystemClock(), now = clock.now(), audit = new AuditLogger({ clock });
const storage = new PenyimpananS3({ endpoint: process.env.S3_ENDPOINT, publicEndpoint: process.env.S3_PUBLIC_ENDPOINT,
  region: process.env.S3_REGION, bucket: process.env.S3_BUCKET, accessKey: process.env.S3_ACCESS_KEY, secretKey: process.env.S3_SECRET_KEY }, clock);
const avUrl = new URL(process.env.CLAMAV_URL), scanner = new KlienClamd({ host: avUrl.hostname, port: Number(avUrl.port) }, 10000);
const pdf = new PembangkitPdfChromium(process.env.CHROMIUM_EXECUTABLE_PATH || null);
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: source, options: '-c timezone=UTC' }) }) });
const html = (title, body) => `<!doctype html><html lang="id"><meta charset="utf-8"><style>@page{size:A4;margin:20mm}body{font-family:Arial;color:#172033;line-height:1.6}h1{font-size:24px}small{color:#64748b}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #ccd3dd;text-align:left}.qr{width:180px}svg{width:100%}</style><small>SIGM4 · SMKN 4 Bandung · DATA FIKTIF DEMONSTRASI</small><h1>${title}</h1>${body}<p>Dokumen contoh untuk demonstrasi lokal. Bukan dokumen pengadaan atau bukti transaksi sekolah yang sebenarnya.</p></html>`;
let inserted = 0;
try {
  await Promise.all([storage.periksa(), scanner.ping()]);
  const manifest = JSON.parse(await readFile('tmp/demo/manifest.json', 'utf8'));
  const owner = manifest.akun.find(a => a.peran === 'R-01').id, staff = manifest.akun.find(a => a.peran === 'R-02').id;
  const projector = await db.selectFrom('assets').selectAll().where('id', '=', manifest.tautan.proyektor.split('/').pop()).executeTakeFirstOrThrow();
  const stockAsset = await db.selectFrom('assets').selectAll().where('uuid', '=', manifest.tautan.qr_opname.split('/').pop()).executeTakeFirstOrThrow();
  const qrBase = process.env.APP_BASE_URL;
  const qrContent = [projector, stockAsset].map(a => `<h2>${a.nama}</h2><p>${a.kode_barang}</p><div class="qr">${svgQr(`${qrBase}/a/${a.uuid}`)}</div><p>${qrBase}/a/${a.uuid}</p>`).join('<hr>');
  await mkdir('tmp/demo/berkas', { recursive: true });
  async function artifact(name, render) {
    const path = `tmp/demo/berkas/${name}`;
    try { return await readFile(path); } catch { const bytes = await render(); await writeFile(path, bytes); return bytes; }
  }
  await artifact('LABEL-QR-DEMO.pdf', () => pdf.render(html('Label QR untuk demonstrasi', qrContent)));
  const png = await artifact('BUKTI-DEMO.png', () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#f1f5f9"/><rect x="230" y="130" width="500" height="300" rx="24" fill="#fff" stroke="#64748b" stroke-width="8"/><rect x="265" y="165" width="430" height="215" rx="8" fill="#dbeafe"/><path d="M400 430v55h160v-55M350 490h260" fill="none" stroke="#64748b" stroke-width="12"/><text x="480" y="285" text-anchor="middle" fill="#155dff" font-family="Arial" font-size="56">SIGM4</text><text x="480" y="565" text-anchor="middle" fill="#475569" font-family="Arial" font-size="24">ILUSTRASI PERANGKAT DEMO</text></svg>`)).png().toBuffer());
  const invoice = await artifact('FAKTUR-DEMO.pdf', () => pdf.render(html('Faktur Pembelian Proyektor Demo', `<p>Nomor: DEMO-FAKTUR-001</p><table><tr><th>Aset</th><th>Kode</th><th>Nilai</th></tr><tr><td>${projector.nama}</td><td>${projector.kode_barang}</td><td>Rp7.500.000</td></tr></table><p>Pemasok fiktif: CV Perangkat Belajar Demo.</p>`)));
  const manual = await artifact('MANUAL-DEMO.pdf', () => pdf.render(html('Panduan Pemakaian Proyektor Demo', '<ol><li>Periksa kabel listrik dan HDMI.</li><li>Nyalakan proyektor dan pilih sumber gambar.</li><li>Atur fokus serta posisi gambar.</li><li>Setelah selesai, matikan dan tunggu pendinginan.</li><li>Kembalikan bersama kabel dan tas ke petugas.</li></ol>')));
  const support = await artifact('SPESIFIKASI-DEMO.pdf', () => pdf.render(html('Spesifikasi dan Justifikasi Pengadaan Demo', '<p>Tambahan laptop untuk praktik RPL: prosesor setara Core i5, RAM 16 GB, SSD 512 GB, layar 14 inci, garansi minimal 1 tahun.</p><p>Tujuan: menambah ketersediaan perangkat untuk presentasi proyek siswa.</p>')));
  await writeFile('tmp/demo/berkas/BUKTI-DEMO.png', png);
  await writeFile('tmp/demo/berkas/FAKTUR-DEMO.pdf', invoice);
  await writeFile('tmp/demo/berkas/MANUAL-DEMO.pdf', manual);
  await writeFile('tmp/demo/berkas/SPESIFIKASI-DEMO.pdf', support);
  for (const bytes of [png, invoice, manual, support]) if (!(await scanner.pindai(bytes)).bersih) throw new Error('Lampiran demo tidak lolos antivirus.');
  await db.transaction().execute(async tx => {
    await tx.selectNoFrom(eb => eb.fn('pg_advisory_xact_lock', [eb.val(4815162344)]).as('locked')).execute();
    async function row(table, key, values) {
      let q = tx.selectFrom(table).selectAll(); for (const [k, v] of Object.entries(key)) q = q.where(k, '=', v);
      const old = await q.executeTakeFirst(); if (old) return old;
      const result = await tx.insertInto(table).values({ ...values, ...key }).returningAll().executeTakeFirstOrThrow(); inserted++;
      if (!await audit.writeCli(tx, { modul: 'm06-documents', aksi: 'DEMO_ATTACHMENT_CREATED', entitas: table, ...(result.id ? { entitasId: result.id } : {}), nilaiSesudah: { demo: true, ...key } })) throw new Error('Audit lampiran gagal.');
      return result;
    }
    async function file(name, bytes, mime, type, ownerId = null) {
      const objectKey = `demo/sigm4-v1/${name}`;
      if (!await storage.info(objectKey)) await storage.simpan(objectKey, bytes, mime);
      const f = await row('stored_files', { object_key: objectKey }, { mime, ukuran: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex'), scan_status: 'CLEAN', scanned_at: now, owner_type: type, owner_id: ownerId, uploaded_by: owner });
      return f;
    }
    for (const [name, bytes, kind] of [['faktur-proyektor.pdf', invoice, 'FAKTUR'], ['manual-proyektor.pdf', manual, 'MANUAL']]) {
      const f = await file(name, bytes, 'application/pdf', 'ASSET_DOCUMENT');
      const doc = await row('asset_documents', { file_id: f.id }, { jenis: kind, nama_berkas: name, keterangan: 'DEMO - Dokumen pendukung aset', created_by: owner, updated_by: owner });
      if (!f.owner_id) {
        await tx.updateTable('stored_files').set({ owner_id: doc.id }).where('id', '=', f.id).execute();
        if (!await audit.writeCli(tx, { modul: 'm06-documents', aksi: 'DEMO_ATTACHMENT_LINKED', entitas: 'stored_files', entitasId: f.id, nilaiSesudah: { owner_id: doc.id } })) throw new Error('Audit pemilik gagal.');
      }
      await row('asset_document_links', { document_id: doc.id, asset_id: projector.id }, { created_by: owner });
    }
    const assetImage = await file('proyektor.png', png, 'image/png', 'ASSET_PHOTO', projector.id);
    await row('asset_photos', { asset_id: projector.id, file_id: assetImage.id }, { is_primary: true, diunggah_oleh: owner });
    const damageId = manifest.tautan.kerusakan.split('/').pop();
    const damageImage = await file('temuan-printer.png', png, 'image/png', 'DAMAGE_PHOTO', damageId);
    await row('damage_report_photos', { damage_report_id: damageId, file_id: damageImage.id }, { urutan: 1 });
    const workId = manifest.tautan.tugas_teknisi.split('/').pop();
    const workImage = await file('pemeriksaan-teknisi.png', png, 'image/png', 'WORK_ORDER_PHOTO', workId);
    await row('work_order_photos', { work_order_id: workId, file_id: workImage.id }, { urutan: 1, created_by: staff });
    const procurementId = manifest.tautan.pengadaan.split('/').pop();
    const specFile = await file('spesifikasi-laptop.pdf', support, 'application/pdf', 'PROCUREMENT_ATTACHMENT', procurementId);
    await row('procurement_attachments', { procurement_id: procurementId, file_id: specFile.id }, { nama_berkas: 'Spesifikasi Laptop Demo.pdf', created_by: owner });
  });
  const cells = values => values.map(v => `"${String(v ?? '').replaceAll('"', '""')}"`).join(',');
  const sampleAsset = { nama_barang: 'Monitor Praktik Tambahan (Demo Impor)', kode_kategori: 'DM-KOM', merek: 'Dell', model: '24 inci', tahun_perolehan: now.getUTCFullYear(), sumber_perolehan: 'PEMBELIAN', nilai_perolehan: 1800000, kode_ruangan: 'DM-LAB', kondisi: 'BAIK', dapat_dipinjam: 'false', boleh_dipinjam_siswa: 'false', jumlah_unit: 2 };
  await writeFile('tmp/demo/berkas/IMPORT-ASET-DEMO.csv', '\uFEFF' + ASSET_IMPORT_COLUMNS.join(',') + '\r\n' + cells(ASSET_IMPORT_COLUMNS.map(c => sampleAsset[c])) + '\r\n');
  await writeFile('tmp/demo/berkas/IMPORT-PENGGUNA-DEMO.csv', '\uFEFFnama_lengkap,email,nip_nis,kode_role,kode_unit_kerja,telepon\r\nBagas Guru Impor Demo,bagas.impor@demo.sigm4.test,DEMO-IMP-001,R-05,DM-RPL,\r\n');
  const start = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }), end = new Date(now.getTime() + 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  await writeFile('tmp/demo/berkas/IMPORT-JADWAL-DEMO.csv', '\uFEFF' + ROOM_SCHEDULE_IMPORT_COLUMNS.join(',') + '\r\n' + cells(['DM-JARINGAN', 'Senin', '07:00', '08:00', 'Demo - Praktik Jaringan Tetap', start, end]) + '\r\n');
  console.log(JSON.stringify({ lampiran_ditambahkan: inserted, antivirus: 'CLEAN', berkas: 'tmp/demo/berkas', qr_base: qrBase }, null, 2));
} catch (error) { console.error('Lampiran demo gagal:', error instanceof Error ? error.message : 'Galat tidak dikenal.'); process.exitCode = 1; }
finally { await db.destroy(); }
