// PR-02-02 — login, access token EdDSA, dan rotasi refresh token terhadap PostgreSQL DAN
// Redis nyata, lewat HTTP penuh pada `createApp()` (komposisi produksi). Acceptance yang
// dibuktikan: FR-01.1, SDD-SESS-02/03/04, SDD-13 §4.3 (kelas `login`), NFR-S-07.

import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import type { AppDeps } from "../../src/api/index.js";
import { ensurePartitions } from "../../src/shared/audit/index.js";
import { PermissionCache, SessionStore } from "../../src/shared/auth/index.js";
import { closeRedis, createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { RedisRateLimiter } from "../../src/shared/http/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { REFRESH_TTL_DETIK, hashPassword } from "../../src/shared/security/index.js";
import { duaFaktorUji, kunciUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-19T03:00:00Z");
const PASSWORD = "Sandi-Uji-Rahasia-1";
const ROLE_UJI = "R-05"; // Guru: BUKAN role wajib 2FA (BR-070, sehingga login berbentuk sesi biasa) dan memegang location.view (Lampiran C)

interface Balasan {
    readonly status: number;
    readonly json: {
        success?: boolean;
        data?: {
            tokens: { access_token: string; refresh_token: string } | null;
            expires_in: number;
            user?: { id: string; nama: string; email: string; role_kode: string; must_change_password: boolean };
            permissions?: Record<string, string>;
        };
        error?: { code: string; message: string };
    };
    readonly cookies: readonly string[];
    readonly headers: Headers;
    readonly teks: string;
}

type RowRefresh = {
    id: string;
    parent_id: string | null;
    family_id: string;
    platform: string;
    ip: string | null;
    issued_at: string;
    expires_at: string;
    rotated_at: string | null;
    revoked_at: string | null;
    revoke_reason: string | null;
};

const sha256hex = (teks: string) => createHash("sha256").update(teks).digest("hex");

describe.skipIf(!ADA)("PR-02-02 — login + rotasi refresh token (PostgreSQL + Redis nyata)", () => {
    let redis: Redis;
    let clock: FixedClock;
    let url: string;
    let urlBatas: string;
    let server: Server;
    let serverBatas: Server;
    let hashSandi: string;
    const idPengguna: number[] = [];

    function bangun(limiter: AppDeps["limiter"]): Server {
        const app = createApp({
            health: new HealthRegistry(30).register(
                { name: "database", probe: () => Promise.resolve({ status: "up" }) },
                { name: "redis", probe: () => Promise.resolve({ status: "up" }) },
            ),
            limiter,
            security: { objectStorageOrigin: "http://minio:9000" },
            logger: new Logger({ clock, tulis: () => undefined }),
            clock,
            db: getDb(),
            auth: { jwtKeys: kunciUji(), permissions: new PermissionCache(getDb(), redis), sessions: new SessionStore(getDb()), twoFactor: duaFaktorUji(redis) },
        });
        return createServer(app);
    }

    // Penjaga lingkungan sebagai UJI, bukan beforeAll: prasyarat yang hilang harus FAILED, bukan
    // ter-skip diam-diam (templates/PULL-REQUEST.md).
    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(
            process.env["REDIS_URL"],
            "REDIS_URL wajib diisi: permission efektif (SDD-AUTH-04) dan limiter login (SDD-13 §4.3) memakai Redis.",
        ).toBeDefined();
    });

    beforeAll(async () => {
        dbmate("up");
        redis = createRedis(readRedisConfig());
        clock = new FixedClock(T0);
        await ensurePartitions(getDb(), clock);
        hashSandi = await hashPassword(PASSWORD);
        // Dua aplikasi: satu dengan limiter yang selalu meloloskan, satu dengan limiter Redis sungguhan.
        server = bangun({ hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) });
        serverBatas = bangun(new RedisRateLimiter(redis, clock));
        await Promise.all(
            [server, serverBatas].map((s) => new Promise<void>((r) => s.listen(0, "127.0.0.1", r))),
        );
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        urlBatas = `http://127.0.0.1:${String((serverBatas.address() as AddressInfo).port)}/api/v1`;
    });

    afterAll(async () => {
        await Promise.all([server, serverBatas].map((s) => new Promise((r) => s.close(r))));
        if (idPengguna.length > 0) {
            const daftar = idPengguna.join(",");
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND user_id IN (${daftar})`);
            await kueri(`DELETE FROM users WHERE id IN (${daftar})`);
        }
        await redis.quit().catch(() => undefined);
        await closeRedis();
    });

    const ipUnik = () => `198.51.100.${String(1 + Math.floor(Math.random() * 250))}`;

    async function seed(opsi: { status?: "AKTIF" | "NONAKTIF"; wajibGanti?: boolean } = {}): Promise<{ id: number; email: string }> {
        const email = `login-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Uji Login', '${email}', '${hashSandi}', 'NIPLOGIN${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = '${ROLE_UJI}'), '${opsi.status ?? "AKTIF"}', ${String(opsi.wajibGanti ?? false)})
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email };
    }

    async function kirim(
        basis: string,
        path: string,
        body: unknown,
        headers: Record<string, string> = {},
        metode = "POST",
    ): Promise<Balasan> {
        const res = await fetch(`${basis}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-forwarded-for": ipUnik(), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const teks = await res.text();
        return {
            status: res.status,
            json: teks === "" ? {} : (JSON.parse(teks) as Balasan["json"]),
            cookies: res.headers.getSetCookie(),
            headers: res.headers,
            teks,
        };
    }

    const login = (email: string, platform: "WEB" | "ANDROID" | "IOS" = "ANDROID", password = PASSWORD, headers: Record<string, string> = {}) =>
        kirim(url, "/auth/login", { email, password, platform }, headers);
    const refresh = (token: string | undefined, headers: Record<string, string> = {}) =>
        kirim(url, "/auth/refresh", token === undefined ? {} : { refresh_token: token }, headers);

    const barisKeluarga = (userId: number) =>
        kueri<RowRefresh>(`
            SELECT id::text, parent_id::text, family_id::text, platform::text, host(ip) AS ip, issued_at::text, expires_at::text,
                   rotated_at::text, revoked_at::text, revoke_reason
            FROM refresh_tokens WHERE user_id = ${String(userId)} ORDER BY id`);
    const jumlahAudit = async (userId: number, aksi: string) =>
        Number((await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE modul = 'm01-auth' AND aksi = '${aksi}' AND entitas_id = ${String(userId)}`))[0]?.n);
    const nilaiCookie = (cookies: readonly string[], nama: string) =>
        /^([^=]+)=([^;]*)/.exec(cookies.find((c) => c.startsWith(`${nama}=`)) ?? "")?.[2];

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/login — jalur mobile (token di body)", () => {
        it("sukses: 200, token di body, TANPA cookie, tidak boleh di-cache; user dan permission ikut", async () => {
            const { id, email } = await seed();
            const r = await login(email, "ANDROID");
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            expect(r.cookies).toEqual([]);
            expect(r.json.data?.tokens?.access_token.split(".")).toHaveLength(3);
            expect(r.json.data?.tokens?.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
            expect(r.json.data?.expires_in).toBe(3600);
            expect(r.json.data?.user).toMatchObject({ id: String(id), email, role_kode: ROLE_UJI, must_change_password: false });
            expect(r.json.data?.permissions?.["location.view"]).toBe("all");
        });

        it("refresh_tokens: hanya SHA-256 yang tersimpan; keluarga baru; masa berlaku 30 hari; IP klien; login_terakhir_pada terisi", async () => {
            const { id, email } = await seed();
            const ip = ipUnik();
            const r = await login(email, "IOS", PASSWORD, { "x-forwarded-for": ip });
            const [baris, ...sisa] = await barisKeluarga(id);
            expect(sisa).toEqual([]);
            expect(baris).toMatchObject({ platform: "IOS", parent_id: null, ip, rotated_at: null, revoked_at: null });
            const [hash] = await kueri<{ cocok: boolean }>(
                `SELECT token_hash = decode('${sha256hex(r.json.data?.tokens?.refresh_token ?? "")}', 'hex') AS cocok FROM refresh_tokens WHERE user_id = ${String(id)}`,
            );
            expect(hash?.cocok).toBe(true);
            const [ttl] = await kueri<{ detik: string }>(
                `SELECT extract(epoch FROM (expires_at - issued_at))::text AS detik FROM refresh_tokens WHERE user_id = ${String(id)}`,
            );
            expect(Number(ttl?.detik)).toBe(REFRESH_TTL_DETIK.IOS);
            const [user] = await kueri<{ waktu: string | null }>(`SELECT login_terakhir_pada::text AS waktu FROM users WHERE id = ${String(id)}`);
            expect(user?.waktu).not.toBeNull();
            // Token mentah tidak pernah ada di basis data.
            const [bocor] = await kueri<{ n: string }>(
                `SELECT count(*)::text AS n FROM refresh_tokens WHERE encode(token_hash, 'escape') LIKE '%${r.json.data?.tokens?.refresh_token ?? "x"}%'`,
            );
            expect(bocor?.n).toBe("0");
        });

        it("access token dari login dipakai pada endpoint terkunci (Bearer) dan AuthContext datang dari permission efektif", async () => {
            const { email } = await seed();
            const r = await login(email);
            const ok = await kirim(url, "/locations/tree", undefined, { authorization: `Bearer ${r.json.data?.tokens?.access_token ?? ""}` }, "GET");
            expect(ok.status).toBe(200);
            const tanpa = await kirim(url, "/locations/tree", undefined, {}, "GET");
            expect(tanpa.status).toBe(401);
        });

        it("AL-01: LOGIN_SUCCESS tercatat dengan IP pelaku, dalam transaksi yang sama dengan sesi", async () => {
            const { id, email } = await seed();
            const ip = ipUnik();
            await login(email, "ANDROID", PASSWORD, { "x-forwarded-for": ip, "user-agent": "SIGM4-Test/1.0" });
            const [log] = await kueri<{ host: string; user_agent: string; user_id: string; hasil: string }>(
                `SELECT host(ip) AS host, user_agent, user_id::text, hasil::text FROM activity_logs
                 WHERE modul = 'm01-auth' AND aksi = 'LOGIN_SUCCESS' AND entitas_id = ${String(id)}`,
            );
            expect(log).toEqual({ host: ip, user_agent: "SIGM4-Test/1.0", user_id: String(id), hasil: "SUKSES" });
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/login — jalur web (cookie httpOnly)", () => {
        it("sukses: token HANYA di cookie (httpOnly, Secure, SameSite=Strict), body tanpa token", async () => {
            const { id, email } = await seed();
            const r = await login(email, "WEB");
            expect(r.status).toBe(200);
            expect(r.json.data?.tokens).toBeNull();
            expect(r.json.data?.user?.id).toBe(String(id));
            const at = r.cookies.find((c) => c.startsWith("sigm4_at="));
            const rt = r.cookies.find((c) => c.startsWith("sigm4_rt="));
            expect(at).toMatch(/; Max-Age=3600; Path=\/api\/v1; HttpOnly; Secure; SameSite=Strict$/);
            expect(rt).toMatch(/; Max-Age=43200; Path=\/api\/v1\/auth; HttpOnly; Secure; SameSite=Strict$/);
            // Nilai token tidak muncul di body respons.
            expect(r.teks).not.toContain(nilaiCookie(r.cookies, "sigm4_at") ?? "tidak-ada");
            expect(r.teks).not.toContain(nilaiCookie(r.cookies, "sigm4_rt") ?? "tidak-ada");
            const [baris] = await barisKeluarga(id);
            expect(baris?.platform).toBe("WEB");
        });

        it("cookie akses dipakai pada endpoint terkunci", async () => {
            const { email } = await seed();
            const r = await login(email, "WEB");
            const ok = await kirim(url, "/locations/tree", undefined, { cookie: `sigm4_at=${nilaiCookie(r.cookies, "sigm4_at") ?? ""}` }, "GET");
            expect(ok.status).toBe(200);
        });

        it("masa berlaku refresh web 12 jam", async () => {
            const { id, email } = await seed();
            await login(email, "WEB");
            const [ttl] = await kueri<{ detik: string }>(
                `SELECT extract(epoch FROM (expires_at - issued_at))::text AS detik FROM refresh_tokens WHERE user_id = ${String(id)}`,
            );
            expect(Number(ttl?.detik)).toBe(REFRESH_TTL_DETIK.WEB);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/login — penolakan", () => {
        it("password salah dan email tak dikenal → 401 UNAUTHENTICATED dengan respons IDENTIK (tidak membocorkan email)", async () => {
            const { id, email } = await seed();
            const salah = await login(email, "ANDROID", "password-yang-salah");
            const asing = await login(`tidak-ada-${randomUUID().slice(0, 8)}@sekolah.sch.id`);
            expect(salah.status).toBe(401);
            expect(asing.status).toBe(401);
            expect(salah.json.error).toEqual(asing.json.error);
            expect(salah.json.error?.code).toBe("UNAUTHENTICATED");
            expect(await barisKeluarga(id)).toEqual([]);
            const [user] = await kueri<{ waktu: string | null }>(`SELECT login_terakhir_pada::text AS waktu FROM users WHERE id = ${String(id)}`);
            expect(user?.waktu).toBeNull();
            expect(await jumlahAudit(id, "LOGIN_SUCCESS")).toBe(0);
        });

        it("email dicocokkan tanpa memandang huruf besar-kecil dan spasi tepi", async () => {
            const { email } = await seed();
            expect((await login(`  ${email.toUpperCase()}  `)).status).toBe(200);
        });

        it("akun NONAKTIF: password benar → 403 FORBIDDEN tanpa sesi; password salah → tetap 401 (tidak membedakan)", async () => {
            const { id, email } = await seed({ status: "NONAKTIF" });
            const benar = await login(email);
            expect(benar.status).toBe(403);
            expect(benar.json.error?.code).toBe("FORBIDDEN");
            expect(await barisKeluarga(id)).toEqual([]);
            expect((await login(email, "ANDROID", "salah")).status).toBe(401);
        });

        it.each([
            ["tanpa platform", { email: "a@b.c", password: "x" }],
            ["platform tak dikenal", { email: "a@b.c", password: "x", platform: "DESKTOP" }],
            ["tanpa password", { email: "a@b.c", platform: "WEB" }],
            ["email kosong", { email: " ", password: "x", platform: "WEB" }],
            ["password kelewat panjang", { email: "a@b.c", password: "x".repeat(513), platform: "WEB" }],
        ])("%s → 400 INVALID_REQUEST", async (_nama, body) => {
            const r = await kirim(url, "/auth/login", body);
            expect(r.status).toBe(400);
            expect(r.json.error?.code).toBe("INVALID_REQUEST");
        });

        it("pengguna wajib ganti password: login sukses menandainya, dan access token-nya hanya menjangkau /auth/* (403 PASSWORD_CHANGE_REQUIRED)", async () => {
            const { email } = await seed({ wajibGanti: true });
            const r = await login(email);
            expect(r.status).toBe(200);
            expect(r.json.data?.user?.must_change_password).toBe(true);
            const gerbang = await kirim(url, "/locations/tree", undefined, { authorization: `Bearer ${r.json.data?.tokens?.access_token ?? ""}` }, "GET");
            expect(gerbang.status).toBe(403);
            expect(gerbang.json.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");
            // Refresh tetap berjalan dan mempertahankan tandanya.
            const baru = await refresh(r.json.data?.tokens?.refresh_token);
            expect(baru.status).toBe(200);
            const masih = await kirim(url, "/locations/tree", undefined, { authorization: `Bearer ${baru.json.data?.tokens?.access_token ?? ""}` }, "GET");
            expect(masih.json.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("rate limit kelas `login` (SDD-13 §4.3, NFR-S-07)", () => {
        it("hanya percobaan GAGAL yang dihitung: login sukses berulang tidak menghabiskan jatah; kegagalan ke-5 menutup IP — bahkan bagi kredensial benar", async () => {
            const { email } = await seed();
            const ip = ipUnik();
            const h = { "x-forwarded-for": ip };
            for (let i = 0; i < 6; i += 1) {
                const ok = await kirim(urlBatas, "/auth/login", { email, password: PASSWORD, platform: "ANDROID" }, h);
                expect(ok.status, `sukses ke-${String(i + 1)}`).toBe(200);
            }
            for (let i = 0; i < 5; i += 1) {
                const gagal = await kirim(urlBatas, "/auth/login", { email, password: "salah", platform: "ANDROID" }, h);
                expect(gagal.status, `gagal ke-${String(i + 1)}`).toBe(401);
                // Pencatatan dilakukan pada `finish`; beri kesempatan agar tercatat sebelum percobaan berikut.
                await new Promise((r) => setTimeout(r, 30));
            }
            const ditutup = await kirim(urlBatas, "/auth/login", { email, password: PASSWORD, platform: "ANDROID" }, h);
            expect(ditutup.status).toBe(429);
            expect(ditutup.json.error?.code).toBe("RATE_LIMIT_EXCEEDED");
            expect(ditutup.headers.get("retry-after")).not.toBeNull();
            // IP lain tidak terdampak — dengan akun LAIN: lima kegagalan tadi juga mengunci akun `email` (PR-02-03).
            const akunLain = await seed();
            const lain = await kirim(urlBatas, "/auth/login", { email: akunLain.email, password: PASSWORD, platform: "ANDROID" }, { "x-forwarded-for": ipUnik() });
            expect(lain.status).toBe(200);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/refresh — rotasi (SDD-SESS-04)", () => {
        it("mobile: token lama ditukar pasangan baru; baris lama dirotasi, baris baru menunjuknya (parent_id), keluarga dan platform diwarisi", async () => {
            const { id, email } = await seed();
            const awal = await login(email, "ANDROID");
            clock.advance(1000);
            const r = await refresh(awal.json.data?.tokens?.refresh_token);
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            expect(r.cookies).toEqual([]);
            const baru = r.json.data?.tokens;
            expect(baru?.refresh_token).not.toBe(awal.json.data?.tokens?.refresh_token);
            expect(baru?.access_token).not.toBe(awal.json.data?.tokens?.access_token);
            const [lama, anak, ...sisa] = await barisKeluarga(id);
            expect(sisa).toEqual([]);
            expect(lama?.rotated_at).not.toBeNull();
            expect(lama?.revoked_at).toBeNull();
            expect(anak).toMatchObject({ parent_id: lama?.id, family_id: lama?.family_id, platform: "ANDROID", rotated_at: null, revoked_at: null });
            // Access token baru berlaku.
            const ok = await kirim(url, "/locations/tree", undefined, { authorization: `Bearer ${baru?.access_token ?? ""}` }, "GET");
            expect(ok.status).toBe(200);
        });

        it("rantai berlanjut: setiap rotasi menurunkan token baru dalam keluarga yang sama", async () => {
            const { id, email } = await seed();
            let token = (await login(email, "IOS")).json.data?.tokens?.refresh_token;
            for (let i = 0; i < 3; i += 1) {
                const r = await refresh(token);
                expect(r.status).toBe(200);
                token = r.json.data?.tokens?.refresh_token;
            }
            const baris = await barisKeluarga(id);
            expect(baris).toHaveLength(4);
            expect(new Set(baris.map((b) => b.family_id)).size).toBe(1);
            expect(baris.slice(1).map((b, i) => b.parent_id === baris[i]?.id)).toEqual([true, true, true]);
        });

        it("web: token dari cookie sigm4_rt, respons hanya cookie baru (body tanpa token), refresh baru berlaku 12 jam", async () => {
            const { id, email } = await seed();
            const awal = await login(email, "WEB");
            const rt = nilaiCookie(awal.cookies, "sigm4_rt") ?? "";
            const r = await kirim(url, "/auth/refresh", {}, { cookie: `sigm4_rt=${rt}` });
            expect(r.status).toBe(200);
            expect(r.json.data?.tokens).toBeNull();
            expect(nilaiCookie(r.cookies, "sigm4_rt")).toMatch(/^[A-Za-z0-9_-]{43}$/);
            expect(nilaiCookie(r.cookies, "sigm4_rt")).not.toBe(rt);
            expect(nilaiCookie(r.cookies, "sigm4_at")?.split(".")).toHaveLength(3);
            expect(r.teks).not.toContain(nilaiCookie(r.cookies, "sigm4_rt") ?? "tidak-ada");
            expect((await barisKeluarga(id)).map((b) => b.platform)).toEqual(["WEB", "WEB"]);
        });

        it("platform diwarisi dari baris, BUKAN dari permintaan: token web yang dikirim di body tetap menjawab dengan cookie", async () => {
            const { email } = await seed();
            const awal = await login(email, "WEB");
            const r = await refresh(nilaiCookie(awal.cookies, "sigm4_rt"));
            expect(r.status).toBe(200);
            expect(r.json.data?.tokens).toBeNull();
            expect(r.cookies.length).toBe(2);
        });

        it("refresh tidak menuntut access token: berjalan dengan access token kedaluwarsa (authenticate lenient)", async () => {
            const { email } = await seed();
            const awal = await login(email, "ANDROID");
            clock.advance(2 * 3600 * 1000);
            const kedaluwarsa = await kirim(url, "/locations/tree", undefined, { authorization: `Bearer ${awal.json.data?.tokens?.access_token ?? ""}` }, "GET");
            expect(kedaluwarsa.status).toBe(401);
            expect(kedaluwarsa.json.error?.code).toBe("TOKEN_EXPIRED");
            const r = await refresh(awal.json.data?.tokens?.refresh_token, { authorization: `Bearer ${awal.json.data?.tokens?.access_token ?? ""}` });
            expect(r.status).toBe(200);
            clock.advance(-2 * 3600 * 1000);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("pemakaian ulang refresh token → seluruh rantai dicabut (SDD-SESS-04, acceptance PR-02-02)", () => {
        it("token lama pasca-rotasi ditolak 401, MENCABUT keluarga (termasuk token terbaru yang sah), dan tercatat REFRESH_TOKEN_REUSE_DETECTED", async () => {
            const { id, email } = await seed();
            const awal = await login(email, "ANDROID");
            const t1 = awal.json.data?.tokens?.refresh_token;
            const r2 = await refresh(t1);
            const t2 = r2.json.data?.tokens?.refresh_token;
            expect(r2.status).toBe(200);

            // Pencuri (atau klien yang keliru) memakai ulang token lama.
            const reuse = await refresh(t1);
            expect(reuse.status).toBe(401);
            expect(reuse.json.error?.code).toBe("UNAUTHENTICATED");

            // Pencabutan ter-commit meski permintaannya berakhir 401.
            const baris = await barisKeluarga(id);
            expect(baris).toHaveLength(2);
            for (const b of baris) {
                expect(b.revoked_at, `baris ${b.id}`).not.toBeNull();
                expect(b.revoke_reason).toBe("reuse_detected");
            }
            expect(await jumlahAudit(id, "REFRESH_TOKEN_REUSE_DETECTED")).toBe(1);

            // Token terbaru yang tadinya sah kini ikut mati.
            const korban = await refresh(t2);
            expect(korban.status).toBe(401);
            // Login baru membuka keluarga baru yang tidak terdampak.
            const baru = await login(email, "ANDROID");
            expect(baru.status).toBe(200);
            expect((await refresh(baru.json.data?.tokens?.refresh_token)).status).toBe(200);
        });

        it("percobaan berikutnya atas keluarga yang sudah dicabut tetap 401 dan tidak menambah entri log", async () => {
            const { id, email } = await seed();
            const t1 = (await login(email)).json.data?.tokens?.refresh_token;
            await refresh(t1);
            await refresh(t1);
            expect(await jumlahAudit(id, "REFRESH_TOKEN_REUSE_DETECTED")).toBe(1);
            await refresh(t1);
            await refresh(t1);
            expect(await jumlahAudit(id, "REFRESH_TOKEN_REUSE_DETECTED")).toBe(1);
        });

        it("keluarga lain milik pengguna yang sama (perangkat lain) tidak ikut dicabut", async () => {
            const { id, email } = await seed();
            const a = await login(email, "ANDROID");
            const b = await login(email, "IOS");
            await refresh(a.json.data?.tokens?.refresh_token);
            expect((await refresh(a.json.data?.tokens?.refresh_token)).status).toBe(401);
            expect((await refresh(b.json.data?.tokens?.refresh_token)).status).toBe(200);
            const baris = await barisKeluarga(id);
            expect(new Set(baris.filter((x) => x.revoked_at === null).map((x) => x.family_id)).size).toBe(1);
        });

        it("dua refresh SERENTAK atas token yang sama: satu menang, satu ditolak (SELECT … FOR UPDATE), keluarga berakhir dicabut", async () => {
            const { id, email } = await seed();
            const t1 = (await login(email)).json.data?.tokens?.refresh_token;
            const [x, y] = await Promise.all([refresh(t1), refresh(t1)]);
            expect([x.status, y.status].sort()).toEqual([200, 401]);
            const baris = await barisKeluarga(id);
            // Tepat satu anak: rotasi tidak pernah bercabang.
            expect(baris).toHaveLength(2);
            expect(baris.every((b) => b.revoked_at !== null)).toBe(true);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/refresh — penolakan lain", () => {
        it("kedaluwarsa → 401 dan tidak mencabut apa pun (kedaluwarsa bukan pencurian)", async () => {
            const { id, email } = await seed();
            const awal = await login(email, "WEB");
            clock.advance((REFRESH_TTL_DETIK.WEB + 1) * 1000);
            const r = await refresh(nilaiCookie(awal.cookies, "sigm4_rt"));
            expect(r.status).toBe(401);
            const [baris, ...sisa] = await barisKeluarga(id);
            expect(sisa).toEqual([]);
            expect(baris?.revoked_at).toBeNull();
            expect(baris?.rotated_at).toBeNull();
            clock.advance(-(REFRESH_TTL_DETIK.WEB + 1) * 1000);
        });

        it.each([
            ["tanpa token", undefined],
            ["bentuk salah", "bukan-token"],
            ["bentuk sah tetapi tak dikenal", "A".repeat(43)],
        ])("%s → 401 UNAUTHENTICATED", async (_nama, token) => {
            const r = await refresh(token);
            expect(r.status).toBe(401);
            expect(r.json.error?.code).toBe("UNAUTHENTICATED");
        });

        it("kegagalan pada sesi web membuang cookie basi (Max-Age=0); mobile tidak menerima Set-Cookie", async () => {
            const web = await kirim(url, "/auth/refresh", {}, { cookie: `sigm4_rt=${"A".repeat(43)}` });
            expect(web.status).toBe(401);
            expect(web.cookies.some((c) => c.startsWith("sigm4_at=;") && c.includes("Max-Age=0"))).toBe(true);
            expect(web.cookies.some((c) => c.startsWith("sigm4_rt=;") && c.includes("Max-Age=0"))).toBe(true);
            const mobile = await refresh("A".repeat(43));
            expect(mobile.cookies).toEqual([]);
        });

        it("akun dinonaktifkan setelah login: refresh 401 dan seluruh keluarganya dicabut (account_deactivated)", async () => {
            const { id, email } = await seed();
            const awal = await login(email);
            await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(id)}`);
            const r = await refresh(awal.json.data?.tokens?.refresh_token);
            expect(r.status).toBe(401);
            const [baris] = await barisKeluarga(id);
            expect(baris?.revoked_at).not.toBeNull();
            expect(baris?.revoke_reason).toBe("account_deactivated");
            await kueri(`UPDATE users SET status = 'AKTIF' WHERE id = ${String(id)}`);
            expect((await refresh(awal.json.data?.tokens?.refresh_token)).status).toBe(401);
        });

        it("akun dinonaktifkan: access token yang belum kedaluwarsa pun langsung ditolak (PM-05)", async () => {
            const { id, email } = await seed();
            const awal = await login(email);
            const bearer = { authorization: `Bearer ${awal.json.data?.tokens?.access_token ?? ""}` };
            expect((await kirim(url, "/locations/tree", undefined, bearer, "GET")).status).toBe(200);
            await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(id)}`);
            const r = await kirim(url, "/locations/tree", undefined, bearer, "GET");
            expect(r.status).toBe(401);
            expect(r.json.error?.code).toBe("UNAUTHENTICATED");
        });
    });
});
