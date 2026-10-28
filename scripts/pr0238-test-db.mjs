// Menjalankan pemeriksaan PR-02-38 pada basis data uji tersendiri.
// DATABASE_URL asli tidak pernah dipakai untuk migration atau DELETE uji.
import pg from "pg";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
try { process.loadEnvFile(); } catch { /* Lingkungan CI dapat memasok variabel langsung. */ }
const source = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL atau MIGRATION_DATABASE_URL diperlukan.");
const url = new URL(source);
const name = `sigm4_pr0238_${randomBytes(6).toString("hex")}`;
url.pathname = "/postgres";
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
    await client.query(`CREATE DATABASE ${name}`);
} finally { await client.end(); }
url.pathname = `/${name}`;
const args = process.argv.slice(2);
const env = { ...process.env, DATABASE_URL: url.toString(), MIGRATION_DATABASE_URL: url.toString() };
// Tidak meneruskan APP_DB_PASSWORD: pengujian tidak boleh mengubah role lokal.
delete env.APP_DB_PASSWORD;
try {
    const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} finally {
    // Nama dibuat dari byte acak heksadesimal di atas; hanya DB yang dibuat proses ini dihapus.
    const cleanup = new pg.Client({ connectionString: new URL("/postgres", url).toString() });
    await cleanup.connect();
    try { await cleanup.query(`DROP DATABASE ${name} WITH (FORCE)`); }
    finally { await cleanup.end(); }
}
