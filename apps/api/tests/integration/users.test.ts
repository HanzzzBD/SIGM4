// Acceptance PR-01-01: "Migration naik-turun bersih; `users.role_id` merujuk role
// hasil seed" (FR-02.1, BR-066, BR-067, SDD-05 §4.2 dan §4.7, SDD-DB-04).
//
// Terhadap PostgreSQL NYATA. Setiap aturan dibuktikan lewat penolakan basis data
// (SQLSTATE), bukan dengan membaca berkas .sql: yang diuji adalah bentuk yang
// benar-benar terpasang.

import pg from "pg";
import { beforeAll, describe, expect, it } from "vitest";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
// Keberadaannya saat DATABASE_URL ada sudah dijaga uji tersendiri di
// activity-log.test.ts; di sini cukup dipakai.
const URL_APP = process.env["APP_DATABASE_URL"];

let nomor = 0;

/**
 * INSERT satu pengguna sah minimal. `ubah` menimpa nilai SQL sebuah kolom, atau
 * membuangnya dari pernyataan bila diberi `undefined`.
 */
function sqlPengguna(ubah: Record<string, string | undefined> = {}): string {
    nomor += 1;
    const kolom: Record<string, string | undefined> = {
        nama: "'Pengguna Uji'",
        email: `'uji${nomor}@sekolah.sch.id'`,
        password_hash: "'bukan-hash-sungguhan'",
        nip_nis: `'NIPUJI${nomor}'`,
        role_id: "(SELECT id FROM roles WHERE kode = 'R-01')",
        status: "'AKTIF'",
        must_change_password: "true",
        ...ubah,
    };
    const terisi = Object.entries(kolom).filter(([, v]) => v !== undefined);
    return `INSERT INTO users (${terisi.map(([k]) => k).join(", ")})
            VALUES (${terisi.map(([, v]) => v).join(", ")})
            RETURNING id::text`;
}

async function sisipPengguna(
    ubah: Record<string, string | undefined> = {},
): Promise<string> {
    const [baris] = await kueri<{ id: string }>(sqlPengguna(ubah));
    if (baris === undefined) throw new Error("INSERT tidak mengembalikan id");
    return baris.id;
}

