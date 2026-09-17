// Acceptance PR-01-04 (sisi cache): "cache permission berkunci
// perm:{user_id}:{role_version}, TTL 60 detik" + "perubahan matriks berlaku
// pada permintaan berikutnya tanpa restart" (SDD-AUTH-04, PM-05) — terhadap
// PostgreSQL + Redis NYATA. TTL dan pembatalan lewat kenaikan `role_version`
// adalah perilaku Redis sungguhan; menirunya berarti menguji tiruan.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RoleService } from "../../src/modules/m02-users/services/role.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { PermissionCache } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

describe.skipIf(!ADA_DB)("PermissionCache — SDD-AUTH-04, PM-05 (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    // Penjaga lingkungan sebagai UJI, bukan beforeAll: prasyarat yang hilang
    // harus FAILED, bukan ter-skip diam-diam (templates/PULL-REQUEST.md).
    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(
            process.env["REDIS_URL"],
            "REDIS_URL wajib diisi: SDD-AUTH-04 menaruh cache permission di Redis.",
        ).toBeDefined();
    });

    const redis =
        process.env["REDIS_URL"] === undefined ? undefined : createRedis(readRedisConfig());

    afterAll(async () => {
        const kunci = (await redis?.keys("sigm4:perm:*")) ?? [];
        if (kunci.length > 0) await redis?.del(...kunci);
        await redis?.quit();
    });

    async function siap() {
        if (redis === undefined) throw new Error("REDIS_URL wajib diisi.");
        if (redis.status !== "ready") {
            await new Promise((r) => redis.once("ready", r));
        }
        return redis;
    }

    /** UUID, bukan penghitung: baris tidak dibersihkan, jadi proses uji terpisah tidak boleh bentrok. */
    async function seedUser(roleKode: string): Promise<number> {
        const kode = randomUUID().replace(/-/g, "");
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Cache Uji', 'cache-uji-${kode}@sekolah.sch.id', 'x',
                    'NIPCACHEUJI${kode.slice(0, 16)}',
                    (SELECT id FROM roles WHERE kode = '${roleKode}'), 'AKTIF', false)
            RETURNING id::text
        `);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        return Number(baris.id);
    }

    async function idRole(kode: string): Promise<number> {
        const [baris] = await kueri<{ id: string }>(
            `SELECT id::text FROM roles WHERE kode = '${kode}'`,
        );
        if (baris === undefined) throw new Error(`Role ${kode} tidak ditemukan`);
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
     * `updated_by` wajib dipulihkan bersama role_version — bila dibiarkan
     * menunjuk ke pengguna uji yang dibuang seusai berkas ini, berkas uji lain
     * yang membersihkan `users` akan gagal dengan `roles_updated_by_fkey`.
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

    it("permission efektif dimuat dari basis data dan ditaruh di kunci perm:{user_id}:{role_version}", async () => {
        const r = await siap();
        const userId = await seedUser("R-02");
        const roleId = await idRole("R-02");
        const cache = new PermissionCache(getDb(), r);

        const hasil = await cache.load(userId);
        expect(hasil?.roleCode).toBe("R-02");
        expect(hasil?.scopes.get("asset.view")).toBe("all");

        const versi = await versiRole(roleId);
        expect(await r.exists(`sigm4:perm:${String(userId)}:${versi}`)).toBe(1);
    });

    it("TTL kunci cache 60 detik (PM-05)", async () => {
        const r = await siap();
        const userId = await seedUser("R-05");
        const roleId = await idRole("R-05");
        const cache = new PermissionCache(getDb(), r);
        await cache.load(userId);

        const versi = await versiRole(roleId);
        const ttl = await r.ttl(`sigm4:perm:${String(userId)}:${versi}`);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(60);
    });

    it("pengguna tidak ada -> undefined, tidak menaruh kunci apa pun", async () => {
        const r = await siap();
        const cache = new PermissionCache(getDb(), r);
        expect(await cache.load(999_999_999)).toBeUndefined();
    });

    it("perubahan matriks (RoleService) berlaku pada permintaan cache BERIKUTNYA tanpa restart (acceptance utama PR-01-04)", async () => {
        const r = await siap();
        const roleId = await idRole("R-02");
        const sebelum = await matriks(roleId);
        const metaSebelum = await metaRole(roleId);

        try {
            const userId = await seedUser("R-02");
            const cache = new PermissionCache(getDb(), r);

            const awal = await cache.load(userId);
            expect(awal?.scopes.has("asset.export")).toBe(true);

            const roleService = new RoleService(
                getDb(),
                new AuditLogger({ clock: new FixedClock(new Date("2026-09-17T00:00:00Z")) }),
            );
            const ctxAdmin = createAuthContext({
                userId,
                roleCode: "R-02",
                scopes: new Map([["role.update", "all"]]),
            });
            const permissionsBaru = sebelum
                .filter((p) => p.kode !== "asset.export")
                .map((p) => ({ kode: p.kode, scope: p.scope }));
            await roleService.updatePermissions(ctxAdmin, roleId, {
                permissions: permissionsBaru,
            });

            // Kunci cache LAMA (role_version sebelumnya) TIDAK dihapus manual — ia
            // hanya tidak pernah terbaca lagi karena `role_version` sudah naik
            // (SDD-03 §4.5). Panggilan `load` berikutnya jatuh ke kunci BARU.
            const setelah = await cache.load(userId);
            expect(setelah?.scopes.has("asset.export")).toBe(false);
            expect(Number(setelah?.roleVersion)).toBe(Number(metaSebelum.role_version) + 1);
        } finally {
            await pulihkan(roleId, sebelum, metaSebelum);
        }
    });
});
