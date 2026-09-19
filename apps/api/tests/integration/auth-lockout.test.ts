// PR-02-03 — penguncian akun (FR-01.1 A2), audit percobaan gagal, dan respons login SERAGAM
// (SDD-SESS-06/07/12, NFR-S-07, SEC-T-06) terhadap PostgreSQL DAN Redis nyata, lewat HTTP
// penuh pada `createApp()`.
//
// Kontrak yang dibuktikan: email tak dikenal, password salah, dan akun terkunci dijawab `401`
// yang identik byte demi byte (kecuali `request_id`); `423` tidak pernah keluar dari
// `/auth/login`; penguncian tetap terjadi dan tercatat (log + event `AccountLocked`).

import { randomInt, randomUUID } from "node:crypto";
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
import { hashPassword } from "../../src/shared/security/index.js";
import { kunciUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-19T03:00:00Z");
const MENIT = 60_000;
const PASSWORD = "Sandi-Uji-Rahasia-1";
const SALAH = "password-yang-salah";

interface Balasan {
    readonly status: number;
    readonly teks: string;
    readonly json: { success?: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown }; request_id?: string };
    readonly headers: Headers;
}

type StatusAkun = {
    failed_login_count: number;
    failed_login_window_start: string | null;
    locked_until: string | null;
};

/** Badan respons tanpa `request_id` — satu-satunya bagian yang boleh berbeda antar permintaan. */
const tanpaRequestId = (b: Balasan): string => b.teks.replace(/"request_id":"[^"]*"/, '"request_id":"-"');

