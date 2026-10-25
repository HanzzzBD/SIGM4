// Dataset lokal lintas modul untuk demonstrasi FR-04/07/09/10/11/12/13/14/21/22.
// Tidak menghapus data atau menimpa progres demonstrasi. AL-01: audit dalam transaksi.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { AuditLogger } from '../apps/api/dist/shared/audit/index.js';
import { SystemClock } from '../apps/api/dist/shared/clock/index.js';
import { hashPassword, bangkitkanKodeTunggal, tampilkanKodeCadangan } from '../apps/api/dist/shared/security/index.js';
import { createAuthContext } from '../apps/api/dist/shared/auth/index.js';
import { DocumentNumberService } from '../apps/api/dist/shared/numbering/index.js';
import { ApprovalService, validateCondition } from '../apps/api/dist/modules/m10-approval/index.js';

try { process.loadEnvFile(); } catch { /* CI dapat memasok lingkungan langsung. */ }
const source = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!source) throw new Error('DATABASE_URL wajib diisi.');
const target = new URL(source);
if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('Seed demo hanya untuk database lokal nonproduction.');
}
const clock = new SystemClock(), now = clock.now();
const date = (offset = 0, hour = 9) => {
  const day = new Date(now.getTime() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  return new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+07:00`);
};
const day = offset => date(offset).toISOString().slice(0, 10);
const year = Number(now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 4));
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: source, options: '-c timezone=UTC' }) }) });
const audit = new AuditLogger({ clock }), numbers = new DocumentNumberService(clock);
const manifest = { versi: 1, dibuat_pada: now.toISOString(), database: target.pathname.slice(1), akun: [], data: {}, tautan: {}, hasil: {} };
const accessPath = 'tmp/demo/AKSES-DEMO.json';
let access;
try { access = JSON.parse(await readFile(accessPath, 'utf8')); }
catch { access = { password: process.env.DEMO_PASSWORD || `Praktik!${randomUUID().slice(0, 8)}Aa7`, aktivasi: {} }; }
if (process.env.DEMO_PASSWORD) access.password = process.env.DEMO_PASSWORD;
const counts = { ditambahkan: 0, sudah_ada: 0 };

try {
  await db.transaction().execute(async tx => {
    // Serialkan seed agar dua operator tidak membuat dua himpunan demo bersamaan.
    await tx.selectNoFrom(eb => eb.fn('pg_advisory_xact_lock', [eb.val(4815162344)]).as('locked')).execute();
    const columns = await tx.selectFrom('information_schema.columns').select(['table_name', 'column_name', 'data_type']).where('table_schema', '=', 'public').execute();
    const has = (t, col) => columns.some(c => c.table_name === t && c.column_name === col);
    const json = (t, values) => Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
      columns.some(c => c.table_name === t && c.column_name === key && c.data_type === 'jsonb') && value !== null && typeof value !== 'string' ? JSON.stringify(value) : value]));
    async function record(table, key, values, module = 'demo') {
      let query = tx.selectFrom(table).selectAll();
      for (const [field, value] of Object.entries(key)) query = value === null ? query.where(field, 'is', null) : query.where(field, '=', value);
      const found = await query.executeTakeFirst();
      if (found) { counts.sudah_ada++; return found; }
      const row = await tx.insertInto(table).values(json(table, { ...values, ...key })).returningAll().executeTakeFirstOrThrow();
      counts.ditambahkan++;
      // AuditLogger melakukan redaksi; snapshot di sini hanya identitas fixture.
      const ok = await audit.writeCli(tx, { modul: module, aksi: 'DEMO_DATA_CREATED', entitas: table,
        ...(row.id ? { entitasId: row.id } : {}), nilaiSesudah: { demo: 'SIGM4-DEMO-v1', kunci: key }, keterangan: 'Data fiktif untuk demonstrasi lokal SIGM4.' });
      if (!ok) throw new Error(`Audit seed gagal: ${table}`);
      return row;
    }
    async function update(table, id, values) {
      await tx.updateTable(table).set(json(table, values)).where('id', '=', id).execute();
      if (!await audit.writeCli(tx, { modul: 'demo', aksi: 'DEMO_DATA_LINKED', entitas: table, entitasId: id, nilaiSesudah: values })) throw new Error('Audit pengaitan gagal.');
    }
    async function numbered(table, prefix, key, values, module) {
      let q = tx.selectFrom(table).selectAll();
      for (const [k, v] of Object.entries(key)) q = q.where(k, '=', v);
      const old = await q.executeTakeFirst();
      if (old) { counts.sudah_ada++; return old; }
      return record(table, key, { nomor: await numbers.next(tx, prefix), ...values }, module);
    }
    const roles = await tx.selectFrom('roles').selectAll().execute();
    const people = [
      ['admin', 'Administrator Demo', 'R-01'], ['sarpras', 'Raka Petugas Demo', 'R-02'],
      ['pimpinan', 'Ratna Pimpinan Demo', 'R-03'], ['teknisi', 'Dimas Teknisi Demo', 'R-04'],
      ['guru', 'Nadia Guru Demo', 'R-05'], ['staf', 'Sari Tata Usaha Demo', 'R-06'], ['siswa', 'Fajar Siswa Demo', 'R-07'],
    ];
    const users = {};
    const passwordHash = await hashPassword(access.password);
    for (const [key, nama, role] of people) {
      const u = await record('users', { email: `${key}@demo.sigm4.test` }, {
        nama, password_hash: passwordHash, nip_nis: `DEMO-${role}`, role_id: roles.find(r => r.kode === role).id,
        status: 'AKTIF', must_change_password: false, ...(role === 'R-07' ? { consent_guardian_at: now } : {}),
      }, 'm02-users');
      users[key] = u;
      manifest.akun.push({ peran: role, email: u.email, id: u.id });
      if (['R-01', 'R-03'].includes(role) && !u.totp_enabled_at) {
        const existing = await tx.selectFrom('totp_activation_codes').selectAll().where('user_id', '=', u.id).where('consumed_at', 'is', null).executeTakeFirst();
        if (!existing || existing.expires_at < now) {
          if (existing) await tx.deleteFrom('totp_activation_codes').where('id', '=', existing.id).execute();
          const code = bangkitkanKodeTunggal();
          await record('totp_activation_codes', { user_id: u.id, consumed_at: null }, {
            code_hash: await hashPassword(code), issued_at: now, expires_at: new Date(now.getTime() + 86400000),
          }, 'm01-auth');
          access.aktivasi[u.email] = tampilkanKodeCadangan(code);
        }
      }
    }
    const owner = users.admin.id, staff = users.sarpras.id;
    const meta = { created_by: owner, updated_by: owner };
    const demoSettings = { 'denda.tarif_per_hari': 2000, 'denda.cap_nominal': 100000, 'denda.ambang_blokir': 100000,
      'bahan.ambang_permintaan_default': 10, 'maintenance.ambang_penggantian_persen': 60, 'maintenance.ambang_persetujuan_estimasi': 1000000 };
    for (const [key, value] of Object.entries(demoSettings)) {
      const setting = await tx.selectFrom('system_settings').selectAll().where('key', '=', key).executeTakeFirst();
      if (setting && setting.value === null) {
        await tx.updateTable('system_settings').set({ value: JSON.stringify(value), updated_by: owner }).where('key', '=', key).execute();
        if (!await audit.writeCli(tx, { modul: 'm20-settings', aksi: 'DEMO_SETTING_INITIALIZED', entitas: 'system_settings', nilaiSesudah: { key, value }, keterangan: 'Mengisi parameter demo yang sebelumnya belum dikonfigurasi.' })) throw new Error('Audit konfigurasi gagal.');
      }
    }
    const unit = await record('work_units', { kode: 'DM-SAR' }, { nama: 'Demo - Sarana Prasarana', jenis: 'MANAJEMEN', ...meta }, 'm20-settings');
    const classroom = await record('work_units', { kode: 'DM-XIRPL1' }, { nama: 'Demo - XI RPL 1', jenis: 'KELAS', ...meta }, 'm20-settings');
    const subject = await record('work_units', { kode: 'DM-RPL' }, { nama: 'Demo - Rekayasa Perangkat Lunak', jenis: 'MATA_PELAJARAN', ...meta }, 'm20-settings');
    for (const key of ['sarpras', 'teknisi', 'guru', 'siswa']) if (!users[key].work_unit_id) await update('users', users[key].id, { work_unit_id: key === 'siswa' ? classroom.id : key === 'guru' ? subject.id : unit.id });
    const academicStart = now.getUTCMonth() >= 6 ? year : year - 1;
    let academic = await tx.selectFrom('academic_years').selectAll().where('is_active', '=', true).executeTakeFirst();
    if (!academic) academic = await record('academic_years', { nama: `${academicStart}/${academicStart + 1}` }, { tanggal_mulai: `${academicStart}-07-01`, tanggal_selesai: `${academicStart + 1}-06-30`, is_active: true, ...meta }, 'm20-settings');
    for (const [nama, start, end] of [['GANJIL', `${academicStart}-07-01`, `${academicStart}-12-31`], ['GENAP', `${academicStart + 1}-01-01`, `${academicStart + 1}-06-30`]]) {
      await record('academic_terms', { academic_year_id: academic.id, nama }, { tanggal_mulai: start, tanggal_selesai: end, ...meta }, 'm20-settings');
    }
    await record('student_enrollments', { user_id: users.siswa.id, academic_year_id: academic.id }, { kelas_id: classroom.id, ...meta }, 'm02-users');
    const buildings = {}, areas = {}, rooms = {};
    for (const [key, nama] of [['A', 'Demo - Gedung Pembelajaran'], ['B', 'Demo - Gedung Praktik'], ['C', 'Demo - Gedung Layanan']]) {
      buildings[key] = await record('buildings', { kode: `DM-${key}` }, { nama, keterangan: 'Lokasi fiktif untuk demo SIGM4', ...meta }, 'm03-locations');
      areas[key] = await record('areas', { building_id: buildings[key].id, kode: `DM-${key}1` }, { nama: 'Lantai 1 Demo', lantai: 1, ...meta }, 'm03-locations');
    }
    const roomDefs = [
      ['kelas', 'A', 'Demo - Kelas XI RPL 1', 'KELAS', 36], ['kelas2', 'A', 'Demo - Kelas X TKJ 1', 'KELAS', 36],
      ['aula', 'A', 'Demo - Aula Serbaguna', 'AULA', 150], ['lab', 'B', 'Demo - Laboratorium RPL', 'LABORATORIUM', 36],
      ['jaringan', 'B', 'Demo - Laboratorium Jaringan', 'LABORATORIUM', 36], ['bengkel', 'B', 'Demo - Bengkel Elektronika', 'LABORATORIUM', 30],
      ['gudang', 'C', 'Demo - Gudang Sarpras', 'GUDANG', 10], ['perpus', 'C', 'Demo - Perpustakaan', 'PERPUSTAKAAN', 50],
      ['tu', 'C', 'Demo - Ruang Tata Usaha', 'KANTOR', 12], ['lapangan', 'C', 'Demo - Lapangan Upacara', 'LAPANGAN', 300],
    ];
    for (const [key, building, nama, jenis, kapasitas] of roomDefs) rooms[key] = await record('rooms', { kode: `DM-${key.toUpperCase()}` }, {
      area_id: areas[building].id, nama, jenis, kapasitas, penanggung_jawab_id: staff,
      dapat_direservasi: ['aula', 'lab', 'jaringan', 'lapangan'].includes(key), boleh_direservasi_siswa: ['aula', 'lapangan'].includes(key), ...meta,
    }, 'm03-locations');
    const fixed = await record('room_fixed_schedules', { room_id: rooms.jaringan.id, label_kegiatan: 'Demo - Praktik Jaringan Mingguan' }, {
      hari: 1, jam_mulai: '07:00', jam_selesai: '08:00', berlaku_mulai: day(0), berlaku_sampai: day(30), ...meta,
    }, 'm07-reservation-room');
    if (fixed.status === 'AKTIF') for (let offset = 0; offset <= 30; offset++) {
      const occurrence = date(offset, 7);
      if (occurrence.getUTCDay() !== 1 || day(offset) < new Date(fixed.berlaku_mulai).toISOString().slice(0, 10) || day(offset) > new Date(fixed.berlaku_sampai).toISOString().slice(0, 10)) continue;
      await record('booking_slots', { fixed_schedule_id: fixed.id, slot_range: `[${occurrence.toISOString()},${date(offset, 8).toISOString()})` }, { resource_type: 'room', resource_id: rooms.jaringan.id, origin: 'fixed_schedule', status: 'CONFIRMED', created_by: staff }, 'm07-reservation-room');
    }
    const block = await record('room_manual_blocks', { room_id: rooms.aula.id, label_kegiatan: 'Demo - Persiapan Pameran Sekolah' }, { mulai: date(1, 13), selesai: date(1, 15), ...meta }, 'm07-reservation-room');
    if (block.status === 'AKTIF') await record('booking_slots', { manual_block_id: block.id }, { resource_type: 'room', resource_id: rooms.aula.id, slot_range: `[${block.mulai.toISOString()},${block.selesai.toISOString()})`, origin: 'manual_block', status: 'CONFIRMED', created_by: staff }, 'm07-reservation-room');
    const categories = {};
    for (const [key, nama] of [['KOM', 'Demo - Komputer'], ['AV', 'Demo - Audio Visual'], ['JRG', 'Demo - Jaringan'], ['MEB', 'Demo - Mebel'], ['ELK', 'Demo - Elektronika'], ['KTR', 'Demo - Peralatan Kantor']]) categories[key] = await record('asset_categories', { kode: `DM-${key}` }, { nama, umur_teknis_tahun: key === 'MEB' ? 10 : 5, interval_preventif_hari: 90, ...meta }, 'm04-assets');
    const assetDefs = [
      ['KOM', 'Komputer Praktik RPL', 'lab', 'Lenovo', 8500000, 12], ['KOM', 'Laptop Pembelajaran', 'gudang', 'ASUS', 9500000, 5],
      ['AV', 'Proyektor Presentasi', 'gudang', 'Epson', 7500000, 4], ['AV', 'Speaker Portable', 'aula', 'JBL', 3500000, 2],
      ['JRG', 'Router Praktik', 'jaringan', 'MikroTik', 1500000, 4], ['JRG', 'Switch 24 Port', 'jaringan', 'TP-Link', 2200000, 2],
      ['MEB', 'Meja Praktik', 'lab', 'Lokal', 800000, 6], ['MEB', 'Kursi Belajar', 'kelas', 'Lokal', 350000, 8],
      ['ELK', 'Multimeter Digital', 'bengkel', 'Sanwa', 650000, 3], ['KTR', 'Printer Administrasi', 'tu', 'Canon', 2800000, 2],
    ];
    const assets = [], byName = {};
    for (const [cat, nama, room, merek, value, count] of assetDefs) {
      byName[nama] = [];
      for (let i = 1; i <= count; i++) {
        const a = await record('assets', { kode_barang: `DEMO-${cat}-${String(assets.length + 1).padStart(4, '0')}` }, {
          nama: `${nama} ${String(i).padStart(2, '0')} (Demo)`, category_id: categories[cat].id, merek, model: 'Seri Pembelajaran',
          nomor_seri: `DEMO-SN-${cat}-${nama.split(' ')[0]}-${i}`, tahun_perolehan: year - (i % 4), sumber_perolehan: i % 3 === 0 ? 'BANTUAN_PEMERINTAH' : 'PEMBELIAN',
          nilai_perolehan: value.toFixed(2), room_id: rooms[room].id, kondisi: 'BAIK', penanggung_jawab_id: staff,
          dapat_dipinjam: ['Laptop Pembelajaran', 'Proyektor Presentasi', 'Multimeter Digital'].includes(nama),
          boleh_dipinjam_siswa: nama === 'Multimeter Digital', qr_terpasang: true, ...meta,
        }, 'm04-assets');
        assets.push(a); byName[nama].push(a);
      }
    }
    // Unit khusus kerusakan, perawatan, penghapusan tidak dipakai pada transaksi lain.
    const damaged = byName['Printer Administrasi'][0], repair = byName['Komputer Praktik RPL'][0], obsolete = byName['Komputer Praktik RPL'][1];
    for (const [a, kondisi, status] of [[damaged, 'RUSAK_RINGAN', 'TERSEDIA'], [repair, 'RUSAK_RINGAN', 'DALAM_PERBAIKAN'], [obsolete, 'RUSAK_BERAT', 'TIDAK_TERSEDIA']]) {
      const history = await record('asset_condition_history', { asset_id: a.id, alasan: 'Temuan pemeriksaan awal demo SIGM4' }, { kondisi_lama: 'BAIK', kondisi_baru: kondisi, diubah_oleh: staff, diubah_pada: now }, 'm04-assets');
      if (a.kondisi === 'BAIK' && history.diubah_pada.getTime() === now.getTime()) { await update('assets', a.id, { kondisi, status }); a.kondisi = kondisi; a.status = status; }
    }
    // Aturan dibatasi pemohon demo, tidak mengubah alur pengguna lain.
    const demoIds = Object.values(users).map(u => Number(u.id));
    const rules = {};
    for (const jenis of ['RESERVASI_RUANGAN', 'RESERVASI_ASET', 'PERPANJANGAN_PEMINJAMAN', 'PENGADAAN_BARANG', 'PENGHAPUSAN_ASET', 'PERMINTAAN_BAHAN']) {
      const condition = validateCondition({ operator: 'OR', conditions: demoIds.map(id => ({ field: 'requester_id', op: 'eq', value: id })) }, jenis);
      const rule = await record('approval_rules', { jenis_pengajuan: jenis, prioritas: 9001, created_by: owner }, {
        kondisi: condition, ...meta,
      }, 'm10-approval');
      if (rule.kondisi.op === 'in') await update('approval_rules', rule.id, { kondisi: condition, versi: rule.versi + 1 });
      const approver = ['PENGADAAN_BARANG', 'PENGHAPUSAN_ASET'].includes(jenis) ? users.pimpinan : users.sarpras;
      await record('approval_rule_steps', { rule_id: rule.id, urutan: 1 }, { approver_type: 'user', approver_user_id: approver.id, sla_jam: 24 }, 'm10-approval');
      rules[jenis] = rule;
    }
    const approval = new ApprovalService(db, audit, clock);
    async function approveFor(row, jenis, applicant, status = 'MENUNGGU') {
      const exists = await tx.selectFrom('approval_instances').selectAll().where('jenis_pengajuan', '=', jenis).where('referensi_id', '=', row.id).executeTakeFirst();
      if (exists) return exists.id;
      const person = Object.values(users).find(u => u.id === applicant), role = roles.find(r => r.id === person.role_id);
      const permissions = await tx.selectFrom('role_permissions as rp').innerJoin('permissions as p', 'p.id', 'rp.permission_id').select(['p.kode', 'rp.scope']).where('rp.role_id', '=', role.id).execute();
      const ctx = createAuthContext({ userId: Number(applicant), roleCode: role.kode, scopes: new Map(permissions.map(p => [p.kode, p.scope.toLowerCase()])) });
      const result = await approval.createInstance({ tx, ctx }, { jenis, referensiId: Number(row.id), pemohonId: Number(applicant), fakta: { requester_id: Number(applicant), requester_role: role.kode } });
      const id = String(result.instanceId);
      if (status !== 'MENUNGGU') {
        const decider = ['PENGADAAN_BARANG', 'PENGHAPUSAN_ASET'].includes(jenis) ? users.pimpinan.id : staff;
        await tx.updateTable('approval_steps').set({ keputusan: status, catatan: 'Keputusan contoh demo yang sudah selesai.', diputuskan_oleh: decider, diputuskan_pada: now }).where('instance_id', '=', id).where('urutan', '=', 1).execute();
        await update('approval_instances', id, { status, langkah_aktif: null, diselesaikan_pada: now });
      }
      if (has(row.jenis === 'ASET' || row.jenis === 'RUANGAN' ? 'reservations' : jenis === 'PENGADAAN_BARANG' ? 'procurements' : jenis === 'PENGHAPUSAN_ASET' ? 'asset_disposals' : 'material_requests', 'approval_instance_id')) {
        const table = jenis === 'PENGADAAN_BARANG' ? 'procurements' : jenis === 'PENGHAPUSAN_ASET' ? 'asset_disposals' : 'material_requests';
        if (!jenis.startsWith('RESERVASI')) await update(table, row.id, { approval_instance_id: id });
      }
      return id;
    }
    const reservations = [];
    async function reservation(label, offset, status, kind = 'RUANGAN', resource = rooms.aula, applicant = users.guru, hour = 9) {
      const row = await numbered('reservations', kind === 'RUANGAN' ? 'RSV-RG' : 'RSV-BR', { keterangan: `DEMO: ${label}`, pemohon_id: applicant.id }, {
        jenis: kind, room_id: kind === 'RUANGAN' ? resource.id : null, nama_kegiatan: label, jenis_kegiatan: 'Pembelajaran', jumlah_peserta: 32,
        keperluan: `Demonstrasi SIGM4 - ${label}`, lokasi_penggunaan: 'Demo - SMKN 4 Bandung', waktu_mulai: date(offset, hour), waktu_selesai: date(offset, hour + 2), status, ...meta,
      }, 'm07-reservation-room');
      if (kind === 'ASET') await record('reservation_items', { reservation_id: row.id, asset_id: resource.id }, {}, 'm08-reservation-item');
      if (['MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'BERLANGSUNG', 'SELESAI', 'DITOLAK'].includes(row.status)) await approveFor(row, kind === 'RUANGAN' ? 'RESERVASI_RUANGAN' : 'RESERVASI_ASET', applicant.id, row.status === 'MENUNGGU_PERSETUJUAN' ? 'MENUNGGU' : row.status === 'DITOLAK' ? 'DITOLAK' : 'DISETUJUI');
      if (kind === 'RUANGAN' && ['DISETUJUI', 'BERLANGSUNG', 'MENUNGGU_PERSETUJUAN'].includes(row.status)) await record('booking_slots', { reservation_id: row.id, resource_type: 'room', resource_id: resource.id }, {
        slot_range: `[${row.waktu_mulai.toISOString()},${row.waktu_selesai.toISOString()})`, status: row.status === 'MENUNGGU_PERSETUJUAN' ? 'TENTATIVE' : 'CONFIRMED', origin: 'reservation', expires_at: new Date(now.getTime() + 36 * 3600000), created_by: applicant.id,
      }, 'm07-reservation-room');
      reservations.push(row); return row;
    }
    await reservation('Workshop Portofolio Siswa', 4, 'MENUNGGU_PERSETUJUAN');
    await reservation('Presentasi Proyek RPL', 2, 'DISETUJUI', 'RUANGAN', rooms.lab);
    await reservation('Rapat Persiapan Pameran', 3, 'DISETUJUI', 'RUANGAN', rooms.aula, users.staf);
    await reservation('Latihan Pentas OSIS', 5, 'MENUNGGU_PERSETUJUAN', 'RUANGAN', rooms.aula, users.siswa);
    await reservation('Praktik Pemrograman Selesai', -5, 'SELESAI', 'RUANGAN', rooms.lab);
    await reservation('Kegiatan Dibatalkan Panitia', -2, 'DIBATALKAN');
    await reservation('Usulan Kegiatan Perlu Penjadwalan', 6, 'DITOLAK');
    const ready = await reservation('Proyektor Siap Serah Terima', 0, 'DISETUJUI', 'ASET', byName['Proyektor Presentasi'][0], users.guru, Math.min(20, Number(now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit' }))));
    await record('booking_slots', { reservation_id: ready.id, resource_type: 'asset', resource_id: byName['Proyektor Presentasi'][0].id }, { slot_range: `[${ready.waktu_mulai.toISOString()},${new Date(now.getTime() + 86400000).toISOString()})`, status: 'CONFIRMED', origin: 'reservation', created_by: staff }, 'm08-reservation-item');
    // Rentang pengembalian cukup panjang untuk demo yang dijalankan sore/malam.
    if (ready.waktu_selesai < new Date(now.getTime() + 3600000)) await update('reservations', ready.id, { waktu_selesai: new Date(now.getTime() + 86400000) });
    const loans = [];
    for (const [i, status, start, due] of [[0, 'DIPINJAM', -1, 2], [1, 'TERLAMBAT', -5, -2], [2, 'DIKEMBALIKAN', -8, -5]]) {
      const asset = byName['Laptop Pembelajaran'][i], applicant = i === 1 ? users.staf : users.guru;
      const r = await reservation(`Peminjaman Laptop Skenario ${i + 1}`, start, status === 'DIKEMBALIKAN' ? 'SELESAI' : 'BERLANGSUNG', 'ASET', asset, applicant);
      const loan = await numbered('loans', 'PJM', { reservation_id: r.id }, {
        peminjam_id: applicant.id, petugas_serah_id: staff, nama_penerima: applicant.nama, tanggal_pinjam: date(start), tanggal_jatuh_tempo: date(due), tanggal_jatuh_tempo_asli: date(due),
        tanggal_kembali: status === 'DIKEMBALIKAN' ? date(-4) : null, status, kebijakan_denda: { tariff: 2000, nominalCap: 100000, percentCap: 30, excludeHolidays: false }, ...meta,
      }, 'm09-loans');
      const slot = await record('booking_slots', { loan_id: loan.id, resource_type: 'asset', resource_id: asset.id }, {
        slot_range: `[${date(start).toISOString()},${date(status === 'TERLAMBAT' ? 30 : due).toISOString()})`, status: status === 'DIKEMBALIKAN' ? 'RELEASED' : 'ACTIVE', origin: 'loan', reservation_id: r.id, created_by: staff,
      }, 'm09-loans');
      const item = await record('loan_items', { loan_id: loan.id, asset_id: asset.id }, { allocated_asset_id: asset.id, slot_id: slot.id, kondisi_awal: 'BAIK', kondisi_akhir: status === 'DIKEMBALIKAN' ? 'BAIK' : null,
        status_kembali: status === 'DIKEMBALIKAN' ? 'DIKEMBALIKAN' : 'BELUM_KEMBALI', tanggal_kembali: status === 'DIKEMBALIKAN' ? date(-4) : null, petugas_kembali_id: status === 'DIKEMBALIKAN' ? staff : null, nilai_perolehan_snapshot: asset.nilai_perolehan,
      }, 'm09-loans');
      if (status !== 'DIKEMBALIKAN' && asset.status === 'TERSEDIA') await update('assets', asset.id, { status: 'DIPINJAM' });
      if (status === 'DIKEMBALIKAN') await record('fines', { loan_item_id: item.id, jenis: 'KETERLAMBATAN' }, { loan_id: loan.id, peminjam_id: applicant.id, hari_terlambat: 1, tarif_per_hari: '2000.00', jumlah_sebelum_cap: '2000.00', jumlah: '2000.00', status: 'BELUM_DIBAYAR', ...meta }, 'm09-loans');
      loans.push(loan);
    }
    const damages = [];
    for (const [index, asset, status, urgency, text] of [
      [0, damaged, 'DILAPORKAN', 'SEDANG', 'Printer menarik lebih dari satu lembar kertas; roller perlu diperiksa.'],
      [1, repair, 'DALAM_PERBAIKAN', 'TINGGI', 'Komputer praktik mati mendadak saat digunakan; kipas dan PSU perlu diperiksa.'],
      [2, byName['Router Praktik'][0], 'SELESAI', 'RENDAH', 'Koneksi LAN tidak stabil; konektor sudah diperbaiki dan diuji.'],
    ]) damages.push(await numbered('damage_reports', 'KRS', { deskripsi: `[DEMO] ${text}`, pelapor_id: users.guru.id }, { asset_id: asset.id, urgensi: urgency, status, diverifikasi_oleh: index ? staff : null, diverifikasi_pada: index ? now : null, batas_sla: date(2), ...meta }, 'm11-damage-reports'));
    const workOrders = [];
    for (const [a, d, status, description] of [[repair, damages[1], 'DIKERJAKAN', 'DEMO - Periksa dan ganti kipas komputer praktik'], [byName['Router Praktik'][0], damages[2], 'SELESAI', 'DEMO - Perbaikan konektor jaringan']]) {
      const w = await numbered('work_orders', 'WO', { deskripsi: description, created_by: owner }, {
        jenis: 'KOREKTIF', asset_id: a.id, damage_report_id: d.id, teknisi_id: users.teknisi.id, prioritas: 'TINGGI', target_selesai: day(2), estimasi_biaya: '250000.00', status, waktu_mulai: date(-1),
        ...(status === 'SELESAI' ? { waktu_selesai: now, biaya: '75000.00', hasil: 'BERHASIL', catatan_teknisi: 'Konektor diganti, koneksi lolos pengujian.', kondisi_pasca: 'BAIK', diverifikasi_oleh: staff, diverifikasi_pada: now } : {}), ...meta,
      }, 'm12-maintenance'); workOrders.push(w);
    }
    const schedule = await record('maintenance_schedules', { nama: 'Demo - Perawatan Proyektor 90 Hari' }, { category_id: categories.AV.id, interval_hari: 90, tanggal_mulai: day(-30), checklist: ['Bersihkan filter dan lensa', 'Periksa kabel dan port', 'Uji gambar dan suhu'], teknisi_default_id: users.teknisi.id, ...meta }, 'm12-maintenance');
    for (const a of byName['Proyektor Presentasi']) await record('maintenance_schedule_assets', { schedule_id: schedule.id, asset_id: a.id }, { jatuh_tempo: day(7) }, 'm12-maintenance');
    // Opname aktif: 1 item siap dipindai dan 2 item sudah diperiksa.
    const stocktake = await numbered('audit_sessions', 'OPN', { nama: 'Demo - Opname Laboratorium RPL', created_by: owner }, { domain: 'ASET', periode_mulai: day(0), periode_selesai: day(7), cakupan: { jenis: 'RUANGAN', id: Number(rooms.lab.id) }, ...meta }, 'm13-audit-stocktake');
    await record('audit_session_assignees', { session_id: stocktake.id, user_id: staff }, {}, 'm13-audit-stocktake');
    await record('audit_session_rooms', { session_id: stocktake.id, room_id: rooms.lab.id }, { nama: rooms.lab.nama }, 'm13-audit-stocktake');
    for (const [i, a] of byName['Komputer Praktik RPL'].slice(3, 9).entries()) {
      await record('audit_items', { session_id: stocktake.id, asset_id: a.id }, {
        nama: a.nama, kode_barang: a.kode_barang, uuid: a.uuid, room_id_sistem: rooms.lab.id, lokasi_sistem: rooms.lab.nama, kondisi_sistem: a.kondisi, status_sistem: a.status,
        ...(i < 2 ? { hasil: 'DITEMUKAN', room_id_aktual: rooms.lab.id, kondisi_aktual: 'BAIK', diperiksa_oleh: staff, diperiksa_pada: now } : {}),
      }, 'm13-audit-stocktake');
      if (stocktake.status === 'BERJALAN') await record('audit_active_assets', { asset_id: a.id }, { session_id: stocktake.id }, 'm13-audit-stocktake');
    }
    const procurements = [];
    for (const [i, status, title] of [[0, 'MENUNGGU_PERSETUJUAN', 'Demo - Penambahan Laptop Kelas RPL'], [1, 'DISETUJUI', 'Demo - Pengadaan Multimeter Praktik'], [2, 'DRAF', 'Demo - Pembaruan Kursi Belajar']]) {
      const p = await numbered('procurements', 'PGD', { judul: title, pengusul_id: users.guru.id }, { work_unit_id: subject.id, tahun_anggaran: year, prioritas: 'TINGGI', justifikasi: 'Mendukung pembelajaran praktik siswa dan mengganti perangkat lama.', total_estimasi: i === 0 ? '19000000.00' : i === 1 ? '1950000.00' : '3500000.00', status, ...meta }, 'm14-procurement');
      await record('procurement_items', { procurement_id: p.id, nama_barang: i === 0 ? 'Laptop Pembelajaran Demo' : i === 1 ? 'Multimeter Digital Demo' : 'Kursi Belajar Demo' }, { jenis: 'ASET', category_id: categories[i === 0 ? 'KOM' : i === 1 ? 'ELK' : 'MEB'].id, spesifikasi: i === 0 ? 'RAM 16 GB, SSD 512 GB' : 'Standar pembelajaran SMK', satuan: 'unit', jumlah_diusulkan: i === 0 ? 2 : i === 1 ? 3 : 10, jumlah_disetujui: status === 'DISETUJUI' ? 3 : null, estimasi_harga_satuan: i === 0 ? '9500000.00' : i === 1 ? '650000.00' : '350000.00' }, 'm14-procurement');
      if (status !== 'DRAF') await approveFor(p, 'PENGADAAN_BARANG', users.guru.id, status === 'DISETUJUI' ? 'DISETUJUI' : 'MENUNGGU');
      procurements.push(p);
    }
    const disposal = await numbered('asset_disposals', 'HPS', { justifikasi: 'DEMO - Komputer lama rusak berat dan biaya perbaikan tidak ekonomis.', pengusul_id: staff }, {
      alasan: 'RUSAK_BERAT_TIDAK_DAPAT_DIPERBAIKI', tindak_lanjut_fisik: 'SUKU_CADANG', status: 'MENUNGGU_PERSETUJUAN', total_nilai: obsolete.nilai_perolehan, ...meta,
    }, 'm21-disposal');
    if (disposal.tindak_lanjut_fisik === 'DISIMPAN_SEBAGAI_SUKU_CADANG') await update('asset_disposals', disposal.id, { tindak_lanjut_fisik: 'SUKU_CADANG' });
    await record('asset_disposal_items', { disposal_id: disposal.id, asset_id: obsolete.id }, { konfirmasi_garansi: false, alasan_garansi: '', snapshot: {
      id: obsolete.id, uuid: obsolete.uuid, kode_barang: obsolete.kode_barang, nama: obsolete.nama, category_id: obsolete.category_id, kategori: categories.KOM.nama, room_id: obsolete.room_id, lokasi: rooms.lab.nama, kondisi: 'RUSAK_BERAT', tahun_perolehan: obsolete.tahun_perolehan, umur_tahun: year - obsolete.tahun_perolehan,
      umur_teknis: 5, nilai_perolehan: obsolete.nilai_perolehan, biaya_pemeliharaan: '0.00', jumlah_work_order: 0, rekomendasi_penggantian: false, work_order_id: null, loss_session_id: null, garansi: [], penghalang: [],
    } }, 'm21-disposal');
    if (disposal.status === 'MENUNGGU_PERSETUJUAN') await record('asset_disposal_claims', { asset_id: obsolete.id }, { disposal_id: disposal.id }, 'm21-disposal');
    await approveFor(disposal, 'PENGHAPUSAN_ASET', staff);
    const materialCategories = {}, units = {}, materials = [];
    for (const [key, nama] of [['ATK', 'Demo - Alat Tulis Kantor'], ['PRK', 'Demo - Bahan Praktik'], ['KBR', 'Demo - Kebersihan']]) materialCategories[key] = await record('material_categories', { kode: `DM-${key}` }, { nama, ...meta }, 'm22-materials');
    for (const [simbol, nama] of [['rim', 'Demo - Rim'], ['pcs', 'Demo - Buah'], ['roll', 'Demo - Gulung'], ['botol', 'Demo - Botol']]) units[simbol] = await record('material_units', { simbol }, { nama, ...meta }, 'm20-settings');
    for (const [nama, cat, symbol, minimum, qty] of [
      ['Kertas A4 80 gsm', 'ATK', 'rim', 10, 40], ['Spidol Whiteboard', 'ATK', 'pcs', 20, 60], ['Tinta Printer Hitam', 'ATK', 'botol', 5, 3],
      ['Kabel UTP Cat6', 'PRK', 'roll', 5, 12], ['Konektor RJ45', 'PRK', 'pcs', 50, 200], ['Timah Solder', 'PRK', 'roll', 5, 2],
      ['Alkohol Pembersih', 'KBR', 'botol', 5, 10], ['Lap Mikrofiber', 'KBR', 'pcs', 10, 30],
    ]) {
      const m = await record('materials', { nama: `${nama} (Demo)` }, { material_category_id: materialCategories[cat].id, satuan_id: units[symbol].id, stok_minimum: minimum, room_id_default: rooms.gudang.id, keterangan: 'DEMO: bahan praktik dan operasional sekolah', ...meta }, 'm22-materials');
      const receipt = await record('material_receipts', { nomor_dokumen: `DEMO-TERIMA-${m.id}` }, { material_id: m.id, room_id: rooms.gudang.id, jumlah: qty, tanggal_terima: day(-3), catatan: 'Saldo awal demonstrasi', created_at: now, created_by: staff }, 'm22-materials');
      const ledger = await record('material_transactions', { referensi_jenis: 'material_receipts', referensi_id: receipt.id }, { material_id: m.id, room_id: rooms.gudang.id, jenis: 'PENERIMAAN', jumlah: qty, saldo_sesudah: qty, created_by: staff, created_at: now }, 'm22-materials');
      if (!receipt.transaction_id) await update('material_receipts', receipt.id, { transaction_id: ledger.id });
      await record('material_balances', { material_id: m.id, room_id: rooms.gudang.id }, { saldo: qty }, 'm22-materials');
      materials.push(m);
    }
    const requests = [];
    for (const [i, status, qty] of [[0, 'MENUNGGU_PERSETUJUAN', 15], [1, 'DISETUJUI', 5], [2, 'DISERAHKAN', 1]]) {
      const m = materials[i];
      const request = await numbered('material_requests', 'PMB', { keperluan: `DEMO - Bahan kegiatan praktik ${i + 1}`, pemohon_id: users.guru.id }, { status, created_at: now, updated_at: now, created_by: users.guru.id }, 'm22-materials');
      const snapshot = { nama: m.nama, satuan: Object.values(units).find(u => u.id === m.satuan_id).simbol, lokasi: rooms.gudang.nama, category_id: m.material_category_id };
      const item = await record('material_request_items', { material_request_id: request.id, revision: 1, material_id: m.id, room_id: rooms.gudang.id }, { satuan_id: m.satuan_id, snapshot, jumlah_diminta: qty, jumlah_disetujui: status !== 'MENUNGGU_PERSETUJUAN' ? qty : null, jumlah_diserahkan: status === 'DISERAHKAN' ? qty : 0 }, 'm22-materials');
      const instanceId = await approveFor(request, 'PERMINTAAN_BAHAN', users.guru.id, status !== 'MENUNGGU_PERSETUJUAN' ? 'DISETUJUI' : 'MENUNGGU');
      await record('material_request_cycles', { request_id: request.id, revision: 1 }, { approval_instance_id: instanceId, threshold_snapshot: [{ material_id: m.id, jumlah: qty, batas: 10, khusus: false }], items_snapshot: [item], created_at: now }, 'm22-materials');
      if (status === 'DISERAHKAN') {
        const issue = await record('material_issues', { request_id: request.id, catatan: 'DEMO - Bukti penyerahan bahan selesai' }, { nama_penerima: users.guru.nama, tanggal_serah: day(0), created_at: now, created_by: staff }, 'm22-materials');
        const balance = await tx.selectFrom('material_balances').select('saldo').where('material_id', '=', m.id).where('room_id', '=', rooms.gudang.id).executeTakeFirstOrThrow();
        const transaction = await record('material_transactions', { referensi_jenis: 'material_issues', referensi_id: issue.id }, { material_id: m.id, room_id: rooms.gudang.id, jenis: 'PENGELUARAN', jumlah: -qty, saldo_sesudah: balance.saldo - qty, created_by: staff, created_at: now }, 'm22-materials');
        await record('material_issue_items', { issue_id: issue.id, item_id: item.id }, { jumlah: qty, transaction_id: transaction.id }, 'm22-materials');
        if (!request.diserahkan_pada) await update('material_requests', request.id, { diserahkan_oleh: staff, diserahkan_pada: now, approved_at: now });
      }
      requests.push(request);
    }
    const materialAudit = await numbered('audit_sessions', 'OPN', { nama: 'Demo - Opname Bahan Gudang', created_by: owner }, { domain: 'BAHAN', periode_mulai: day(0), periode_selesai: day(7), cakupan: { jenis: 'RUANGAN', id: Number(rooms.gudang.id) }, ...meta }, 'm13-audit-stocktake');
    await record('audit_session_assignees', { session_id: materialAudit.id, user_id: staff }, {}, 'm13-audit-stocktake');
    await record('audit_session_rooms', { session_id: materialAudit.id, room_id: rooms.gudang.id }, { nama: rooms.gudang.nama }, 'm13-audit-stocktake');
    for (const m of materials) {
      const balance = await tx.selectFrom('material_balances').select('saldo').where('material_id', '=', m.id).where('room_id', '=', rooms.gudang.id).executeTakeFirstOrThrow();
      const u = Object.values(units).find(u => u.id === m.satuan_id);
      await record('audit_material_items', { session_id: materialAudit.id, material_id: m.id, room_id: rooms.gudang.id }, { nama: m.nama, uuid: m.uuid, satuan_id: m.satuan_id, satuan_nama: u.nama, satuan_simbol: u.simbol, lokasi: rooms.gudang.nama, saldo_sistem: balance.saldo }, 'm13-audit-stocktake');
    }
    for (const [key, title, path, type, kode] of [
      ['sarpras', 'Demo - Reservasi menunggu persetujuan', '/persetujuan', 'PERSETUJUAN', 'NT-01'],
      ['guru', 'Demo - Proyektor siap diserahkan', `/reservasi/${ready.id}`, 'RESERVASI_PEMINJAMAN', 'NT-02'],
      ['teknisi', 'Demo - Tugas perbaikan komputer', `/work-order/${workOrders[0].id}`, 'KERUSAKAN_PERAWATAN', 'NT-15'],
      ['pimpinan', 'Demo - Usulan pengadaan perlu ditinjau', `/pengadaan/${procurements[0].id}`, 'OPNAME_PENGADAAN', 'NT-01'],
    ]) await record('notifications', { dedupe_key: `sigm4-demo-v1-${key}` }, { user_id: users[key].id, kode, jenis: type, judul: title, isi: 'Data fiktif demonstrasi SIGM4. Buka halaman terkait untuk melanjutkan alur.', deep_link: path, created_at: now }, 'm17-notifications');
    // Riwayat contoh ditandai eksplisit; bukan klaim jawaban atau evaluasi model langsung.
    const chat = await record('chat_sessions', { user_id: users.guru.id, judul: 'Demo - Lokasi Proyektor (contoh tersimpan)' }, { dimulai_pada: now, terakhir_aktif: now }, 'm19-chatbot');
    await record('chat_messages', { session_id: chat.id, peran: 'USER' }, { client_message_id: randomUUID(), isi: 'Di mana proyektor presentasi disimpan?', status: 'COMPLETED', permission_digest: 'DEMO-FIXTURE', waktu: now }, 'm19-chatbot');
    await record('chat_messages', { session_id: chat.id, peran: 'ASSISTANT' }, { isi: 'Contoh percakapan demo tersimpan: proyektor presentasi tercatat di Demo - Gudang Sarpras. Untuk data terkini, ajukan pertanyaan baru.', status: 'COMPLETED', permission_digest: 'DEMO-FIXTURE', references_data: [{ label: byName['Proyektor Presentasi'][0].kode_barang, url: `/aset/${byName['Proyektor Presentasi'][0].id}` }], waktu: now }, 'm19-chatbot');
    manifest.data = { pengguna: people.length, gedung: 3, ruangan: roomDefs.length, kategori_aset: 6, aset: assets.length, reservasi: reservations.length, peminjaman: loans.length, kerusakan: damages.length, work_order: workOrders.length, jadwal_perawatan: 1, opname: 2, pengadaan: procurements.length, penghapusan: 1, bahan: materials.length, permintaan_bahan: requests.length, aturan_persetujuan: 6 };
    manifest.tautan = { proyektor: `/aset/${byName['Proyektor Presentasi'][0].id}`, qr_proyektor: `/a/${byName['Proyektor Presentasi'][0].uuid}`, reservasi_siap_serah: `/reservasi/${ready.id}`, peminjaman_aktif: `/peminjaman/${loans[0].id}`, peminjaman_terlambat: `/peminjaman/${loans[1].id}`, kerusakan: `/kerusakan/${damages[0].id}`, tugas_teknisi: `/work-order/${workOrders[0].id}`, opname_aset: `/opname/${stocktake.id}`, opname_bahan: `/opname/${materialAudit.id}`, pengadaan: `/pengadaan/${procurements[0].id}`, pengadaan_siap_terima: `/pengadaan/${procurements[1].id}/penerimaan`, penghapusan: `/penghapusan/${disposal.id}`, bahan: `/bahan/${materials[0].id}`, permintaan_bahan: `/permintaan-bahan/${requests[0].id}`, penyerahan_bahan: `/permintaan-bahan/${requests[1].id}`, qr_opname: `/a/${byName['Komputer Praktik RPL'][5].uuid}` };
    manifest.hasil = counts;
  });
  await mkdir('tmp/demo', { recursive: true });
  await writeFile(accessPath, JSON.stringify(access, null, 2));
  await writeFile('tmp/demo/manifest.json', JSON.stringify(manifest, null, 2));
  const accounts = manifest.akun.map(a => `| ${a.peran} | ${a.email} |`).join('\n');
  await writeFile('tmp/demo/AKUN-DEMO.md', `# Akses demo SIGM4\n\nPassword akun yang dibuat seed pertama: **${access.password}**\n\n| Peran | Email |\n|---|---|\n${accounts}\n\nAdministrator dan Pimpinan tetap wajib aktivasi 2FA. Kode aktivasi lokal (berlaku 24 jam):\n\n${Object.entries(access.aktivasi).map(([email, code]) => `- ${email}: ${code}`).join('\n')}\n\nLogin, masukkan kode aktivasi, pindai QR authenticator, lalu masukkan OTP. Simpan kode cadangan yang ditampilkan aplikasi. Seed ulang tidak mereset password, 2FA, maupun transaksi yang sudah dimainkan.\n`);
  await writeFile('tmp/demo/TAUTAN-DEMO.md', `# Tautan data demo\n\n${Object.entries(manifest.tautan).map(([key, path]) => `- ${key}: ${path}`).join('\n')}\n`);
  console.log(JSON.stringify({ database: manifest.database, data: manifest.data, hasil: counts, akses: 'tmp/demo/AKUN-DEMO.md', tautan: 'tmp/demo/TAUTAN-DEMO.md' }, null, 2));
} catch (error) {
  console.error('Seed demo gagal; perubahan transaksi dibatalkan.', error instanceof Error ? error.message : 'Galat tidak dikenal.');
  process.exitCode = 1;
} finally { await db.destroy(); }
