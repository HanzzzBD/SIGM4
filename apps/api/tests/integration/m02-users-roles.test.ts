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