describe.skipIf(!ADA)("PR-02-03 — penguncian akun + audit percobaan gagal + respons seragam (PostgreSQL + Redis nyata)", () => {
    let redis: Redis;
    let clock: FixedClock;
    let url: string;
    let urlBatas: string;
    let server: Server;
    let serverBatas: Server;
    let hashSandi: string;
    const idPengguna: number[] = [];
    const ipDipakai: string[] = [];
    let urutIp = 0;
    // Kunci sumbu IP hidup di Redis melewati satu kali jalan uji: awalan acak per jalan mencegah IP yang
    // sama dipakai ulang oleh jalan berikutnya (yang sudah tercatat gagal 5 kali dan langsung 429).
    const AWALAN_IP = `10.${String(randomInt(1, 255))}`;

    function bangun(limiter: AppDeps["limiter"]): Server {
        return createServer(
            createApp({
                health: new HealthRegistry(30).register(
                    { name: "database", probe: () => Promise.resolve({ status: "up" }) },
                    { name: "redis", probe: () => Promise.resolve({ status: "up" }) },
                ),
                limiter,
                security: { objectStorageOrigin: "http://minio:9000" },
                logger: new Logger({ clock, tulis: () => undefined }),
                clock,
                db: getDb(),
                auth: { jwtKeys: kunciUji(), permissions: new PermissionCache(getDb(), redis), sessions: new SessionStore(getDb()) },
            }),
        );
    }

    // Penjaga lingkungan sebagai UJI, bukan beforeAll: prasyarat yang hilang harus FAILED, bukan
    // ter-skip diam-diam (templates/PULL-REQUEST.md).
    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(process.env["REDIS_URL"], "REDIS_URL wajib diisi: sumbu IP login dan PermissionCache memakai Redis.").toBeDefined();
    });

    beforeAll(async () => {
        dbmate("up");
        redis = createRedis(readRedisConfig());
        clock = new FixedClock(T0);
        await ensurePartitions(getDb(), clock);
        hashSandi = await hashPassword(PASSWORD);
        server = bangun({ hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) });
        serverBatas = bangun(new RedisRateLimiter(redis, clock));
        await Promise.all([server, serverBatas].map((s) => new Promise<void>((r) => s.listen(0, "127.0.0.1", r))));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
        urlBatas = `http://127.0.0.1:${String((serverBatas.address() as AddressInfo).port)}/api/v1`;
    });

    afterAll(async () => {
        await Promise.all([server, serverBatas].map((s) => new Promise((r) => s.close(r))));
        if (idPengguna.length > 0) {
            const daftar = idPengguna.join(",");
            await kueri(`DELETE FROM event_outbox WHERE event_name = 'AccountLocked' AND aggregate_id IN (${daftar})`);
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND (entitas_id IN (${daftar}) OR user_id IN (${daftar}))`);
        }
        if (ipDipakai.length > 0) {
            await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND host(ip) IN (${ipDipakai.map((i) => `'${i}'`).join(",")})`);
        }
        if (idPengguna.length > 0) await kueri(`DELETE FROM users WHERE id IN (${idPengguna.join(",")})`);
        await redis.quit().catch(() => undefined);
        await closeRedis();
    });

    /** IP unik per permintaan: sumbu IP Redis tidak ikut campur kecuali uji memintanya. */
    const ipBaru = (): string => {
        urutIp += 1;
        const ip = `${AWALAN_IP}.${String(Math.floor(urutIp / 250))}.${String(1 + (urutIp % 250))}`;
        ipDipakai.push(ip);
        return ip;
    };

    async function seed(opsi: { status?: "AKTIF" | "NONAKTIF" } = {}): Promise<{ id: number; email: string }> {
        const email = `kunci-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Uji Kunci', '${email}', '${hashSandi}', 'NIPKUNCI${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = 'R-01'), '${opsi.status ?? "AKTIF"}', false)
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email };
    }

    async function login(email: string, password: string, opsi: { basis?: string; ip?: string; ua?: string } = {}): Promise<Balasan> {
        const res = await fetch(`${opsi.basis ?? url}/auth/login`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-forwarded-for": opsi.ip ?? ipBaru(),
                ...(opsi.ua === undefined ? {} : { "user-agent": opsi.ua }),
            },
            body: JSON.stringify({ email, password, platform: "ANDROID" }),
        });
        const teks = await res.text();
        return { status: res.status, teks, json: JSON.parse(teks) as Balasan["json"], headers: res.headers };
    }

    /** Menjalankan `n` kegagalan berurutan (tiap kali menunggu respons, sehingga urutannya pasti). */
    async function gagal(email: string, n: number): Promise<Balasan[]> {
        const hasil: Balasan[] = [];
        for (let i = 0; i < n; i += 1) hasil.push(await login(email, SALAH));
        return hasil;
    }

    const statusAkun = async (id: number): Promise<StatusAkun> => {
        const [baris] = await kueri<StatusAkun>(
            `SELECT failed_login_count, failed_login_window_start::text, locked_until::text FROM users WHERE id = ${String(id)}`,
        );
        if (baris === undefined) throw new Error("akun hilang");
        return baris;
    };
    const jumlahAudit = async (id: number, aksi: string): Promise<number> =>
        Number(
            (await kueri<{ n: string }>(
                `SELECT count(*)::text AS n FROM activity_logs WHERE modul = 'm01-auth' AND aksi = '${aksi}' AND entitas_id = ${String(id)}`,
            ))[0]?.n,
        );
    const jumlahEvent = async (id: number): Promise<number> =>
        Number(
            (await kueri<{ n: string }>(
                `SELECT count(*)::text AS n FROM event_outbox WHERE event_name = 'AccountLocked' AND aggregate_id = ${String(id)}`,
            ))[0]?.n,
        );

    // ---------------------------------------------------------------------------------------
    describe("penguncian (FR-01.1 A2, SDD-SESS-06)", () => {
        it("5 kegagalan dalam 15 menit → akun terkunci 15 menit; penghitung tersimpan di PostgreSQL", async () => {
            const { id, email } = await seed();
            await gagal(email, 4);
            expect(await statusAkun(id)).toMatchObject({ failed_login_count: 4, locked_until: null });

            await gagal(email, 1);
            const [baris] = await kueri<{ hitungan: number; terkunci: boolean; menit: string }>(`
                SELECT failed_login_count AS hitungan, locked_until IS NOT NULL AS terkunci,
                       extract(epoch FROM (locked_until - failed_login_window_start))::text AS menit
                FROM users WHERE id = ${String(id)}`);
            expect(baris?.hitungan).toBe(5);
            expect(baris?.terkunci).toBe(true);
            // Kunci 15 menit dihitung dari Clock yang di-inject (jam uji beku), bukan dari now() basis data.
            expect(Number(baris?.menit)).toBe(15 * 60);
        });

        it("selagi terkunci, login dengan password BENAR tetap ditolak — dan penghitung tidak berubah", async () => {
            const { id, email } = await seed();
            await gagal(email, 5);
            const sebelum = await statusAkun(id);

            const benar = await login(email, PASSWORD);
            const salah = await login(email, SALAH);
            expect(benar.status).toBe(401);
            expect(salah.status).toBe(401);
            expect(await statusAkun(id)).toEqual(sebelum);
        });

        it("kunci berakhir otomatis: setelah 15 menit login benar berhasil dan penghitung dihapus", async () => {
            const { id, email } = await seed();
            await gagal(email, 5);
            clock.advance(15 * MENIT - 1000);
            expect((await login(email, PASSWORD)).status).toBe(401);
            clock.advance(2000);
            try {
                const r = await login(email, PASSWORD);
                expect(r.status).toBe(200);
                expect(await statusAkun(id)).toEqual({ failed_login_count: 0, failed_login_window_start: null, locked_until: null });
            } finally {
                clock.advance(-(15 * MENIT + 1000));
            }
        });

        it("jendela tetap: kegagalan yang lewat 15 menit dari yang pertama memulai hitungan BARU (bukan kunci)", async () => {
            const { id, email } = await seed();
            await gagal(email, 4);
            clock.advance(15 * MENIT);
            try {
                await gagal(email, 1);
                expect(await statusAkun(id)).toMatchObject({ failed_login_count: 1, locked_until: null });
                expect((await login(email, PASSWORD)).status).toBe(200);
            } finally {
                clock.advance(-15 * MENIT);
            }
        });

        it("login berhasil mereset penghitung: 4 gagal + sukses + 4 gagal TIDAK mengunci (sumbu akun hanya menghitung gagal)", async () => {
            const { id, email } = await seed();
            await gagal(email, 4);
            expect((await login(email, PASSWORD)).status).toBe(200);
            expect(await statusAkun(id)).toMatchObject({ failed_login_count: 0, failed_login_window_start: null });
            await gagal(email, 4);
            expect(await statusAkun(id)).toMatchObject({ failed_login_count: 4, locked_until: null });
            expect((await login(email, PASSWORD)).status).toBe(200);
        });

        it("login sukses berulang tidak menghabiskan jatah akun (6 sukses lalu 4 gagal → belum terkunci)", async () => {
            const { id, email } = await seed();
            for (let i = 0; i < 6; i += 1) expect((await login(email, PASSWORD)).status).toBe(200);
            await gagal(email, 4);
            expect(await statusAkun(id)).toMatchObject({ failed_login_count: 4, locked_until: null });
        });

        it("kegagalan SERENTAK: penguncian terjadi tepat sekali (satu ACCOUNT_LOCKED, satu event), hitungan berhenti di 5", async () => {
            const { id, email } = await seed();
            const hasil = await Promise.all(Array.from({ length: 8 }, () => login(email, SALAH)));
            expect(hasil.every((h) => h.status === 401)).toBe(true);
            expect(await statusAkun(id)).toMatchObject({ failed_login_count: 5 });
            expect(await jumlahAudit(id, "ACCOUNT_LOCKED")).toBe(1);
            expect(await jumlahEvent(id)).toBe(1);
            // Kedelapan percobaan tercatat: 5 kredensial salah + 3 atas akun yang sudah terkunci.
            expect(await jumlahAudit(id, "LOGIN_FAILED")).toBe(8);
        });

        it("akun NONAKTIF: password benar → 403 (FR-01.1 A3); tetapi bila terkunci → 401 seragam", async () => {
            const { email } = await seed({ status: "NONAKTIF" });
            expect((await login(email, PASSWORD)).status).toBe(403);
            await gagal(email, 5);
            const r = await login(email, PASSWORD);
            expect(r.status).toBe(401);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("respons SERAGAM — tidak ada enumerasi akun (SDD-SESS-12)", () => {
        it("email tak dikenal, password salah, dan akun terkunci → 401 IDENTIK byte demi byte (selain request_id)", async () => {
            const ada = await seed();
            const terkunci = await seed();
            await gagal(terkunci.email, 5);

            const asing = await login(`tidak-ada-${randomUUID().slice(0, 8)}@sekolah.sch.id`, SALAH);
            const salah = await login(ada.email, SALAH);
            const kunciBenar = await login(terkunci.email, PASSWORD);
            const kunciSalah = await login(terkunci.email, SALAH);

            for (const r of [asing, salah, kunciBenar, kunciSalah]) {
                expect(r.status).toBe(401);
                expect(r.json.error?.code).toBe("UNAUTHENTICATED");
                expect(r.json.error).not.toHaveProperty("details");
                expect(r.headers.get("retry-after")).toBeNull();
            }
            const badan = new Set([asing, salah, kunciBenar, kunciSalah].map(tanpaRequestId));
            expect([...badan]).toHaveLength(1);
        });

        it("423 ACCOUNT_LOCKED dan sisa waktu kunci TIDAK PERNAH keluar dari /auth/login, dari kegagalan pertama hingga jauh sesudah terkunci", async () => {
            const { email } = await seed();
            const semua = [...(await gagal(email, 8)), await login(email, PASSWORD)];
            for (const r of semua) {
                expect(r.status).toBe(401);
                // `request_id` acak (heksadesimal) dapat kebetulan memuat "423": yang diperiksa badan tanpa itu.
                expect(tanpaRequestId(r)).not.toMatch(/ACCOUNT_LOCKED|terkunci|menit|423/i);
            }
        });

        it("email tak dikenal tidak pernah 'terkunci' dan tidak menyentuh baris pengguna mana pun", async () => {
            const asing = `tidak-ada-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
            const [sebelum] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM users WHERE failed_login_count > 0");
            const hasil = await gagal(asing, 7);
            expect(new Set(hasil.map((h) => h.status))).toEqual(new Set([401]));
            const [sesudah] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM users WHERE failed_login_count > 0");
            expect(sesudah?.n).toBe(sebelum?.n);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("audit percobaan gagal (AL-02, AL-07, NFR-S-16)", () => {
        it("password salah: LOGIN_FAILED (hasil GAGAL) tanpa pelaku, sasaran pada entitas, dengan IP dan perangkat; email TIDAK disimpan", async () => {
            const { id, email } = await seed();
            const ip = ipBaru();
            await login(email, SALAH, { ip, ua: "SIGM4-Test/1.0" });
            const [log] = await kueri<{ user_id: string | null; role: string | null; hasil: string; ip: string; ua: string; entitas: string; alasan: string; percobaan: string; teks: string }>(`
                SELECT user_id::text, role, hasil::text, host(ip) AS ip, user_agent AS ua, entitas,
                       nilai_sesudah->>'alasan' AS alasan, nilai_sesudah->>'percobaan' AS percobaan,
                       activity_logs::text AS teks
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'LOGIN_FAILED' AND entitas_id = ${String(id)}`);
            expect(log).toMatchObject({ user_id: null, role: null, hasil: "GAGAL", ip, ua: "SIGM4-Test/1.0", entitas: "users", alasan: "KREDENSIAL_SALAH", percobaan: "1" });
            expect(log?.teks).not.toContain(email);
            expect(log?.teks).not.toContain(SALAH);
        });

        it("email tak dikenal: LOGIN_FAILED tanpa sasaran; email yang dicoba tidak tersimpan di mana pun pada baris log", async () => {
            const asing = `tidak-ada-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
            const ip = ipBaru();
            await login(asing, SALAH, { ip });
            const [log] = await kueri<{ user_id: string | null; entitas: string | null; entitas_id: string | null; hasil: string; alasan: string; teks: string }>(`
                SELECT user_id::text, entitas, entitas_id::text, hasil::text, nilai_sesudah->>'alasan' AS alasan, activity_logs::text AS teks
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'LOGIN_FAILED' AND host(ip) = '${ip}'`);
            expect(log).toMatchObject({ user_id: null, entitas: null, entitas_id: null, hasil: "GAGAL", alasan: "EMAIL_TIDAK_DIKENAL" });
            expect(log?.teks).not.toContain(asing);
        });

        it("kegagalan ke-5: ACCOUNT_LOCKED tercatat sekali (dengan batas waktu kunci) dan event AccountLocked terbit ke outbox untuk NT-39", async () => {
            const { id, email } = await seed();
            await gagal(email, 4);
            expect(await jumlahAudit(id, "ACCOUNT_LOCKED")).toBe(0);
            expect(await jumlahEvent(id)).toBe(0);

            await gagal(email, 1);
            expect(await jumlahAudit(id, "ACCOUNT_LOCKED")).toBe(1);
            const [log] = await kueri<{ terkunci_sampai: string; percobaan: string }>(`
                SELECT nilai_sesudah->>'terkunci_sampai' AS terkunci_sampai, nilai_sesudah->>'percobaan' AS percobaan
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'ACCOUNT_LOCKED' AND entitas_id = ${String(id)}`);
            expect(new Date(log?.terkunci_sampai ?? "").getTime()).toBe(T0.getTime() + 15 * MENIT);
            expect(log?.percobaan).toBe("5");

            const [event] = await kueri<{ aggregate_type: string; payload: { user_id: string; terkunci_sampai: string }; processed_at: string | null }>(`
                SELECT aggregate_type, payload, processed_at::text FROM event_outbox
                WHERE event_name = 'AccountLocked' AND aggregate_id = ${String(id)}`);
            expect(event?.aggregate_type).toBe("user");
            expect(event?.payload).toEqual({ user_id: String(id), terkunci_sampai: new Date(T0.getTime() + 15 * MENIT).toISOString() });
        });

        it("percobaan atas akun terkunci dicatat sebagai LOGIN_FAILED (alasan AKUN_TERKUNCI) tanpa menambah ACCOUNT_LOCKED", async () => {
            const { id, email } = await seed();
            await gagal(email, 5);
            await login(email, PASSWORD);
            await login(email, SALAH);
            const [n] = await kueri<{ n: string }>(`
                SELECT count(*)::text AS n FROM activity_logs
                WHERE modul = 'm01-auth' AND aksi = 'LOGIN_FAILED' AND entitas_id = ${String(id)} AND nilai_sesudah->>'alasan' = 'AKUN_TERKUNCI'`);
            expect(n?.n).toBe("2");
            expect(await jumlahAudit(id, "ACCOUNT_LOCKED")).toBe(1);
            expect(await jumlahEvent(id)).toBe(1);
        });

        it("login berhasil tidak mencatat LOGIN_FAILED", async () => {
            const { id, email } = await seed();
            expect((await login(email, PASSWORD)).status).toBe(200);
            expect(await jumlahAudit(id, "LOGIN_FAILED")).toBe(0);
            expect(await jumlahAudit(id, "LOGIN_SUCCESS")).toBe(1);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("dua sumbu aktif bersamaan (SEC-T-06, NFR-S-07, SDD-SESS-07)", () => {
        it("sumbu IP (Redis): 5 kegagalan dari SATU IP menutup IP itu (429) — bahkan bagi kredensial benar", async () => {
            const { email } = await seed();
            const ip = ipBaru();
            for (let i = 0; i < 5; i += 1) {
                expect((await login(email, SALAH, { basis: urlBatas, ip })).status).toBe(401);
                // Pencatatan sumbu IP dilakukan pada `finish`; beri kesempatan sebelum percobaan berikut.
                await new Promise((r) => setTimeout(r, 30));
            }
            const ditutup = await login(email, PASSWORD, { basis: urlBatas, ip });
            expect(ditutup.status).toBe(429);
            expect(ditutup.json.error?.code).toBe("RATE_LIMIT_EXCEEDED");
        });

        it("sumbu akun (PostgreSQL): 5 kegagalan dari 5 IP BERBEDA tetap mengunci akun, sehingga IP keenam pun ditolak", async () => {
            const { id, email } = await seed();
            for (let i = 0; i < 5; i += 1) {
                expect((await login(email, SALAH, { basis: urlBatas, ip: ipBaru() })).status).toBe(401);
            }
            expect((await statusAkun(id)).locked_until).not.toBeNull();
            const r = await login(email, PASSWORD, { basis: urlBatas, ip: ipBaru() });
            expect(r.status).toBe(401);
        });

        it("kedua sumbu hanya menghitung kegagalan: 6 login sukses dari satu IP dan satu akun tidak menutup keduanya", async () => {
            const { email } = await seed();
            const ip = ipBaru();
            for (let i = 0; i < 6; i += 1) expect((await login(email, PASSWORD, { basis: urlBatas, ip })).status).toBe(200);
        });
    });
});