describe.skipIf(!ADA_DB)("0012 — users + kolom baku roles", () => {
    beforeAll(async () => {
        dbmate("up");
        await kueri("UPDATE roles SET created_by = NULL, updated_by = NULL");
        await kueri("DELETE FROM users");
    });

    it("users.role_id merujuk role hasil seed (acceptance PR-01-01)", async () => {
        const id = await sisipPengguna({
            role_id: "(SELECT id FROM roles WHERE kode = 'R-07')",
        });
        const [baris] = await kueri<{ kode: string }>(
            `SELECT r.kode FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ${id}`,
        );
        expect(baris?.kode).toBe("R-07");
    });

    it("role yang tidak ada ditolak foreign key", async () => {
        await expect(
            sisipPengguna({ role_id: "999999999" }),
        ).rejects.toMatchObject({ code: "23503" });
    });

    it("tanpa role ditolak — tepat satu role utama (BR-066)", async () => {
        await expect(
            sisipPengguna({ role_id: undefined }),
        ).rejects.toMatchObject({ code: "23502", column: "role_id" });
    });

    it("email unik tanpa membedakan huruf besar (FR-02.1 A1)", async () => {
        await sisipPengguna({ email: "'Budi.Santoso@Sekolah.sch.id'" });
        await expect(
            sisipPengguna({ email: "'budi.santoso@sekolah.sch.id'" }),
        ).rejects.toMatchObject({ code: "23505", constraint: "users_email_uq" });
    });

    it("nip_nis unik sistem-wide (Lampiran E.5.2)", async () => {
        await sisipPengguna({ nip_nis: "'198001012005011001'" });
        await expect(
            sisipPengguna({ nip_nis: "'198001012005011001'" }),
        ).rejects.toMatchObject({
            code: "23505",
            constraint: "users_nip_nis_uq",
        });
    });

    it("status wajib dinyatakan — tanpa nilai bawaan AKTIF (SL-06)", async () => {
        await expect(
            sisipPengguna({ status: undefined }),
        ).rejects.toMatchObject({ code: "23502", column: "status" });
    });

    it("status hanya AKTIF atau NONAKTIF (Bab 11.3, BR-067)", async () => {
        await expect(sisipPengguna({ status: "'NONAKTIF'" })).resolves.toMatch(
            /^\d+$/,
        );
        await expect(
            sisipPengguna({ status: "'DIHAPUS'" }),
        ).rejects.toMatchObject({ code: "22P02" });
    });

    it("must_change_password wajib dinyatakan (FR-02.1 langkah 4)", async () => {
        await expect(
            sisipPengguna({ must_change_password: undefined }),
        ).rejects.toMatchObject({
            code: "23502",
            column: "must_change_password",
        });
    });

    it("kolomnya persis milik PR ini — tanpa deleted_at maupun foto", async () => {
        const kolom = await kueri<{ column_name: string }>(`
            SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'users'
             ORDER BY ordinal_position`);
        expect(kolom.map((k) => k.column_name)).toEqual([
            "id",
            "nama",
            "email",
            "password_hash",
            "nip_nis",
            "role_id",
            "unit_kerja",
            "telepon",
            "status",
            "must_change_password",
            "login_terakhir_pada",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "work_unit_id",
            "consent_guardian_at",
            // 0022 (PR-02-03): penghitung kegagalan login dan penguncian akun (SDD-SESS-06).
            "failed_login_count",
            "failed_login_window_start",
            "locked_until",
            // 0024 (PR-02-07): 2FA TOTP — secret terenkripsi, penanda aktif, langkah terakhir (SDD-SESS-08/16).
            "totp_secret_enc",
            "totp_enabled_at",
            "totp_last_step",
        ]);
    });

    it("updated_at users dipelihara trigger, bukan aplikasi (SDD-05 §4.2)", async () => {
        const id = await sisipPengguna();
        // Nilai yang dipaksakan penulis tetap ditimpa: trigger tidak dapat dilupakan
        // maupun dipalsukan.
        await kueri(
            `UPDATE users SET telepon = '081234567890', updated_at = '2000-01-01T00:00:00Z' WHERE id = ${id}`,
        );
        const [baris] = await kueri<{ baru: boolean }>(
            `SELECT updated_at > '2001-01-01T00:00:00Z' AS baru FROM users WHERE id = ${id}`,
        );
        expect(baris?.baru).toBe(true);
    });

    it("roles memperoleh kolom baku, dengan updated_at dipelihara trigger", async () => {
        const [seed] = await kueri<{ n: string; tanpa_pembuat: string }>(`
            SELECT count(*)::text AS n,
                   count(*) FILTER (WHERE created_by IS NULL)::text AS tanpa_pembuat
              FROM roles WHERE created_at IS NOT NULL`);
        expect(seed).toEqual({ n: "7", tanpa_pembuat: "7" });

        await kueri(
            "UPDATE roles SET updated_at = '2000-01-01T00:00:00Z' WHERE kode = 'R-07'",
        );
        const [baris] = await kueri<{ baru: boolean }>(
            "SELECT updated_at > '2001-01-01T00:00:00Z' AS baru FROM roles WHERE kode = 'R-07'",
        );
        expect(baris?.baru).toBe(true);
    });

    it("roles.created_by merujuk users", async () => {
        await expect(
            kueri("UPDATE roles SET created_by = 999999999 WHERE kode = 'R-07'"),
        ).rejects.toMatchObject({ code: "23503" });

        const id = await sisipPengguna();
        await kueri(`UPDATE roles SET updated_by = ${id} WHERE kode = 'R-07'`);
        await kueri("UPDATE roles SET updated_by = NULL WHERE kode = 'R-07'");
    });

    it.runIf(URL_APP !== undefined)(
        "akun aplikasi dapat menulis users tanpa GRANT susulan (0007)",
        async () => {
            const client = new pg.Client({ connectionString: URL_APP });
            await client.connect();
            try {
                const hasil = await client.query<{ id: string }>(sqlPengguna());
                const id = hasil.rows[0]?.id;
                expect(id).toMatch(/^\d+$/);
                await client.query(
                    `UPDATE users SET status = 'NONAKTIF' WHERE id = ${id}`,
                );
            } finally {
                await client.end();
            }
        },
    );

    it("down mencabut 0012 seluruhnya tanpa menyentuh seed, lalu up memulihkannya (CD-04, CD-05)", async () => {
        const bentuk = async () =>
            (
                await kueri<Record<string, string | null>>(`
                SELECT to_regclass('public.users')::text AS users,
                       (SELECT count(*) FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'roles'
                           AND column_name IN ('created_at', 'updated_at', 'created_by', 'updated_by'))::text AS kolom_baku,
                       (SELECT count(*) FROM pg_proc WHERE proname = 'set_updated_at')::text AS fungsi,
                       (SELECT count(*) FROM pg_type WHERE typname = 'user_status')::text AS tipe,
                       (SELECT count(*) FROM roles)::text AS role,
                       (SELECT count(*) FROM role_permissions)::text AS grant_seed`)
            )[0];
        const sebelum = await bentuk();

        // Migration sesudah 0012 ikut diturunkan lebih dulu, agar uji ini tetap
        // menguji 0012 saat PR berikutnya menambah berkas.
        const [sisa] = await kueri<{ n: string }>(
            "SELECT count(*)::text AS n FROM schema_migrations WHERE version >= '0012'",
        );
        for (let n = Number(sisa?.n ?? 0); n > 0; n -= 1) dbmate("down");

        expect(await bentuk()).toEqual({
            users: null,
            kolom_baku: "0",
            fungsi: "0",
            tipe: "0",
            role: sebelum?.["role"],
            grant_seed: sebelum?.["grant_seed"],
        });

        dbmate("up");
        expect(await bentuk()).toEqual({
            ...sebelum,
            users: "users",
            kolom_baku: "4",
            fungsi: "1",
            tipe: "1",
        });
    });
});
