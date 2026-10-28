// Acceptance PR-00-16: "Uji membandingkan hasil seed dengan Lampiran C baris per
// baris" (SDD-DB-10, SDD-05 §4.6–4.7, SDD-DB-16).
//
// Harapan dibaca dari dokumen lewat helpers/lampiran-c.ts — Lampiran C.2, Bab 5,
// dan tafsir SDD-03 §4.8 — lalu dibandingkan dengan isi tabel di PostgreSQL
// NYATA. Pembandingannya `toEqual` atas seluruh himpunan, bukan hitungan: baris
// yang hilang, lebih, atau ber-scope lain sama-sama memerah.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { DIR_MIGRATION, dbmate, kueri } from "../helpers/db.js";
import {
    type Grant,
    bacaLampiranC,
    bacaRoleBab5,
    matriksBawaan,
    urutkanGrant,
} from "../helpers/lampiran-c.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

/** Bagian `migrate:up` sebuah migration, untuk dijalankan ulang apa adanya. */
function bagianUp(berkas: string): string {
    const teks = readFileSync(join(DIR_MIGRATION, berkas), "utf8");
    const naik = teks.split("-- migrate:up")[1]?.split("-- migrate:down")[0];
    if (naik === undefined)
        throw new Error(`${berkas} tidak memiliki bagian migrate:up`);
    return naik;
}

const urutKode = <T extends { kode: string }>(rows: T[]): T[] =>
    [...rows].sort((a, b) => a.kode.localeCompare(b.kode));

async function permissionsDb() {
    return urutKode(
        await kueri<{
            kode: string;
            modul: string;
            aksi: string;
            deskripsi: string;
            inti: boolean;
        }>("SELECT kode, modul, aksi, deskripsi, inti FROM permissions"),
    );
}

async function rolesDb() {
    return urutKode(
        await kueri<{
            kode: string;
            nama: string;
            deskripsi: string;
            is_system: boolean;
        }>("SELECT kode, nama, deskripsi, is_system FROM roles"),
    );
}

async function grantsDb(): Promise<Grant[]> {
    return urutkanGrant(
        await kueri<Grant & Record<string, unknown>>(`
      SELECT r.kode AS role, p.kode AS permission, rp.scope::text AS scope
        FROM role_permissions rp
        JOIN roles r       ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
    `),
    );
}

const harapanPermissions = urutKode(
    bacaLampiranC().map(({ kode, modul, aksi, deskripsi, inti }) => ({
        kode,
        modul,
        aksi,
        deskripsi,
        inti,
    })),
);
const harapanRoles = urutKode(
    bacaRoleBab5().map((r) => ({ ...r, is_system: true })),
);
const harapanGrants = matriksBawaan();

describe.skipIf(!ADA_DB)("seed RBAC terhadap PostgreSQL nyata", () => {
    beforeAll(() => {
        dbmate("up");
    });

    it("permissions = Lampiran C.2 baris per baris (kode, modul, aksi, deskripsi, 🔒)", async () => {
        expect(await permissionsDb()).toEqual(harapanPermissions);
    });

    it("roles = tujuh role bawaan Bab 5, seluruhnya is_system", async () => {
        expect(await rolesDb()).toEqual(harapanRoles);
    });

    it("role_permissions = Lampiran C + tafsir SDD-03 §4.8, termasuk scope", async () => {
        expect(await grantsDb()).toEqual(harapanGrants);
    });

    it("Administrator memegang seluruh permission inti (FR-02.2 A1)", async () => {
        const tanpaAdmin = await kueri<{ kode: string }>(`
      SELECT p.kode FROM permissions p
       WHERE p.inti AND NOT EXISTS (
         SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
          WHERE rp.permission_id = p.id AND r.kode = 'R-01')
    `);
        expect(tanpaAdmin).toEqual([]);
    });

    it("grant tanpa scope ditolak basis data, bukan menjadi ALL (SDD-AUTH-02)", async () => {
        await expect(
            kueri(`
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
         WHERE r.kode = 'R-07' AND p.kode = 'setting.manage'
      `),
        ).rejects.toMatchObject({ code: "23502" });
    });

    it("menjalankan ulang seed memulihkan bawaan tanpa menggandakan baris", async () => {
        await kueri(`
      UPDATE permissions SET deskripsi = 'diubah', inti = false WHERE kode = 'setting.manage';
      UPDATE roles SET nama = 'Diubah' WHERE kode = 'R-07';
      UPDATE role_permissions SET scope = 'ALL'
       WHERE role_id = (SELECT id FROM roles WHERE kode = 'R-07')
         AND permission_id = (SELECT id FROM permissions WHERE kode = 'asset.view');
      DELETE FROM role_permissions
       WHERE role_id = (SELECT id FROM roles WHERE kode = 'R-04')
         AND permission_id = (SELECT id FROM permissions WHERE kode = 'workorder.execute');
    `);

        await kueri(bagianUp("0010_seed_rbac.sql"));
        await kueri(bagianUp("0010_seed_rbac.sql"));

        expect(await permissionsDb()).toEqual(harapanPermissions);
        expect(await rolesDb()).toEqual(harapanRoles);
        expect(await grantsDb()).toEqual(harapanGrants);
    });

    it("work_days bawaan: Senin–Sabtu aktif, Minggu tidak (Lampiran E.2)", async () => {
        // Uji kalender (PR-00-08) menyunting work_days sesukanya; isi tabel saat
        // berkas ini berjalan karena itu bukan hasil seed. Dirusak dulu dengan
        // sengaja, lalu seed dijalankan ulang — yang dibandingkan adalah hasilnya.
        await kueri(`
      UPDATE work_days SET aktif = NOT aktif;
      DELETE FROM work_days WHERE hari = 3;
    `);
        await kueri(bagianUp("0011_seed_work_days.sql"));

        expect(
            await kueri<{ hari: number; aktif: boolean }>(
                "SELECT hari, aktif FROM work_days ORDER BY hari",
            ),
        ).toEqual([
            { hari: 1, aktif: true },
            { hari: 2, aktif: true },
            { hari: 3, aktif: true },
            { hari: 4, aktif: true },
            { hari: 5, aktif: true },
            { hari: 6, aktif: true },
            { hari: 7, aktif: false },
        ]);
    });
});
