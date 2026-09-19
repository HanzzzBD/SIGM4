// PR-02-04 — logout, logout semua perangkat, daftar perangkat, dan cabut satu perangkat (FR-01.2,
// SDD-04 §4.6, SDD-SESS-04, SDD-AUTH-12) terhadap PostgreSQL DAN Redis nyata, lewat HTTP penuh pada
// `createApp()`.
//
// Acceptance yang dibuktikan: token yang sudah dicabut ditolak 401 pada permintaan BERIKUTNYA
// (bukan menunggu `exp` 60 menit, dan bukan menunggu cache), pencabutan hanya menyentuh sesi
// yang dimaksud, dan setiap pencabutan tercatat (`LOGOUT`/`LOGOUT_ALL_DEVICES`) beserta event
// `SessionRevoked` untuk penonaktifan token FCM (`MOB-SEC-05`, konsumen di `PR-02-25`).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { ensurePartitions } from "../../src/shared/audit/index.js";
import { createSessionRepository } from "../../src/modules/m01-auth/repositories/session.repository.js";
import { PermissionCache, SessionStore, createAuthContext } from "../../src/shared/auth/index.js";
import { closeRedis, createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { REFRESH_TTL_DETIK, hashPassword } from "../../src/shared/security/index.js";
import { kunciUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-19T03:00:00Z");
const MENIT = 60_000;
const PASSWORD = "Sandi-Uji-Rahasia-1";
const ROLE_ADMIN = "R-01"; // memegang setting.view (Lampiran C)

type Platform = "WEB" | "ANDROID" | "IOS";

interface Balasan {
    readonly status: number;
    readonly teks: string;
    readonly json: {
        success?: boolean;
        data?: unknown;
        error?: { code: string; message: string };
    };
    readonly headers: Headers;
    readonly cookies: readonly string[];
}

/** Satu sesi hasil login: token mobile di body, atau nilai cookie untuk WEB. */
interface Sesi {
    readonly platform: Platform;
    readonly access: string;
    readonly refresh: string;
}

interface SesiTampil {
    id: string;
    platform: string;
    ip: string | null;
    user_agent: string | null;
    dibuat_pada: string;
    terakhir_diperbarui: string;
    berlaku_sampai: string;
    saat_ini: boolean;
}

const tanpaRequestId = (b: Balasan): string => b.teks.replace(/"request_id":"[^"]*"/, '"request_id":"-"');
const nilaiCookie = (cookies: readonly string[], nama: string): string | undefined =>
    /^([^=]+)=([^;]*)/.exec(cookies.find((c) => c.startsWith(`${nama}=`)) ?? "")?.[2];

describe.skipIf(!ADA)("PR-02-04 — logout, sesi, dan pencabutan (PostgreSQL + Redis nyata)", () => {
    let redis: Redis;
    let clock: FixedClock;
    let url: string;
    let server: Server;
    let hashSandi: string;
    const jwt = kunciUji();
    const idPengguna: number[] = [];

    // Penjaga lingkungan sebagai UJI, bukan beforeAll: prasyarat yang hilang harus FAILED, bukan
    // ter-skip diam-diam (templates/PULL-REQUEST.md).
    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(process.env["REDIS_URL"], "REDIS_URL wajib diisi: PermissionCache memakai Redis (SDD-AUTH-04).").toBeDefined();
    });

    beforeAll(async () => {
        dbmate("up");
        redis = createRedis(readRedisConfig());
        clock = new FixedClock(T0);
        await ensurePartitions(getDb(), clock);
        hashSandi = await hashPassword(PASSWORD);
        server = createServer(
            createApp({
                health: new HealthRegistry(30).register(
                    { name: "database", probe: () => Promise.resolve({ status: "up" }) },
                    { name: "redis", probe: () => Promise.resolve({ status: "up" }) },
                ),
                limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
                security: { objectStorageOrigin: "http://minio:9000" },
                logger: new Logger({ clock, tulis: () => undefined }),
                clock,
                db: getDb(),
                auth: {
                    jwtKeys: jwt,
                    permissions: new PermissionCache(getDb(), redis),
                    sessions: new SessionStore(getDb()),
                },
            }),
        );
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`;
    });

    afterAll(async () => {
        await new Promise((r) => server.close(r));
        if (idPengguna.length > 0) {
            const daftar = idPengguna.join(",");
            await kueri(`DELETE FROM event_outbox WHERE event_name = 'SessionRevoked' AND aggregate_id IN (${daftar})`);
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND (entitas_id IN (${daftar}) OR user_id IN (${daftar}))`);
            await kueri(`DELETE FROM users WHERE id IN (${daftar})`);
        }
        await redis.quit().catch(() => undefined);
        await closeRedis();
    });

    async function seed(opsi: { wajibGanti?: boolean } = {}): Promise<{ id: number; email: string }> {
        const email = `sesi-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Uji Sesi', '${email}', '${hashSandi}', 'NIPSESI${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = '${ROLE_ADMIN}'), 'AKTIF', ${String(opsi.wajibGanti ?? false)})
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email };
    }

    async function kirim(metode: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Balasan> {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const teks = await res.text();
        return {
            status: res.status,
            teks,
            json: teks === "" ? {} : (JSON.parse(teks) as Balasan["json"]),
            headers: res.headers,
            cookies: res.headers.getSetCookie(),
        };
    }

    async function login(email: string, platform: Platform = "ANDROID", opsi: { ip?: string; ua?: string } = {}): Promise<Sesi> {
        const r = await kirim(
            "POST",
            "/auth/login",
            { "x-forwarded-for": opsi.ip ?? "198.51.100.10", ...(opsi.ua === undefined ? {} : { "user-agent": opsi.ua }) },
            { email, password: PASSWORD, platform },
        );
        expect(r.status, "login").toBe(200);
        const tokens = (r.json.data as { tokens: { access_token: string; refresh_token: string } | null }).tokens;
        if (tokens !== null) return { platform, access: tokens.access_token, refresh: tokens.refresh_token };
        return { platform, access: nilaiCookie(r.cookies, "sigm4_at") ?? "", refresh: nilaiCookie(r.cookies, "sigm4_rt") ?? "" };
    }

    /** Header autentikasi sebuah sesi: Bearer untuk mobile, cookie untuk WEB. */
    const auth = (s: Sesi, ip = "198.51.100.10"): Record<string, string> =>
        s.platform === "WEB"
            ? { cookie: `sigm4_at=${s.access}`, "x-forwarded-for": ip }
            : { authorization: `Bearer ${s.access}`, "x-forwarded-for": ip };

    const refresh = (s: Sesi): Promise<Balasan> =>
        kirim("POST", "/auth/refresh", s.platform === "WEB" ? { cookie: `sigm4_rt=${s.refresh}` } : {}, s.platform === "WEB" ? {} : { refresh_token: s.refresh });
    /** Sesi yang sama setelah rotasi: pasangan token baru dari respons refresh (mobile membawanya di body). */
    const setelahRotasi = (s: Sesi, r: Balasan): Sesi => {
        const t = (r.json.data as { tokens: { access_token: string; refresh_token: string } }).tokens;
        return { ...s, access: t.access_token, refresh: t.refresh_token };
    };
    const settings = (s: Sesi): Promise<Balasan> => kirim("GET", "/settings", auth(s));
    const daftar = async (s: Sesi): Promise<SesiTampil[]> => {
        const r = await kirim("GET", "/auth/sessions", auth(s));
        expect(r.status, "GET /auth/sessions").toBe(200);
        return r.json.data as SesiTampil[];
    };

    const barisKeluarga = (userId: number) =>
        kueri<{ family_id: string; revoked_at: string | null; revoke_reason: string | null }>(
            `SELECT family_id::text, revoked_at::text, revoke_reason FROM refresh_tokens WHERE user_id = ${String(userId)} ORDER BY id`,
        );
    const jumlahAudit = async (id: number, aksi: string): Promise<number> =>
        Number(
            (await kueri<{ n: string }>(
                `SELECT count(*)::text AS n FROM activity_logs WHERE modul = 'm01-auth' AND aksi = '${aksi}' AND entitas_id = ${String(id)}`,
            ))[0]?.n,
        );
    const eventDicabut = (id: number) =>
        kueri<{ aggregate_type: string; payload: { user_id: string; family_id: string; platform: string; alasan: string } }>(
            `SELECT aggregate_type, payload FROM event_outbox WHERE event_name = 'SessionRevoked' AND aggregate_id = ${String(id)} ORDER BY id`,
        );

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/logout — mencabut sesi yang membawa permintaan (FR-01.2)", () => {
        it("204 tanpa badan; access token DAN refresh token sesi itu langsung ditolak 401 — tanpa menunggu exp", async () => {
            const { email } = await seed();
            const s = await login(email);
            expect((await settings(s)).status).toBe(200);

            const r = await kirim("POST", "/auth/logout", auth(s));
            expect(r.status).toBe(204);
            expect(r.teks).toBe("");
            expect(r.headers.get("cache-control")).toBe("no-store");

            // Permintaan BERIKUTNYA — jauh sebelum exp (60 menit) — sudah ditolak.
            const sesudah = await settings(s);
            expect(sesudah.status).toBe(401);
            expect(sesudah.json.error?.code).toBe("UNAUTHENTICATED");
            expect((await kirim("GET", "/auth/sessions", auth(s))).status).toBe(401);
            expect((await refresh(s)).status).toBe(401);
        });

        it("token dicabut oleh logout, bukan dianggap pencurian: seluruh baris keluarga berstatus 'logout', tanpa alarm pemakaian-ulang", async () => {
            const { id, email } = await seed();
            const s = await login(email);
            const r2 = await refresh(s); // satu rotasi: dua baris pada keluarga
            expect(r2.status).toBe(200);
            const baru = setelahRotasi(s, r2);
            await kirim("POST", "/auth/logout", auth(baru));

            const baris = await barisKeluarga(id);
            expect(baris).toHaveLength(2);
            for (const b of baris) {
                expect(b.revoked_at).not.toBeNull();
                expect(b.revoke_reason).toBe("logout");
            }
            expect((await refresh(baru)).status).toBe(401);
            expect((await refresh(s)).status).toBe(401);
            expect(await jumlahAudit(id, "REFRESH_TOKEN_REUSE_DETECTED")).toBe(0);
        });

        it("web: cookie sesi dibuang (Max-Age=0, atribut sama) dan token cookie ditolak sesudahnya", async () => {
            const { email } = await seed();
            const s = await login(email, "WEB");
            expect((await settings(s)).status).toBe(200);
            const r = await kirim("POST", "/auth/logout", auth(s));
            expect(r.status).toBe(204);
            expect(r.cookies).toEqual(
                expect.arrayContaining([
                    "sigm4_at=; Max-Age=0; Path=/api/v1; HttpOnly; Secure; SameSite=Strict",
                    "sigm4_rt=; Max-Age=0; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict",
                ]),
            );
            expect((await settings(s)).status).toBe(401);
            expect((await refresh(s)).status).toBe(401);
        });

        it("hanya sesi ini yang mati: sesi lain milik pengguna yang sama (perangkat lain) tetap berjalan, termasuk refresh-nya", async () => {
            const { email } = await seed();
            const a = await login(email, "ANDROID");
            const b = await login(email, "IOS");
            await kirim("POST", "/auth/logout", auth(a));
            expect((await settings(a)).status).toBe(401);
            expect((await settings(b)).status).toBe(200);
            expect((await refresh(b)).status).toBe(200);
        });

        it("AL-01: LOGOUT tercatat dengan pelaku, IP, dan perangkat dalam transaksi yang sama; event SessionRevoked terbit (MOB-SEC-05)", async () => {
            const { id, email } = await seed();
            const s = await login(email, "ANDROID", { ip: "198.51.100.20" });
            await kirim("POST", "/auth/logout", { ...auth(s, "198.51.100.21"), "user-agent": "SIGM4-Test/2.0" });

            const [log] = await kueri<{ user_id: string; host: string; ua: string; hasil: string; family: string; alasan: string }>(`
                SELECT user_id::text, host(ip) AS host, user_agent AS ua, hasil::text, nilai_sesudah->>'family_id' AS family, nilai_sesudah->>'alasan' AS alasan
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'LOGOUT' AND entitas_id = ${String(id)}`);
            const [keluarga] = await barisKeluarga(id);
            expect(log).toEqual({ user_id: String(id), host: "198.51.100.21", ua: "SIGM4-Test/2.0", hasil: "SUKSES", family: keluarga?.family_id, alasan: "logout" });

            const events = await eventDicabut(id);
            expect(events).toHaveLength(1);
            expect(events[0]).toEqual({
                aggregate_type: "user",
                payload: { user_id: String(id), family_id: keluarga?.family_id, platform: "ANDROID", alasan: "logout" },
            });
        });

        it("logout dua kali dengan token yang sama: yang kedua 401 dan tidak menambah entri log maupun event", async () => {
            const { id, email } = await seed();
            const s = await login(email);
            expect((await kirim("POST", "/auth/logout", auth(s))).status).toBe(204);
            expect((await kirim("POST", "/auth/logout", auth(s))).status).toBe(401);
            expect(await jumlahAudit(id, "LOGOUT")).toBe(1);
            expect(await eventDicabut(id)).toHaveLength(1);
        });

        it("pengguna wajib-ganti-password tetap dapat logout (alur /auth/* lolos gerbang), tetapi route lain 403 PASSWORD_CHANGE_REQUIRED", async () => {
            const { email } = await seed({ wajibGanti: true });
            const s = await login(email);
            expect((await settings(s)).json.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");
            expect((await kirim("POST", "/auth/logout", auth(s))).status).toBe(204);
        });

        it("setelah logout, login baru membuka sesi baru yang tidak terdampak", async () => {
            const { email } = await seed();
            const lama = await login(email);
            await kirim("POST", "/auth/logout", auth(lama));
            const baru = await login(email);
            expect((await settings(baru)).status).toBe(200);
            expect((await settings(lama)).status).toBe(401);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/logout-all — keluar dari semua perangkat (FR-01.2 A1)", () => {
        it("mencabut SELURUH sesi pengguna: semua access dan refresh token mati; sesi pengguna lain tidak tersentuh", async () => {
            const { id, email } = await seed();
            const lain = await seed();
            const s = [await login(email, "ANDROID"), await login(email, "IOS"), await login(email, "WEB")];
            const orangLain = await login(lain.email);

            const r = await kirim("POST", "/auth/logout-all", auth(s[0] as Sesi));
            expect(r.status).toBe(204);
            expect(r.teks).toBe("");

            for (const sesi of s) {
                expect((await settings(sesi)).status, `access ${sesi.platform}`).toBe(401);
                expect((await refresh(sesi)).status, `refresh ${sesi.platform}`).toBe(401);
            }
            const baris = await barisKeluarga(id);
            expect(baris).toHaveLength(3);
            expect(baris.every((b) => b.revoked_at !== null && b.revoke_reason === "logout_all")).toBe(true);
            expect((await settings(orangLain)).status).toBe(200);
            expect((await barisKeluarga(lain.id))[0]?.revoked_at).toBeNull();
        });

        it("LOGOUT_ALL_DEVICES tercatat sekali dengan jumlah sesi, dan satu event SessionRevoked per sesi", async () => {
            const { id, email } = await seed();
            const s = [await login(email, "ANDROID"), await login(email, "IOS"), await login(email, "WEB")];
            await kirim("POST", "/auth/logout-all", auth(s[1] as Sesi, "198.51.100.30"));

            expect(await jumlahAudit(id, "LOGOUT_ALL_DEVICES")).toBe(1);
            expect(await jumlahAudit(id, "LOGOUT")).toBe(0);
            const [log] = await kueri<{ jumlah: string; host: string }>(`
                SELECT nilai_sesudah->>'jumlah_sesi' AS jumlah, host(ip) AS host
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'LOGOUT_ALL_DEVICES' AND entitas_id = ${String(id)}`);
            expect(log).toEqual({ jumlah: "3", host: "198.51.100.30" });

            const events = await eventDicabut(id);
            expect(events).toHaveLength(3);
            expect(events.map((e) => e.payload.platform).sort()).toEqual(["ANDROID", "IOS", "WEB"]);
            expect(new Set(events.map((e) => e.payload.family_id)).size).toBe(3);
            expect(new Set(events.map((e) => e.payload.alasan))).toEqual(new Set(["logout_all"]));
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("GET /auth/sessions — daftar perangkat (UX P-79)", () => {
        it("satu entri per SESI (bukan per token), dengan platform, IP, perangkat, waktu, dan penanda saat_ini", async () => {
            const { email } = await seed();
            const a = await login(email, "ANDROID", { ip: "198.51.100.41", ua: "SIGM4-Android/1.0" });
            const b = await login(email, "WEB", { ip: "198.51.100.42", ua: "Mozilla/5.0 (uji)" });

            const dariA = await daftar(a);
            expect(dariA).toHaveLength(2);
            const sesiA = dariA.find((x) => x.platform === "ANDROID");
            const sesiB = dariA.find((x) => x.platform === "WEB");
            expect(sesiA).toMatchObject({ ip: "198.51.100.41", user_agent: "SIGM4-Android/1.0", saat_ini: true });
            expect(sesiB).toMatchObject({ ip: "198.51.100.42", user_agent: "Mozilla/5.0 (uji)", saat_ini: false });
            expect(sesiA?.id).toMatch(/^[0-9a-f-]{36}$/);
            for (const x of dariA) {
                expect(new Date(x.dibuat_pada).getTime()).toBe(T0.getTime());
                expect(new Date(x.berlaku_sampai).getTime()).toBe(T0.getTime() + REFRESH_TTL_DETIK[x.platform as Platform] * 1000);
            }
            // Dari sudut pandang sesi lain, penandanya berbalik.
            expect((await daftar(b)).map((x) => [x.platform, x.saat_ini])).toEqual(expect.arrayContaining([["ANDROID", false], ["WEB", true]]));
        });

        it("rotasi refresh menggeser terakhir_diperbarui dan berlaku_sampai tetapi id dan dibuat_pada tetap; daftar tidak menggandakan sesi", async () => {
            const { email } = await seed();
            const s = await login(email);
            const [awal] = await daftar(s);
            clock.advance(10 * MENIT);
            try {
                const baru = setelahRotasi(s, await refresh(s));
                const sesudah = await daftar(baru);
                expect(sesudah).toHaveLength(1);
                expect(sesudah[0]?.id).toBe(awal?.id);
                expect(sesudah[0]?.dibuat_pada).toBe(awal?.dibuat_pada);
                expect(new Date(sesudah[0]?.terakhir_diperbarui ?? "").getTime()).toBe(T0.getTime() + 10 * MENIT);
                expect(new Date(sesudah[0]?.berlaku_sampai ?? "").getTime()).toBe(new Date(awal?.berlaku_sampai ?? "").getTime() + 10 * MENIT);
            } finally {
                clock.advance(-10 * MENIT);
            }
        });

        it("sesi yang dicabut atau kedaluwarsa tidak tampil; sesi milik pengguna lain TIDAK PERNAH tampil", async () => {
            const { id, email } = await seed();
            const lain = await seed();
            const a = await login(email, "ANDROID");
            await login(email, "IOS");
            const c = await login(email, "WEB");
            await login(lain.email);

            // b kedaluwarsa (refresh tidak diperbarui): dipaksa lewat basis data.
            const [keluargaB] = await kueri<{ family_id: string }>(
                `SELECT family_id::text FROM refresh_tokens WHERE user_id = ${String(id)} AND platform = 'IOS'`,
            );
            await kueri(`UPDATE refresh_tokens SET issued_at = '${new Date(T0.getTime() - 2 * 86_400_000).toISOString()}', expires_at = '${new Date(T0.getTime() - MENIT).toISOString()}' WHERE family_id = '${keluargaB?.family_id ?? ""}'`);
            await kirim("POST", "/auth/logout", auth(c));

            const tampil = await daftar(a);
            expect(tampil.map((x) => x.platform)).toEqual(["ANDROID"]);
        });

        it("tanpa token → 401", async () => {
            expect((await kirim("GET", "/auth/sessions")).status).toBe(401);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("DELETE /auth/sessions/{id} — cabut satu perangkat", () => {
        it("204: sesi itu mati seketika (access + refresh), sesi pemanggil dan lainnya tetap hidup; tercatat LOGOUT 'device_revoked' + event", async () => {
            const { id, email } = await seed();
            const a = await login(email, "ANDROID");
            const b = await login(email, "IOS");
            const idB = (await daftar(a)).find((x) => x.platform === "IOS")?.id ?? "";

            const r = await kirim("DELETE", `/auth/sessions/${idB}`, auth(a));
            expect(r.status).toBe(204);
            expect(r.teks).toBe("");
            expect(r.cookies).toEqual([]); // yang dicabut bukan sesi ini: cookie tidak disentuh

            expect((await settings(b)).status).toBe(401);
            expect((await refresh(b)).status).toBe(401);
            expect((await settings(a)).status).toBe(200);
            expect((await daftar(a)).map((x) => x.platform)).toEqual(["ANDROID"]);

            const [log] = await kueri<{ family: string; alasan: string; platform: string }>(`
                SELECT nilai_sesudah->>'family_id' AS family, nilai_sesudah->>'alasan' AS alasan, nilai_sesudah->>'platform' AS platform
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'LOGOUT' AND entitas_id = ${String(id)}`);
            expect(log).toEqual({ family: idB, alasan: "device_revoked", platform: "IOS" });
            const events = await eventDicabut(id);
            expect(events).toHaveLength(1);
            expect(events[0]?.payload).toMatchObject({ family_id: idB, platform: "IOS", alasan: "device_revoked" });
        });

        it("mencabut sesi SENDIRI lewat id-nya = logout: 204, cookie web dibuang, token mati", async () => {
            const { email } = await seed();
            const s = await login(email, "WEB");
            const [sendiri] = await daftar(s);
            const r = await kirim("DELETE", `/auth/sessions/${sendiri?.id ?? ""}`, auth(s));
            expect(r.status).toBe(204);
            expect(r.cookies.some((c) => c.startsWith("sigm4_at=;") && c.includes("Max-Age=0"))).toBe(true);
            expect((await settings(s)).status).toBe(401);
        });

        it("sesi MILIK ORANG LAIN dan sesi yang TIDAK ADA dijawab sama persis (403 FORBIDDEN, SDD-AUTH-08); korban tak terganggu", async () => {
            const pemanggil = await seed();
            const korban = await seed();
            const s = await login(pemanggil.email);
            const k = await login(korban.email);
            const idKorban = (await daftar(k))[0]?.id ?? "";

            const milikLain = await kirim("DELETE", `/auth/sessions/${idKorban}`, auth(s));
            const tidakAda = await kirim("DELETE", `/auth/sessions/${randomUUID()}`, auth(s));
            expect(milikLain.status).toBe(403);
            expect(tidakAda.status).toBe(403);
            expect(milikLain.json.error?.code).toBe("FORBIDDEN");
            expect(tanpaRequestId(milikLain)).toBe(tanpaRequestId(tidakAda));

            expect((await settings(k)).status).toBe(200);
            expect(await jumlahAudit(korban.id, "LOGOUT")).toBe(0);
            expect(await jumlahAudit(pemanggil.id, "LOGOUT")).toBe(0);
            expect(await eventDicabut(korban.id)).toHaveLength(0);
        });

        it("id bukan uuid → 400 INVALID_REQUEST sebelum menyentuh basis data", async () => {
            const { email } = await seed();
            const s = await login(email);
            const r = await kirim("DELETE", "/auth/sessions/bukan-uuid", auth(s));
            expect(r.status).toBe(400);
            expect(r.json.error?.code).toBe("INVALID_REQUEST");
        });

        it("mencabut sesi milik sendiri yang SUDAH tercabut: 204 idempoten, tanpa entri log atau event baru", async () => {
            const { id, email } = await seed();
            const a = await login(email, "ANDROID");
            await login(email, "IOS");
            const idB = (await daftar(a)).find((x) => x.platform === "IOS")?.id ?? "";
            expect((await kirim("DELETE", `/auth/sessions/${idB}`, auth(a))).status).toBe(204);
            expect((await kirim("DELETE", `/auth/sessions/${idB}`, auth(a))).status).toBe(204);
            expect(await jumlahAudit(id, "LOGOUT")).toBe(1);
            expect(await eventDicabut(id)).toHaveLength(1);
        });
    });

    // ---------------------------------------------------------------------------------------
    // Lapisan pertahanan berlapis: tidak terjangkau lewat HTTP biasa (token diterbitkan server dan `sid`-nya
    // selalu milik `sub`-nya; jalur cabut memeriksa kepemilikan lebih dulu), tetapi bila salah satu lapis
    // longgar, lapis berikutnya harus tetap menahan.
    describe("kepemilikan sesi ditegakkan di setiap lapis", () => {
        it("SessionStore: token bertanda tangan SAH dengan `sub` pengguna B tetapi `sid` sesi pengguna A ditolak", async () => {
            const a = await seed();
            const b = await seed();
            const sesiA = await login(a.email);
            const idA = (await daftar(sesiA))[0]?.id ?? "";
            const silang = jwt.terbitkan({ sub: String(b.id), sid: idA, pwd: false, amr: ["pwd"] }, T0);
            const r = await kirim("GET", "/settings", { authorization: `Bearer ${silang}` });
            expect(r.status).toBe(401);
            expect((await settings(sesiA)).status).toBe(200);
        });

        it("SessionStore: `sid` yang bukan uuid tidak pernah menyentuh basis data (ditolak, bukan galat 500)", async () => {
            const a = await seed();
            const palsu = jwt.terbitkan({ sub: String(a.id), sid: "bukan-uuid", pwd: false, amr: ["pwd"] }, T0);
            expect((await kirim("GET", "/settings", { authorization: `Bearer ${palsu}` })).status).toBe(401);
        });

        it("SessionRepository: pencabutan oleh AuthContext pengguna lain tidak berdampak apa pun, satu keluarga maupun semua", async () => {
            const a = await seed();
            const b = await seed();
            const sesiA = await login(a.email);
            const idA = (await daftar(sesiA))[0]?.id ?? "";
            const ctxB = createAuthContext({ userId: b.id, roleCode: "R-01", scopes: new Map() });
            const repo = createSessionRepository(getDb());

            expect(await repo.cabutKeluarga(ctxB, idA, T0, "uji")).toBeUndefined();
            expect(await repo.cabutSemua(ctxB, T0, "uji")).toEqual([]);
            expect(await repo.adaMilik(ctxB, idA)).toBe(false);
            expect(await repo.daftarAktif(ctxB, T0)).toEqual([]);
            expect((await settings(sesiA)).status).toBe(200);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("kontrol akses semua endpoint sesi (SDD-AUTH-12)", () => {
        const rute: readonly (readonly [string, string])[] = [
            ["POST", "/auth/logout"],
            ["POST", "/auth/logout-all"],
            ["GET", "/auth/sessions"],
            ["DELETE", `/auth/sessions/${randomUUID()}`],
        ];

        it.each(rute)("%s %s — tanpa token → 401 UNAUTHENTICATED", async (metode, path) => {
            const r = await kirim(metode, path);
            expect(r.status).toBe(401);
            expect(r.json.error?.code).toBe("UNAUTHENTICATED");
        });

        it("access token kedaluwarsa → 401 TOKEN_EXPIRED (klien menukar refresh token), bukan UNAUTHENTICATED", async () => {
            const { email } = await seed();
            const s = await login(email);
            clock.advance(61 * MENIT);
            try {
                const r = await kirim("GET", "/auth/sessions", auth(s));
                expect(r.status).toBe(401);
                expect(r.json.error?.code).toBe("TOKEN_EXPIRED");
            } finally {
                clock.advance(-61 * MENIT);
            }
        });

        it("pemakaian ulang refresh token (SDD-SESS-04) kini mematikan access token sesi itu juga — bukan hanya refresh-nya", async () => {
            const { email } = await seed();
            const s = await login(email);
            const baru = setelahRotasi(s, await refresh(s));
            expect((await settings(baru)).status).toBe(200);

            expect((await refresh(s)).status).toBe(401); // pemakaian ulang token lama
            expect((await settings(baru)).status).toBe(401);
            expect((await refresh(baru)).status).toBe(401);
        });
    });
});
