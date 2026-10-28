import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { AuditLogger } from '../apps/api/dist/shared/audit/index.js';
import { SystemClock } from '../apps/api/dist/shared/clock/index.js';

try { process.loadEnvFile(); } catch { /* Env dapat dipasok proses induk. */ }
const model = process.argv[2] || 'gemini-3.5-flash-lite';
if (!/^gemini-\d+\.\d+-(?:flash|pro|flash-lite)$/.test(model)) throw new Error('Pilih ID model stabil Gemini berversi.');
const source = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!source || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(source).hostname) || process.env.NODE_ENV === 'production') throw new Error('Perintah ini hanya untuk konfigurasi lokal.');
const clock = new SystemClock(), audit = new AuditLogger({ clock });
const db = new Kysely({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: source, options: '-c timezone=UTC' }) }) });
try {
    await db.transaction().execute(async tx => {
        const row = await tx.selectFrom('system_settings').selectAll().where('key', '=', 'chat.model').forUpdate().executeTakeFirstOrThrow();
        if (row.value === model) return;
        await tx.updateTable('system_settings').set({ value: JSON.stringify(model) }).where('key', '=', 'chat.model').execute();
        if (!await audit.writeCli(tx, { modul: 'm20-settings', aksi: 'SETTING_UPDATED', entitas: 'system_settings', nilaiSebelum: { key: row.key, value: row.value }, nilaiSesudah: { key: row.key, value: model }, keterangan: 'Penggantian model chatbot atas permintaan pengguna.' })) throw new Error('Pencatatan audit gagal.');
    });
    console.log(JSON.stringify({ model, tersimpan: true }));
} finally { await db.destroy(); }
