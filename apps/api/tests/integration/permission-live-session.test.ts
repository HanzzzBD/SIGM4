// PR-01-26 / PM-05: login HTTP, JWT Ed25519, sesi PostgreSQL dan cache Redis nyata.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { PermissionCache, SessionStore } from "../../src/shared/auth/index.js";
import { COOKIE_ACCESS } from "../../src/shared/auth/session-cookies.js";
import { createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { RedisRateLimiter } from "../../src/shared/http/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { hashPassword } from "../../src/shared/security/index.js";
import { daftarkanTotpUji, duaFaktorUji, kodeTotpUji, kunciUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

interface Session { readonly jwt: string; readonly headers: Readonly<Record<string, string>> }
interface Account { readonly id: string; readonly email: string; readonly nip: string; readonly nama: string }
const REQUIRED = ["DATABASE_URL", "REDIS_URL"] as const;
describe.skipIf(!process.env["DATABASE_URL"])("PR-01-26 PM-05 melalui sesi hidup, tanpa autentikasi tiruan", () => {
    const clock = new FixedClock(new Date("2026-10-12T03:00:00Z")), jwt = kunciUji(), password = "Sandi-PM05-Sangat-Rahasia-1", tag = randomUUID().slice(0, 8);
    const accounts: Account[] = [], roles: string[] = [];
    let redis: Redis, server: Server, base: string, hash: string, admin: Session, viewer: Account, role: string, otherRole: string;
    const prefix = (account: Account, roleId: string) => `sigm4:perm:${account.id}:${roleId}:`;
    async function request(method: string, path: string, session?: Session, body?: unknown) {
        const response = await fetch(base + path, { method, headers: { "content-type": "application/json", ...session?.headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const json = await response.json() as { data: unknown; error?: { code: string } };
        return { status: response.status, data: json.data, error: json.error, cookies: response.headers.getSetCookie() };
    }
    async function seed(roleId: string): Promise<Account> {
        const index = accounts.length, email = `pm05-${tag}-${index}@sekolah.sch.id`, nip = `PM05${tag}${index}`, nama = "Uji permission sesi";
        const [row] = await kueri<{ id: string }>(`INSERT INTO users(nama,email,nip_nis,password_hash,role_id,status,must_change_password) VALUES ('${nama}','${email}','${nip}','${hash}',${roleId},'AKTIF',false) RETURNING id::text`);
        const account = { id: row!.id, email, nip, nama }; accounts.push(account); return account;
    }
    async function login(account: Account, platform: "WEB" | "ANDROID", secret?: Buffer): Promise<Session> {
        let result = await request("POST", "/auth/login", undefined, { email: account.email, password, platform });
        if (secret) {
            expect(result.status).toBe(200);
            const data = result.data as { requires_2fa: boolean; challenge_token: string };
            expect(data.requires_2fa).toBe(true);
            result = await request("POST", "/auth/2fa/verify", undefined, { challenge_token: data.challenge_token, kode: kodeTotpUji(secret, clock.now()) });
        }
        expect(result.status).toBe(200);
        const tokens = result.data as { tokens: { access_token: string } | null };
        const access = platform === "WEB" ? result.cookies.find((cookie) => cookie.startsWith(`${COOKIE_ACCESS}=`))?.split(";")[0]?.slice(COOKIE_ACCESS.length + 1) : tokens.tokens?.access_token;
        expect(access).toBeTruthy();
        const session = { jwt: access!, headers: platform === "WEB" ? { cookie: `${COOKIE_ACCESS}=${access}` } : { authorization: `Bearer ${access}` } };
        expect(await new SessionStore(getDb()).aktif(Number(account.id), jwt.verifikasi(session.jwt, clock.now()).sid)).toBe(true);
        return session;
    }
    async function matrix(roleId: string, permissions: readonly { kode: string; scope: string }[]) {
        const result = await request("PUT", `/roles/${roleId}/permissions`, admin, { permissions });
        expect(result.status).toBe(200); return result.data as { role_version: string };
    }
    async function swapRole(roleId: string) {
        expect((await request("PUT", `/users/${viewer.id}`, admin, { nama: viewer.nama, email: viewer.email, nip_nis: viewer.nip, role_id: Number(roleId) })).status).toBe(200);
    }
    it("prasyarat PostgreSQL/Redis lengkap ketika acceptance diaktifkan", () => {
        for (const variable of REQUIRED) expect(process.env[variable], `${variable} wajib untuk PM-05 nyata`).toBeTruthy();
    });
    beforeAll(async () => {
        dbmate("up"); redis = createRedis(readRedisConfig()); hash = await hashPassword(password);
        const administrator = await seed((await kueri<{ id: string }>("SELECT id::text FROM roles WHERE kode='R-01'"))[0]!.id);
        const totp = await daftarkanTotpUji(getDb(), administrator.id, clock.now());
        server = createServer(createApp({ appBaseUrl: "https://sekolah.test", db: getDb(), clock, health: new HealthRegistry(), logger: new Logger({ clock, tulis: () => undefined }),
            security: { objectStorageOrigin: "https://storage.test" }, limiter: new RedisRateLimiter(redis, clock),
            auth: { jwtKeys: jwt, permissions: new PermissionCache(getDb(), redis), sessions: new SessionStore(getDb()), twoFactor: duaFaktorUji(redis) } }));
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
        admin = await login(administrator, "ANDROID", totp.secret);
        expect(jwt.verifikasi(admin.jwt, clock.now()).amr).toContain("otp");
    });
    beforeEach(async () => {
        if (!admin) return;
        const created = await kueri<{ id: string }>(`INSERT INTO roles(kode,nama,is_system,role_version) VALUES ('QA-${tag}-${roles.length}','PM05 ${tag} ${roles.length}',false,1),('QA-${tag}-${roles.length + 1}','PM05 ${tag} ${roles.length + 1}',false,1) RETURNING id::text`);
        role = created[0]!.id; otherRole = created[1]!.id; roles.push(role, otherRole);
        await kueri(`INSERT INTO role_permissions(role_id,permission_id,scope) SELECT ${role},id,'ALL' FROM permissions WHERE kode='location.view'`);
        viewer = await seed(role);
    });
    afterAll(async () => {
        if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        const ids = accounts.map((account) => account.id).join(",");
        if (roles.length) await kueri(`UPDATE roles SET created_by=NULL,updated_by=NULL WHERE id IN (${roles.join(",")})`);
        if (ids) {
            await kueri(`DELETE FROM event_outbox WHERE actor_id IN (${ids})`);
            await kueri(`DELETE FROM activity_logs WHERE user_id IN (${ids})`);
            await kueri(`DELETE FROM password_history WHERE user_id IN (${ids})`);
            await kueri(`DELETE FROM totp_backup_codes WHERE user_id IN (${ids})`);
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${ids})`);
            await kueri(`DELETE FROM users WHERE id IN (${ids})`);
        }
        if (roles.length) { await kueri(`DELETE FROM role_permissions WHERE role_id IN (${roles.join(",")})`); await kueri(`DELETE FROM roles WHERE id IN (${roles.join(",")})`); }
        if (redis) {
            // Hapus hanya cache akun fixture; tanpa FLUSHDB atau cache milik pengujian lain.
            for (const account of accounts) { const keys = await redis.keys(`sigm4:perm:${account.id}:*`); if (keys.length) await redis.del(...keys); }
            await redis.quit();
        }
    });
    it.each(["ANDROID", "WEB"] as const)("%s: mencabut/memulihkan izin langsung berlaku memakai token lama, tanpa menunggu TTL", async (platform) => {
        const session = await login(viewer, platform), original = session.jwt, start = clock.now().getTime();
        expect((await request("GET", "/locations/tree", session)).status).toBe(200);
        const [oldKey] = await redis.keys(`${prefix(viewer, role)}*`); expect(oldKey).toBeTruthy();
        const before = await redis.get(oldKey!); expect(before).toContain("location.view");
        const revoked = await matrix(role, []); expect(Number(revoked.role_version)).toBe(2);
        expect(await redis.get(oldKey!)).toBe(before); expect(await redis.ttl(oldKey!)).toBeGreaterThan(0);
        expect(await request("GET", "/locations/tree", session)).toMatchObject({ status: 403, error: { code: "INSUFFICIENT_PERMISSION" } });
        const restored = await matrix(role, [{ kode: "location.view", scope: "ALL" }]); expect(Number(restored.role_version)).toBe(3);
        expect((await request("GET", "/locations/tree", session)).status).toBe(200);
        expect(session.jwt).toBe(original); expect(clock.now().getTime()).toBe(start);
        expect((await request("GET", "/me", session)).data).toMatchObject({ permissions: { "location.view": "all" } });
    });
    it("perubahan scope langsung terlihat pada AuthContext sesi hidup", async () => {
        const session = await login(viewer, "ANDROID");
        const [fixture] = await kueri<{ building: string; area: string; room: string; category: string }>(`WITH
            b AS (INSERT INTO buildings(nama,kode) VALUES ('Scope PM05','PB${tag}') RETURNING id),
            a AS (INSERT INTO areas(building_id,nama,kode) SELECT id,'Scope PM05','PA${tag}' FROM b RETURNING id),
            r AS (INSERT INTO rooms(area_id,nama,kode,jenis) SELECT id,'Scope PM05','PR${tag}','GUDANG' FROM a RETURNING id),
            c AS (INSERT INTO asset_categories(nama,kode) VALUES ('Scope PM05','PC${tag}') RETURNING id)
            SELECT b.id::text building,a.id::text area,r.id::text room,c.id::text category FROM b,a,r,c`);
        try {
            await kueri(`INSERT INTO assets(kode_barang,nama,category_id,room_id,tahun_perolehan,sumber_perolehan,kondisi,dapat_dipinjam,boleh_dipinjam_siswa) VALUES
                ('PMA-${tag}','Aset siswa',${fixture!.category},${fixture!.room},2026,'PEMBELIAN','BAIK',true,true),
                ('PMB-${tag}','Aset umum',${fixture!.category},${fixture!.room},2026,'PEMBELIAN','BAIK',true,false)`);
            const path = `/assets?filter[lokasi_id]=${fixture!.room}`;
            await matrix(role, [{ kode: "asset.view", scope: "ALL" }]);
            expect((await request("GET", "/me", session)).data).toMatchObject({ permissions: { "asset.view": "all" } });
            expect((await request("GET", path, session)).data).toHaveLength(2);
            await matrix(role, [{ kode: "asset.view", scope: "RESTRICTED" }]);
            expect((await request("GET", "/me", session)).data).toMatchObject({ permissions: { "asset.view": "restricted" } });
            const restricted = await request("GET", path, session); expect(restricted.status).toBe(200);
            expect(restricted.data).toMatchObject([{ nama: "Aset siswa" }]);
        } finally {
            await kueri(`DELETE FROM assets WHERE category_id=${fixture!.category}`);
            await kueri(`DELETE FROM asset_categories WHERE id=${fixture!.category}`);
            await kueri(`DELETE FROM rooms WHERE id=${fixture!.room}`);
            await kueri(`DELETE FROM areas WHERE id=${fixture!.area}`);
            await kueri(`DELETE FROM buildings WHERE id=${fixture!.building}`);
        }
    });
    it("berpindah role dengan role_version sama langsung mencabut akses; mengembalikan role memulihkannya", async () => {
        const session = await login(viewer, "ANDROID");
        expect((await request("GET", "/locations/tree", session)).status).toBe(200);
        expect(await redis.exists(`${prefix(viewer, role)}1`)).toBe(1);
        await swapRole(otherRole);
        expect(await request("GET", "/locations/tree", session)).toMatchObject({ status: 403, error: { code: "INSUFFICIENT_PERMISSION" } });
        expect((await request("GET", "/me", session)).data).toMatchObject({ user: { role_kode: expect.stringContaining("QA-") }, permissions: {} });
        expect(await redis.exists(`${prefix(viewer, otherRole)}1`)).toBe(1);
        expect(await redis.exists(`${prefix(viewer, role)}1`)).toBe(1);
        await swapRole(role); expect((await request("GET", "/locations/tree", session)).status).toBe(200);
    });
});
