// Acceptance PR-01-04: "Matriks permission + role_version + cache 60 detik"
// (FR-02.2, SDD-AUTH-04, SDD-AUTH-10) — terhadap PostgreSQL NYATA. Fokus berkas
// ini adalah kontrak `RoleService`: penggantian matriks penuh, kenaikan
// `role_version`, penguncian permission inti Administrator, dan activity log.
// Interaksinya dengan cache Redis (`PermissionCache`) diuji terpisah di
// `permission-cache.test.ts`.

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { RoleService } from "../../src/modules/m02-users/services/role.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

/**
 * UUID, bukan penghitung: baris yang disisipkan di sini tidak pernah dibersihkan
 * (tabelnya dipakai bersama berkas uji lain), sehingga dua proses uji yang
 * berjalan terpisah tidak boleh pernah menghasilkan pengenal yang sama.
 */
function emailUnik(): string {
    return `role-uji-${randomUUID()}@sekolah.sch.id`;
}
function nipUnik(): string {
    return `NIPROLEUJI${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function idRole(kode: string): Promise<number> {
    const [baris] = await kueri<{ id: string }>(
        `SELECT id::text FROM roles WHERE kode = '${kode}'`,
    );
    if (baris === undefined) throw new Error(`Role ${kode} tidak ditemukan`);
    return Number(baris.id);
}

/** Admin ber-status AKTIF — pelaku (`created_by`/`updated_by`) bagi PUT matriks. */
async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Role', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan admin uji");
    return Number(baris.id);
}

interface BarisMatriks {
    readonly kode: string;
    readonly scope: "ALL" | "OWN" | "ASSIGNED" | "RESTRICTED";
}

async function matriks(roleId: number): Promise<BarisMatriks[]> {
    return kueri<BarisMatriks & Record<string, unknown>>(`
        SELECT p.kode AS kode, rp.scope AS scope
          FROM role_permissions rp
          JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = ${roleId}
         ORDER BY p.kode
    `);
}

interface MetaRole {
    readonly role_version: string;
    readonly updated_by: string | null;
}

async function metaRole(roleId: number): Promise<MetaRole> {
    const [baris] = await kueri<MetaRole & Record<string, unknown>>(
        `SELECT role_version::text, updated_by::text FROM roles WHERE id = ${roleId}`,
    );
    if (baris === undefined) throw new Error(`Role id ${roleId} tidak ditemukan`);
    return baris;
}

async function versiRole(roleId: number): Promise<string> {
    return (await metaRole(roleId)).role_version;
}

/**
 * Mengembalikan matriks, role_version, DAN `updated_by` sebuah role ke keadaan
 * sebelum diuji. `updated_by` wajib dipulihkan juga — bila dibiarkan menunjuk
 * ke akun uji yang dibuang seusai berkas ini, berkas uji lain yang membersihkan
 * `users` (mis. `m02-users.test.ts`) akan gagal dengan `roles_updated_by_fkey`.
 * Seed RBAC sendiri adalah data BERSAMA seluruh berkas uji (`rbac-seed.test.ts`
 * membandingkannya baris per baris terhadap Lampiran C).
 */
async function pulihkan(
    roleId: number,
    sebelum: readonly BarisMatriks[],
    metaSebelum: MetaRole,
): Promise<void> {
    await kueri(`DELETE FROM role_permissions WHERE role_id = ${roleId}`);
    for (const baris of sebelum) {
        await kueri(`
            INSERT INTO role_permissions (role_id, permission_id, scope)
            SELECT ${roleId}, id, '${baris.scope}' FROM permissions WHERE kode = '${baris.kode}'
        `);
    }
    await kueri(`
        UPDATE roles
           SET role_version = ${metaSebelum.role_version},
               updated_by = ${metaSebelum.updated_by === null ? "NULL" : metaSebelum.updated_by}
         WHERE id = ${roleId}
    `);
}

async function aksiTerakhir(
    entitasId: string,
): Promise<{ aksi: string; nilai_sebelum: unknown; nilai_sesudah: unknown } | undefined> {
    const [baris] = await kueri<{
        aksi: string;
        nilai_sebelum: unknown;
        nilai_sesudah: unknown;
    }>(
        `SELECT aksi, nilai_sebelum, nilai_sesudah FROM activity_logs
          WHERE entitas = 'roles' AND entitas_id = '${entitasId}'
          ORDER BY id DESC LIMIT 1`,
    );
    return baris;
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map([["role.update", "all"]]),
    });
}

function buatService(): RoleService {
    return new RoleService(
        getDb(),
        new AuditLogger({ clock: new FixedClock(new Date("2026-09-17T00:00:00Z")) }),
    );
}

describe.skipIf(!ADA_DB)("PR-01-04 — matriks permission (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    it("katalog endpoint: role.view / role.update terdaftar", () => {
        const rute = registry.all().filter((r) => r.path.startsWith("/roles"));
        expect(rute.map((r) => r.method)).toEqual(expect.arrayContaining(["GET", "PUT"]));
    });

    it("list(): role beserta jumlah pengguna dan permission aktif (FR-02.2 langkah 2)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const roles = await service.list(buatCtx(adminId));
        const admin = roles.find((r) => r.kode === "R-01");
        expect(admin).toBeDefined();
        expect(admin?.jumlahPengguna).toBeGreaterThanOrEqual(1);
        expect(admin?.permissions.some((p) => p.kode === "user.create")).toBe(true);
    });

    it("updatePermissions(): pengganti PENUH matriks, role_version naik, ROLE_PERMISSION_UPDATED tercatat (AL-01, SDD-AUTH-04)", async () => {
        const adminId = await seedAdmin();
        const roleId = await idRole("R-02");
        const sebelum = await matriks(roleId);
        const metaSebelum = await metaRole(roleId);

        try {
            const service = buatService();
            const baru: BarisMatriks[] = [{ kode: "user.view", scope: "ALL" }];
            const hasil = await service.updatePermissions(buatCtx(adminId), roleId, {
                permissions: baru,
            });

            expect(hasil.permissions).toEqual(baru);
            expect(Number(hasil.role_version)).toBe(Number(metaSebelum.role_version) + 1);

            const log = await aksiTerakhir(String(roleId));
            expect(log?.aksi).toBe("ROLE_PERMISSION_UPDATED");
            expect(log?.nilai_sesudah).toEqual(baru);
        } finally {
            await pulihkan(roleId, sebelum, metaSebelum);
        }
    });

    it("kode permission tidak dikenal -> VALIDATION_ERROR, matriks tidak berubah", async () => {
        const adminId = await seedAdmin();
        const roleId = await idRole("R-02");
        const sebelum = await matriks(roleId);
        const versiSebelum = await versiRole(roleId);

        const service = buatService();
        await expect(
            service.updatePermissions(buatCtx(adminId), roleId, {
                permissions: [{ kode: "tidak.ada", scope: "ALL" }],
            }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });

        expect(await matriks(roleId)).toEqual(sebelum);
        expect(await versiRole(roleId)).toBe(versiSebelum);
    });

    it("role tidak ada -> NotFoundError", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        await expect(
            service.updatePermissions(buatCtx(adminId), 999_999_999, { permissions: [] }),
        ).rejects.toThrow(/tidak ditemukan/);
    });

    it("mencabut permission inti dari Administrator -> CORE_PERMISSION_LOCKED, matriks tidak berubah (SDD-AUTH-10, FR-02.2 A1)", async () => {
        const adminId = await seedAdmin();
        const roleId = await idRole("R-01");
        const sebelum = await matriks(roleId);
        const metaSebelum = await metaRole(roleId);

        try {
            const service = buatService();
            const tanpaIntiSatu = sebelum
                .filter((p) => p.kode !== "user.create")
                .map((p) => ({ kode: p.kode, scope: p.scope }));

            await expect(
                service.updatePermissions(buatCtx(adminId), roleId, {
                    permissions: tanpaIntiSatu,
                }),
            ).rejects.toMatchObject({
                kode: "CORE_PERMISSION_LOCKED",
                detail: { permissions: ["user.create"] },
            });

            expect(await matriks(roleId)).toEqual(sebelum);
            expect(await versiRole(roleId)).toBe(metaSebelum.role_version);
        } finally {
            await pulihkan(roleId, sebelum, metaSebelum);
        }
    });

    it("mencabut permission inti dari role BUKAN Administrator diizinkan — penguncian khusus Administrator (SDD-03 §4.7)", async () => {
        const adminId = await seedAdmin();
        const roleId = await idRole("R-03");
        const sebelum = await matriks(roleId);
        const metaSebelum = await metaRole(roleId);
        // activity_log.view (inti) dipegang R-03 (Pimpinan) pada seed bawaan.
        expect(sebelum.some((p) => p.kode === "activity_log.view")).toBe(true);

        try {
            const service = buatService();
            const tanpaLog = sebelum
                .filter((p) => p.kode !== "activity_log.view")
                .map((p) => ({ kode: p.kode, scope: p.scope }));

            const hasil = await service.updatePermissions(buatCtx(adminId), roleId, {
                permissions: tanpaLog,
            });
            expect(hasil.permissions.some((p) => p.kode === "activity_log.view")).toBe(false);
        } finally {
            await pulihkan(roleId, sebelum, metaSebelum);
        }
    });
});

describe.skipIf(!ADA_DB)("PR-01-20 — role kustom dari template + katalog permission (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    /** Role kustom dibuang seusai uji: `created_by` merujuk akun uji yang dibersihkan berkas lain. */
    async function buang(id: string): Promise<void> {
        await kueri(`DELETE FROM role_permissions WHERE role_id = ${id}`);
        await kueri(`DELETE FROM roles WHERE id = ${id}`);
    }

    it("katalog GET /permissions: seluruh baris Lampiran C urut modul, penanda inti terbawa", async () => {
        const katalog = await buatService().catalog(buatCtx(await seedAdmin()));
        const [jumlah] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM permissions");
        expect(katalog).toHaveLength(Number(jumlah?.n));
        expect(katalog.find((p) => p.kode === "role.update")).toMatchObject({ modul: expect.any(String), aksi: "update", inti: true });
        expect(katalog.map((p) => p.modul)).toEqual([...katalog.map((p) => p.modul)].sort());
    });

    it("menyalin R-02: kode RK-{id}, bukan bawaan, matriks + scope identik, ROLE_CREATED tercatat (FR-02.2 A2, AL-01)", async () => {
        const adminId = await seedAdmin();
        const sumber = await idRole("R-02");
        const nama = `Role Uji ${randomUUID().slice(0, 8)}`;
        const role = await buatService().createFromTemplate(buatCtx(adminId), { sumberRoleId: sumber, nama, deskripsi: "Salinan uji" });
        try {
            expect(role.kode).toBe(`RK-${role.id}`);
            expect(role.is_system).toBe(false);
            expect(await matriks(Number(role.id))).toEqual(await matriks(sumber));
            const log = await aksiTerakhir(role.id);
            expect(log?.aksi).toBe("ROLE_CREATED");
            expect(log?.nilai_sesudah).toMatchObject({ kode: role.kode, sumber_kode: "R-02" });
            await expect(buatService().createFromTemplate(buatCtx(adminId), { sumberRoleId: sumber, nama: nama.toUpperCase(), deskripsi: null })).rejects.toMatchObject({ kode: "DUPLICATE_CODE" });
        } finally {
            await buang(role.id);
        }
    });

    it("BR-069a: R-01, R-03, dan R-07 tidak dapat dijadikan template; tidak ada role yang tercipta", async () => {
        const adminId = await seedAdmin();
        const [awal] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM roles");
        for (const kode of ["R-01", "R-03", "R-07"]) {
            await expect(buatService().createFromTemplate(buatCtx(adminId), { sumberRoleId: await idRole(kode), nama: `Tolak ${kode} ${randomUUID().slice(0, 6)}`, deskripsi: null })).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { rule: "BR-069a" } });
        }
        const [akhir] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM roles");
        expect(akhir?.n).toBe(awal?.n);
    });

    it("dua permintaan serentak bernama sama (beda huruf) → tepat satu tercipta (temuan inspeksi R-001)", async () => {
        const adminId = await seedAdmin();
        const sumber = await idRole("R-02");
        const dasar = `Serentak ${randomUUID().slice(0, 8)}`;
        const hasil = await Promise.allSettled([dasar, dasar.toUpperCase()].map((nama) => buatService().createFromTemplate(buatCtx(adminId), { sumberRoleId: sumber, nama, deskripsi: null })));
        try {
            expect(hasil.filter((h) => h.status === "fulfilled")).toHaveLength(1);
            expect(hasil.find((h) => h.status === "rejected")).toMatchObject({ reason: { kode: "DUPLICATE_CODE" } });
        } finally {
            for (const h of hasil) if (h.status === "fulfilled") await buang(h.value.id);
        }
    });

    it("role sumber tidak ada → NotFoundError", async () => {
        await expect(buatService().createFromTemplate(buatCtx(await seedAdmin()), { sumberRoleId: 999_999, nama: `Hilang ${randomUUID().slice(0, 6)}`, deskripsi: null })).rejects.toMatchObject({ name: "NotFoundError" });
    });

    it("PM-01: POST /roles berpermission role.update, GET /permissions berpermission role.view", () => {
        const route = (m: string, p: string) => registry.all().find((r) => r.method === m && r.path === p);
        expect(route("POST", "/roles")?.permission).toBe("role.update");
        expect(route("GET", "/permissions")?.permission).toBe("role.view");
    });
});
