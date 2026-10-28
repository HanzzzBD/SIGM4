/**
 * Isolasi antar-berkas uji integrasi (setupFiles): setiap berkas berikutnya mulai dari
 * keadaan "baru dimigrasi".
 *
 * Seluruh berkas integrasi berbagi satu basis data secara berurutan. Uji lama membersihkan
 * datanya dengan `DELETE FROM assets/users/…`; baris yang ditinggalkan uji Phase 03–06
 * (audit_items, asset_disposals, loan_items, asset_document_links, booking_slots, …) menahan
 * penghapusan itu lewat FK, sehingga kegagalannya berantai ke puluhan berkas tak terkait.
 *
 * Sesudah migration hanya tabel SEED di bawah yang berisi; setelah setiap berkas, seluruh
 * tabel lain dikosongkan dengan DELETE (sequence tidak di-reset, id tidak dipakai ulang).
 * Urutan anak-induk dihitung dari katalog FK saat itu juga, trigger pengguna (ledger
 * immutable PR-05-17, activity_logs AL-03b) dimatikan hanya di dalam transaksi ini.
 */
import { afterAll } from "vitest";
import { Redis } from "ioredis";
import pg from "pg";

/** Tabel yang berisi tepat sesudah migration — tidak pernah dikosongkan. */
const SEED = new Set(["schema_migrations", "roles", "permissions", "role_permissions", "system_settings", "work_days", "material_units"]);

interface Fk { anak: string; induk: string; kolom: string; wajib: boolean }

async function kosongkan(): Promise<void> {
    if (!process.env["DATABASE_URL"]) return;
    const c = new pg.Client({ connectionString: process.env["MIGRATION_DATABASE_URL"] ?? process.env["DATABASE_URL"] });
    await c.connect();
    try {
        // Berkas yang menguji `down` dapat berakhir di tengah skema; tidak ada yang perlu dikosongkan.
        if ((await c.query<{ ada: boolean }>("SELECT to_regclass('public.role_permissions') IS NOT NULL AS ada")).rows[0]?.ada !== true) return;
        // Tabel induk partisi (activity_logs) ikut, partisinya tercakup DELETE pada induk.
        const tabel = new Set((await c.query<{ t: string }>(`
            SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition`)).rows
            .map((r) => r.t).filter((t) => !SEED.has(t)));
        const fk = (await c.query<Fk>(`
            SELECT ka.relname AS anak, ki.relname AS induk, a.attname AS kolom, a.attnotnull AS wajib
            FROM pg_constraint k
            JOIN pg_class ka ON ka.oid = k.conrelid JOIN pg_class ki ON ki.oid = k.confrelid
            JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
            WHERE k.contype = 'f' AND NOT ka.relispartition`)).rows.filter((f) => tabel.has(f.induk));

        await c.query("BEGIN");
        for (const t of tabel) await c.query(`ALTER TABLE "${t}" DISABLE TRIGGER USER`);
        // Role buatan uji (non-sistem) dibuang; tujuh role bawaan Bab 5 tetap (rbac-seed).
        await c.query("DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE NOT is_system)");
        await c.query("UPDATE users SET role_id = (SELECT min(id) FROM roles WHERE is_system) WHERE role_id IN (SELECT id FROM roles WHERE NOT is_system)");
        // Rujukan dari tabel seed (mis. system_settings.updated_by → users) dilepas lebih dulu.
        for (const f of fk.filter((x) => !tabel.has(x.anak))) {
            if (f.wajib) await c.query(`DELETE FROM "${f.anak}" WHERE "${f.kolom}" IS NOT NULL`);
            else await c.query(`UPDATE "${f.anak}" SET "${f.kolom}" = NULL WHERE "${f.kolom}" IS NOT NULL`);
        }
        // Anak lebih dulu. Hanya bila macet karena siklus, FK nullable di antara tabel tersisa
        // dikosongkan — tidak lebih awal, karena sebagian tabel mewajibkan salah satu rujukan
        // terisi (mis. audit_photos_check).
        const sisa = new Set(tabel);
        let putus = false;
        while (sisa.size > 0) {
            const siap = [...sisa].filter((t) => !fk.some((f) => f.induk === t && f.anak !== t && (f.wajib || !putus) && sisa.has(f.anak)));
            if (siap.length === 0) {
                if (putus) throw new Error(`Siklus FK wajib di antara: ${[...sisa].join(", ")}`);
                for (const f of fk.filter((x) => sisa.has(x.anak) && sisa.has(x.induk) && !x.wajib)) {
                    await c.query(`UPDATE "${f.anak}" SET "${f.kolom}" = NULL WHERE "${f.kolom}" IS NOT NULL`);
                }
                putus = true;
                continue;
            }
            for (const t of siap) { await c.query(`DELETE FROM "${t}"`); sisa.delete(t); }
        }
        await c.query("DELETE FROM roles WHERE NOT is_system");
        // Parameter sistem kembali ke bawaan migration: uji yang mengisi ambang (mis. denda.ambang_blokir)
        // tidak boleh menentukan hasil berkas berikutnya.
        await c.query("UPDATE system_settings SET value = nilai_bawaan, updated_by = NULL WHERE value IS DISTINCT FROM nilai_bawaan OR updated_by IS NOT NULL");
        // FK deferrable (mis. chat_messages) menyisakan pemeriksaan tertunda; ALTER TABLE
        // menolak berjalan sebelum pemeriksaan itu dituntaskan.
        await c.query("SET CONSTRAINTS ALL IMMEDIATE");
        for (const t of tabel) await c.query(`ALTER TABLE "${t}" ENABLE TRIGGER USER`);
        await c.query("COMMIT");
    } catch (e) {
        await c.query("ROLLBACK").catch(() => undefined);
        throw e;
    } finally {
        await c.end();
    }
}

/** Cache Redis (parameter, permission, kuota) yang tertinggal dari berkas sebelumnya membaca nilai basi. */
async function kosongkanRedis(): Promise<void> {
    const url = process.env["REDIS_URL"];
    if (!url) return;
    const r = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try { await r.connect(); await r.flushdb(); } finally { r.disconnect(); }
}

afterAll(async () => { await kosongkan(); await kosongkanRedis(); }, 120_000);
