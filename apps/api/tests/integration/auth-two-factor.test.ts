// PR-02-07 — 2FA TOTP (FR-01.5, BR-070, BR-070c, SDD-SESS-08/09/10) terhadap PostgreSQL DAN Redis nyata,
// lewat HTTP penuh pada `createApp()`.
//
// Yang dibuktikan: login akun ber-2FA berhenti di challenge 5 menit sekali pakai (tanpa sesi, tanpa
// me-reset penghitung kegagalan); verifikasi TOTP atau kode cadangan menerbitkan sesi ber-`amr`
// `["pwd","otp"]`; kode yang sama tidak berlaku dua kali; kegagalan memakai penguncian yang sama dengan
// password (423 hanya di langkah ini); pendaftaran menyimpan secret TERENKRIPSI dan kode cadangan
// sebagai hash; dan — inti PR ini — role wajib 2FA (R-01, R-03) tidak dapat menjangkau route terlindung
// mana pun dengan sesi yang baru membuktikan password.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { ensurePartitions } from "../../src/shared/audit/index.js";
import { PermissionCache, SessionStore } from "../../src/shared/auth/index.js";
import { closeRedis, createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { base32Decode, hashPassword, langkahTotp, kodeTotp } from "../../src/shared/security/index.js";
import { KOTAK_TOTP_UJI, daftarkanTotpUji, duaFaktorUji, kodeTotpUji, kunciUji, terbitkanKodeAktivasiUji } from "../helpers/auth.js";
import type { TotpUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-20T03:00:15Z");
const PASSWORD = "Sandi-Uji-Rahasia-1";
const MENIT = 60_000;

type Platform = "WEB" | "ANDROID" | "IOS";

interface Balasan {
    readonly status: number;
    readonly teks: string;
    readonly json: {
        success?: boolean;
        data?: Record<string, unknown>;
        error?: { code: string; message: string; details?: readonly { field: string; message: string }[] };
    };
    readonly headers: Headers;
    readonly cookies: readonly string[];
}

interface Sesi {
    readonly access: string;
    readonly refresh: string;
}

interface Akun {
    readonly id: number;
    readonly email: string;
}

const nilaiCookie = (cookies: readonly string[], nama: string): string | undefined =>
    /^([^=]+)=([^;]*)/.exec(cookies.find((c) => c.startsWith(`${nama}=`)) ?? "")?.[2];

/** Klaim access token (isi JWT tanpa verifikasi — verifikasinya milik `authenticate`, diuji di tempat lain). */
const klaim = (token: string): { amr: string[]; pwd: boolean; sid: string } =>
    JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { amr: string[]; pwd: boolean; sid: string };

const tokensDari = (r: Balasan): Sesi => {
    const t = r.json.data?.["tokens"] as { access_token: string; refresh_token: string } | null | undefined;
    if (t === null || t === undefined) throw new Error(`tidak ada tokens pada respons ${String(r.status)}: ${r.teks}`);
    return { access: t.access_token, refresh: t.refresh_token };
};

describe.skipIf(!ADA)("PR-02-07 — 2FA TOTP (PostgreSQL + Redis nyata)", () => {
    let redis: Redis;
    let clock: FixedClock;
    let url: string;
    let server: Server;
    let hashSandi: string;
    const idPengguna: number[] = [];

    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(process.env["REDIS_URL"], "REDIS_URL wajib diisi: challenge 2FA dan PermissionCache memakai Redis.").toBeDefined();
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
                    jwtKeys: kunciUji(),
                    permissions: new PermissionCache(getDb(), redis),
                    sessions: new SessionStore(getDb()),
                    twoFactor: duaFaktorUji(redis),
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
            await kueri(`DELETE FROM event_outbox WHERE event_name IN ('AccountLocked', 'SessionRevoked', 'TwoFactorEnabled') AND aggregate_id IN (${daftar})`);
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM totp_backup_codes WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM totp_activation_codes WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND (entitas_id IN (${daftar}) OR user_id IN (${daftar}))`);
            await kueri(`DELETE FROM users WHERE id IN (${daftar})`);
        }
        const kunciTantangan = await redis.keys("sigm4:2fa:tantangan:*");
        if (kunciTantangan.length > 0) await redis.del(...kunciTantangan);
        await redis.quit().catch(() => undefined);
        await closeRedis();
    });

    // ---- perkakas ----------------------------------------------------------------------------------

    async function seed(role: string, opsi: { wajibGanti?: boolean; status?: "AKTIF" | "NONAKTIF" } = {}): Promise<Akun> {
        const email = `dua-faktor-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Uji Dua Faktor', '${email}', '${hashSandi}', 'NIP2FA${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = '${role}'), '${opsi.status ?? "AKTIF"}', ${String(opsi.wajibGanti ?? false)})
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email };
    }

    /** Akun dengan 2FA SUDAH aktif (ditanam lewat DB — alur pendaftarannya diuji tersendiri). */
    async function seedBer2fa(role: string, opsi: { wajibGanti?: boolean } = {}): Promise<Akun & TotpUji> {
        const akun = await seed(role, opsi);
        return { ...akun, ...(await daftarkanTotpUji(getDb(), akun.id, clock.now())) };
    }

    async function kirim(metode: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Balasan> {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.44", ...headers },
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

    const login = (email: string, platform: Platform = "ANDROID", password = PASSWORD): Promise<Balasan> =>
        kirim("POST", "/auth/login", {}, { email, password, platform });
    const verifikasi = (challenge: string, kode: string): Promise<Balasan> =>
        kirim("POST", "/auth/2fa/verify", {}, { challenge_token: challenge, kode });
    const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });
    const challengeDari = (r: Balasan): string => {
        const t = r.json.data?.["challenge_token"];
        if (typeof t !== "string") throw new Error(`bukan challenge: ${String(r.status)} ${r.teks}`);
        return t;
    };

    /** Kode TOTP langkah sekarang dengan penjaga pemakaian ulang di-reset: untuk login berulang pada jam tetap. */
    async function kodeSegar(id: number, secret: Buffer, geser = 0): Promise<string> {
        await kueri(`UPDATE users SET totp_last_step = NULL WHERE id = ${String(id)}`);
        return kodeTotpUji(secret, clock.now(), geser);
    }

    /** Kode 6 digit yang PASTI salah: bukan salah satu dari tiga kode yang sedang berlaku. */
    const kodeSalah = (secret: Buffer): string => {
        const sah = new Set([-1, 0, 1].map((g) => kodeTotpUji(secret, clock.now(), g)));
        return ["000000", "111111", "222222"].find((k) => !sah.has(k)) ?? "999999";
    };

    /** Login → challenge → verifikasi TOTP; jalur sungguhan. */
    async function masukDuaFaktor(akun: Akun & { secret: Buffer }, platform: Platform = "ANDROID"): Promise<{ sesi: Sesi; balasan: Balasan }> {
        const l = await login(akun.email, platform);
        const v = await verifikasi(challengeDari(l), await kodeSegar(akun.id, akun.secret));
        if (v.status !== 200) throw new Error(`verifikasi gagal: ${String(v.status)} ${v.teks}`);
        const tokens = v.json.data?.["tokens"] as { access_token: string; refresh_token: string } | null;
        const sesi: Sesi =
            tokens === null
                ? { access: nilaiCookie(v.cookies, "sigm4_at") ?? "", refresh: nilaiCookie(v.cookies, "sigm4_rt") ?? "" }
                : { access: tokens.access_token, refresh: tokens.refresh_token };
        return { sesi, balasan: v };
    }

    /** Login biasa (tanpa 2FA) yang harus menghasilkan sesi langsung. */
    async function masukBiasa(email: string, platform: Platform = "ANDROID"): Promise<{ sesi: Sesi; balasan: Balasan }> {
        const balasan = await login(email, platform);
        if (balasan.status !== 200) throw new Error(`login gagal: ${String(balasan.status)} ${balasan.teks}`);
        return { sesi: platform === "WEB" ? { access: nilaiCookie(balasan.cookies, "sigm4_at") ?? "", refresh: nilaiCookie(balasan.cookies, "sigm4_rt") ?? "" } : tokensDari(balasan), balasan };
    }

    const baris = <T extends Record<string, unknown>>(sql: string): Promise<T[]> => kueri<T>(sql);
    const jumlahAudit = async (id: number, aksi: string): Promise<number> =>
        Number((await baris<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE modul = 'm01-auth' AND aksi = '${aksi}' AND entitas_id = ${String(id)}`))[0]?.n);
    const keluarga = (id: number) =>
        baris<{ family_id: string; otp_verified: boolean; revoked_at: string | null }>(
            `SELECT family_id::text, otp_verified, revoked_at::text FROM refresh_tokens WHERE user_id = ${String(id)} ORDER BY id`,
        );
    const keadaan = async (id: number) =>
        (await baris<{ failed_login_count: number; locked_until: string | null; totp_enabled_at: string | null; totp_last_step: number | null; login_terakhir_pada: string | null }>(
            `SELECT failed_login_count, locked_until::text, totp_enabled_at::text, totp_last_step, login_terakhir_pada::text FROM users WHERE id = ${String(id)}`,
        ))[0];
    const kunciTantangan = () => redis.keys("sigm4:2fa:tantangan:*");

    // ---------------------------------------------------------------------------------------------------
    describe("POST /auth/login — akun ber-2FA berhenti di challenge (FR-01.5 langkah 5, SDD-SESS-10)", () => {
        it("password benar → 200 {requires_2fa, challenge_token}; TANPA tokens, TANPA cookie, TANPA baris refresh", async () => {
            const a = await seedBer2fa("R-05");
            for (const platform of ["ANDROID", "WEB"] as const) {
                const r = await login(a.email, platform);
                expect(r.status).toBe(200);
                expect(r.json.data).toEqual({ requires_2fa: true, challenge_token: expect.any(String), expires_in: 300 });
                expect(r.cookies).toEqual([]);
                expect(r.headers.get("cache-control")).toBe("no-store");
            }
            expect(await keluarga(a.id)).toEqual([]);
            expect(await jumlahAudit(a.id, "LOGIN_SUCCESS")).toBe(0);
        });

        it("penghitung kegagalan TIDAK di-reset oleh password benar; baru oleh kode yang benar", async () => {
            const a = await seedBer2fa("R-05");
            await kueri(`UPDATE users SET failed_login_count = 3, failed_login_window_start = '${T0.toISOString()}' WHERE id = ${String(a.id)}`);
            const l = await login(a.email);
            expect((await keadaan(a.id))?.failed_login_count).toBe(3);
            expect((await verifikasi(challengeDari(l), await kodeSegar(a.id, a.secret))).status).toBe(200);
            const sesudah = await keadaan(a.id);
            expect(sesudah?.failed_login_count).toBe(0);
            expect(sesudah?.login_terakhir_pada).not.toBeNull();
        });

        it("password salah pada akun ber-2FA → 401 seragam, tanpa challenge", async () => {
            const a = await seedBer2fa("R-05");
            const sebelum = (await kunciTantangan()).length;
            const r = await login(a.email, "ANDROID", "Sandi-Salah-Sekali-9");
            expect(r.status).toBe(401);
            expect(r.json.error?.code).toBe("UNAUTHENTICATED");
            expect(r.json.data).toBeUndefined();
            expect((await kunciTantangan()).length).toBe(sebelum);
        });

        it("akun tanpa 2FA (role opsional) tetap login biasa: sesi langsung, amr [pwd], otp_verified=false", async () => {
            const a = await seed("R-05");
            const { sesi, balasan } = await masukBiasa(a.email);
            expect(balasan.json.data).not.toHaveProperty("requires_2fa");
            expect(klaim(sesi.access).amr).toEqual(["pwd"]);
            expect((await keluarga(a.id)).map((k) => k.otp_verified)).toEqual([false]);
        });

        it("hanya yang SUDAH dikonfirmasi yang menantang: secret tertunda (pendaftaran belum selesai) tidak menantang", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email);
            expect((await kirim("POST", "/auth/2fa/enroll", bearer(sesi.access))).status).toBe(200);
            const l = await login(a.email);
            expect(l.json.data).not.toHaveProperty("requires_2fa");
            expect(l.json.data).toHaveProperty("tokens");
        });
    });

    // ---------------------------------------------------------------------------------------------------
    describe("POST /auth/2fa/verify — TOTP (FR-01.5, SDD-SESS-09)", () => {
        it("kode benar → sesi ber-amr [pwd, otp]; sisa kode cadangan; otp_verified; LOGIN_SUCCESS metode TOTP; penghitung di-reset", async () => {
            const a = await seedBer2fa("R-05");
            const l = await login(a.email);
            const kode = await kodeSegar(a.id, a.secret);
            const r = await verifikasi(challengeDari(l), kode);
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            const data = r.json.data as Record<string, unknown>;
            expect(data).toMatchObject({ expires_in: 3600, sisa_kode_cadangan: 10, kode_cadangan_menipis: false });
            expect(data["user"]).toMatchObject({ id: String(a.id), email: a.email, role_kode: "R-05", must_change_password: false });
            expect((data["permissions"] as Record<string, string>)["location.view"]).toBe("all");
            const { access } = tokensDari(r);
            expect(klaim(access).amr).toEqual(["pwd", "otp"]);
            expect((await keluarga(a.id)).map((k) => k.otp_verified)).toEqual([true]);
            expect(await jumlahAudit(a.id, "LOGIN_SUCCESS")).toBe(1);
            const [log] = await baris<{ metode: string; ip: string }>(
                `SELECT nilai_sesudah->>'metode_2fa' AS metode, host(ip) AS ip FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'LOGIN_SUCCESS' AND entitas_id = ${String(a.id)}`,
            );
            expect(log).toEqual({ metode: "TOTP", ip: "198.51.100.44" });
            expect((await keadaan(a.id))?.totp_last_step).toBe(langkahTotp(clock.now()));
            // sesi berfungsi pada endpoint terkunci
            expect((await kirim("GET", "/locations/tree", bearer(access))).status).toBe(200);
        });

        it("jalur WEB: token hanya di cookie httpOnly, tokens null", async () => {
            const a = await seedBer2fa("R-05");
            const { sesi, balasan } = await masukDuaFaktor(a, "WEB");
            expect(balasan.json.data?.["tokens"]).toBeNull();
            expect(klaim(sesi.access).amr).toEqual(["pwd", "otp"]);
            expect(balasan.cookies.some((c) => c.startsWith("sigm4_at=") && c.includes("HttpOnly"))).toBe(true);
            expect((await kirim("GET", "/locations/tree", { cookie: `sigm4_at=${sesi.access}` })).status).toBe(200);
        });

        it("akun must_change_password: sesi terbit dengan pwd=true (gerbang ganti password tetap berlaku)", async () => {
            const a = await seedBer2fa("R-05", { wajibGanti: true });
            const { sesi } = await masukDuaFaktor(a);
            expect(klaim(sesi.access)).toMatchObject({ pwd: true, amr: ["pwd", "otp"] });
            expect((await kirim("GET", "/locations/tree", bearer(sesi.access))).json.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");
        });

        it("kode salah → 401; LOGIN_FAILED (KODE_2FA_SALAH); penghitung naik; challenge BELUM habis (kode benar berikutnya berhasil)", async () => {
            const a = await seedBer2fa("R-05");
            const l = await login(a.email);
            const c = challengeDari(l);
            const r = await verifikasi(c, kodeSalah(a.secret));
            expect(r.status).toBe(401);
            expect(r.json.error?.code).toBe("UNAUTHENTICATED");
            expect(r.json.data).toBeUndefined();
            expect(r.cookies).toEqual([]);
            expect((await keadaan(a.id))?.failed_login_count).toBe(1);
            const [log] = await baris<{ alasan: string; hasil: string }>(
                `SELECT nilai_sesudah->>'alasan' AS alasan, hasil::text FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'LOGIN_FAILED' AND entitas_id = ${String(a.id)}`,
            );
            expect(log).toEqual({ alasan: "KODE_2FA_SALAH", hasil: "GAGAL" });
            expect(await keluarga(a.id)).toEqual([]);
            expect((await verifikasi(c, await kodeSegar(a.id, a.secret))).status).toBe(200);
        });

        it("kegagalan ke-5 → 423 ACCOUNT_LOCKED beserta sisa menit (hanya di langkah ini, SDD-SESS-12); challenge dihabiskan; login ulang 401 seragam", async () => {
            const a = await seedBer2fa("R-05");
            const c = challengeDari(await login(a.email));
            for (let i = 1; i <= 4; i++) expect((await verifikasi(c, kodeSalah(a.secret))).status, `gagal ke-${String(i)}`).toBe(401);
            const kelima = await verifikasi(c, kodeSalah(a.secret));
            expect(kelima.status).toBe(423);
            expect(kelima.json.error?.code).toBe("ACCOUNT_LOCKED");
            expect(kelima.json.error?.message).toMatch(/Coba lagi dalam 15 menit\./);
            expect(await jumlahAudit(a.id, "ACCOUNT_LOCKED")).toBe(1);
            expect(Number((await baris<{ n: string }>(`SELECT count(*)::text AS n FROM event_outbox WHERE event_name = 'AccountLocked' AND aggregate_id = ${String(a.id)}`))[0]?.n)).toBe(1);
            // challenge yang sama tidak lagi berlaku, bahkan dengan kode yang benar
            const sesudah = await verifikasi(c, await kodeSegar(a.id, a.secret));
            expect(sesudah.status).toBe(401);
            // login baru pada akun terkunci: 401 seragam, TIDAK 423 (SDD-SESS-12)
            const ulang = await login(a.email);
            expect(ulang.status).toBe(401);
            expect(ulang.json.error?.code).toBe("UNAUTHENTICATED");
        });

        it("akun yang terkunci SETELAH challenge terbit → verifikasi dijawab 423 dengan sisa waktu", async () => {
            const a = await seedBer2fa("R-05");
            const c = challengeDari(await login(a.email));
            await kueri(`UPDATE users SET locked_until = '${new Date(clock.now().getTime() + 7 * MENIT).toISOString()}' WHERE id = ${String(a.id)}`);
            const r = await verifikasi(c, await kodeSegar(a.id, a.secret));
            expect(r.status).toBe(423);
            expect(r.json.error?.message).toMatch(/dalam 7 menit/);
            expect(await keluarga(a.id)).toEqual([]);
        });

        it("kode yang SAMA tidak berlaku dua kali (RFC 6238 §5.2): login kedua pada langkah yang sama ditolak; langkah berikutnya diterima", async () => {
            const a = await seedBer2fa("R-05");
            const kode = await kodeSegar(a.id, a.secret);
            expect((await verifikasi(challengeDari(await login(a.email)), kode)).status).toBe(200);
            const ulang = await verifikasi(challengeDari(await login(a.email)), kode);
            expect(ulang.status).toBe(401);
            // kode langkah SEBELUMNYA pun tidak lebih baru dari yang sudah diterima
            const lama = await verifikasi(challengeDari(await login(a.email)), kodeTotpUji(a.secret, clock.now(), -1));
            expect(lama.status).toBe(401);
            // langkah berikutnya (jendela ±1) diterima
            const baru = await verifikasi(challengeDari(await login(a.email)), kodeTotpUji(a.secret, clock.now(), 1));
            expect(baru.status).toBe(200);
            expect((await keadaan(a.id))?.totp_last_step).toBe(langkahTotp(clock.now()) + 1);
        });

        it("jendela ±1 langkah: diterima; dua langkah menyimpang ditolak", async () => {
            const a = await seedBer2fa("R-05");
            for (const geser of [-2, 2]) {
                const r = await verifikasi(challengeDari(await login(a.email)), await kodeSegar(a.id, a.secret, geser));
                expect(r.status, `geser ${String(geser)}`).toBe(401);
            }
            const ok = await verifikasi(challengeDari(await login(a.email)), await kodeSegar(a.id, a.secret, -1));
            expect(ok.status).toBe(200);
        });

        it("challenge SEKALI PAKAI: sesudah berhasil, challenge yang sama ditolak walau kodenya benar", async () => {
            const a = await seedBer2fa("R-05");
            const c = challengeDari(await login(a.email));
            expect((await verifikasi(c, await kodeSegar(a.id, a.secret))).status).toBe(200);
            const lagi = await verifikasi(c, await kodeSegar(a.id, a.secret, 1));
            expect(lagi.status).toBe(401);
            expect(lagi.json.error?.code).toBe("UNAUTHENTICATED");
            expect((await keluarga(a.id)).length).toBe(1);
        });

        it("challenge kedaluwarsa menurut Clock (5 menit): tepat sebelum masih berlaku, sesudahnya 401", async () => {
            const a = await seedBer2fa("R-05");
            const c1 = challengeDari(await login(a.email));
            const c2 = challengeDari(await login(a.email));
            clock.advance(5 * MENIT - 1000);
            try {
                expect((await verifikasi(c1, await kodeSegar(a.id, a.secret))).status).toBe(200);
                clock.advance(2000);
                const r = await verifikasi(c2, await kodeSegar(a.id, a.secret));
                expect(r.status).toBe(401);
                expect(r.json.error?.code).toBe("UNAUTHENTICATED");
            } finally {
                clock.advance(-(5 * MENIT + 1000));
            }
        });

        it("challenge palsu, bentuk salah, dan kosong → 401 / 400; challenge BUKAN access token dan sebaliknya", async () => {
            const a = await seedBer2fa("R-05");
            const kode = await kodeSegar(a.id, a.secret);
            expect((await verifikasi("x".repeat(43), kode)).status).toBe(401);
            expect((await verifikasi("pendek", kode)).status).toBe(401);
            expect((await kirim("POST", "/auth/2fa/verify", {}, { kode })).status).toBe(400);
            expect((await kirim("POST", "/auth/2fa/verify", {}, { challenge_token: "", kode })).status).toBe(400);
            expect((await kirim("POST", "/auth/2fa/verify", {}, {})).status).toBe(400);

            const c = challengeDari(await login(a.email));
            // challenge dipakai sebagai Bearer: bukan JWT, tidak pernah diterima sebagai access token (SDD-SESS-10)
            expect((await kirim("GET", "/locations/tree", bearer(c))).status).toBe(401);
            // access token dipakai sebagai challenge: JWT melampaui batas panjang challenge → ditolak di skema (400)
            const { sesi } = await masukDuaFaktor(a);
            expect((await verifikasi(sesi.access, await kodeSegar(a.id, a.secret, 1))).status).toBe(400);
        });

        it("akun dinonaktifkan atau 2FA-nya dilepas SETELAH challenge terbit → 401, tanpa sesi", async () => {
            const a = await seedBer2fa("R-05");
            const c = challengeDari(await login(a.email));
            await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(a.id)}`);
            expect((await verifikasi(c, await kodeSegar(a.id, a.secret))).status).toBe(401);
            expect(await keluarga(a.id)).toEqual([]);

            const b = await seedBer2fa("R-05");
            const c2 = challengeDari(await login(b.email));
            await kueri(`UPDATE users SET totp_enabled_at = NULL WHERE id = ${String(b.id)}`);
            expect((await verifikasi(c2, await kodeSegar(b.id, b.secret))).status).toBe(401);
        });

        it("kode berbentuk bukan-TOTP bukan-cadangan → 401 dan dihitung sebagai kegagalan", async () => {
            const a = await seedBer2fa("R-05");
            const c = challengeDari(await login(a.email));
            for (const kode of ["abc", "12345", "1234567", "ABCDE-FGHJK-M"]) {
                expect((await verifikasi(c, kode)).status, kode).toBe(401);
            }
            expect((await keadaan(a.id))?.failed_login_count).toBe(4);
        });
    });

    // ---------------------------------------------------------------------------------------------------
    describe("kode cadangan (FR-01.5 A2, BR-070c)", () => {
        it("kode cadangan benar → sesi; SEKALI PAKAI; TWO_FA_BACKUP_CODE_USED dengan sisa; huruf kecil dan tanpa tanda hubung diterima", async () => {
            const a = await seedBer2fa("R-05");
            const [kode0, kode1] = a.kodeCadangan;
            const tampil = `${(kode0 ?? "").slice(0, 5)}-${(kode0 ?? "").slice(5)}`;
            const r = await verifikasi(challengeDari(await login(a.email)), tampil.toLowerCase());
            expect(r.status).toBe(200);
            expect(r.json.data).toMatchObject({ sisa_kode_cadangan: 9, kode_cadangan_menipis: false });
            expect(klaim(tokensDari(r).access).amr).toEqual(["pwd", "otp"]);
            const [log] = await baris<{ sisa: string; metode: string }>(
                `SELECT nilai_sesudah->>'sisa_kode' AS sisa, (SELECT nilai_sesudah->>'metode_2fa' FROM activity_logs WHERE aksi = 'LOGIN_SUCCESS' AND entitas_id = ${String(a.id)}) AS metode
                 FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'TWO_FA_BACKUP_CODE_USED' AND entitas_id = ${String(a.id)}`,
            );
            expect(log).toEqual({ sisa: "9", metode: "KODE_CADANGAN" });
            // kode yang sama tidak berlaku lagi
            const ulang = await verifikasi(challengeDari(await login(a.email)), kode0 ?? "");
            expect(ulang.status).toBe(401);
            // kode lain masih berlaku, dan sisa turun
            const lain = await verifikasi(challengeDari(await login(a.email)), kode1 ?? "");
            expect(lain.json.data).toMatchObject({ sisa_kode_cadangan: 8 });
        });

        it("sisa ≤ 2 → kode_cadangan_menipis (peringatan FR-01.5 AC)", async () => {
            const a = await seedBer2fa("R-05");
            await kueri(`UPDATE totp_backup_codes SET used_at = '${T0.toISOString()}' WHERE id IN (SELECT id FROM totp_backup_codes WHERE user_id = ${String(a.id)} ORDER BY id LIMIT 7)`);
            const pakai = a.kodeCadangan[7] ?? "";
            const r = await verifikasi(challengeDari(await login(a.email)), pakai);
            expect(r.json.data).toMatchObject({ sisa_kode_cadangan: 2, kode_cadangan_menipis: true });
        });

        it("kode cadangan yang SALAH dihitung sebagai kegagalan yang sama dengan TOTP salah", async () => {
            const a = await seedBer2fa("R-05");
            const r = await verifikasi(challengeDari(await login(a.email)), "AAAAA-AAAAA");
            expect(r.status).toBe(401);
            expect((await keadaan(a.id))?.failed_login_count).toBe(1);
        });

        it("kode cadangan tersimpan sebagai hash Argon2id — tidak pernah kode aslinya", async () => {
            const a = await seedBer2fa("R-05");
            const hasil = await baris<{ code_hash: string }>(`SELECT code_hash FROM totp_backup_codes WHERE user_id = ${String(a.id)}`);
            expect(hasil).toHaveLength(10);
            for (const { code_hash } of hasil) {
                expect(code_hash).toMatch(/^\$argon2id\$/);
                expect(a.kodeCadangan.some((k) => code_hash.includes(k))).toBe(false);
            }
        });
    });

    // ---------------------------------------------------------------------------------------------------
    describe("pendaftaran 2FA — POST /auth/2fa/enroll dan /enroll/confirm (FR-01.5 langkah 1-4)", () => {
        it("enroll: secret + URI + 10 kode cadangan SEKALI tampil; secret tersimpan TERENKRIPSI; 2FA belum berlaku; tercatat tanpa rahasia", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email);
            const r = await kirim("POST", "/auth/2fa/enroll", bearer(sesi.access));
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            const data = r.json.data as { secret: string; otpauth_uri: string; kode_cadangan: string[] };
            expect(data.secret).toMatch(/^[A-Z2-7]{32}$/);
            expect(data.otpauth_uri).toContain(`secret=${data.secret}`);
            expect(decodeURIComponent(data.otpauth_uri)).toContain(a.email);
            expect(data.kode_cadangan).toHaveLength(10);
            for (const k of data.kode_cadangan) expect(k).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

            const [u] = await baris<{ enc: Buffer | null; aktif: string | null }>(`SELECT totp_secret_enc AS enc, totp_enabled_at::text AS aktif FROM users WHERE id = ${String(a.id)}`);
            expect(u?.aktif).toBeNull();
            const enc = u?.enc ?? Buffer.alloc(0);
            expect(enc.length).toBeGreaterThan(20);
            const secret = base32Decode(data.secret);
            expect(enc.includes(secret)).toBe(false);
            expect(enc.toString("latin1")).not.toContain(data.secret);
            // dekripsi dengan kunci dan AAD yang benar mengembalikan secret yang ditampilkan; AAD akun lain gagal
            expect(KOTAK_TOTP_UJI.dekripsi(enc, `totp:${String(a.id)}`).equals(secret)).toBe(true);
            expect(() => KOTAK_TOTP_UJI.dekripsi(enc, `totp:${String(a.id + 1)}`)).toThrow();

            expect(await baris(`SELECT 1 FROM totp_backup_codes WHERE user_id = ${String(a.id)}`)).toHaveLength(10);
            expect(await jumlahAudit(a.id, "TWO_FA_ENROLLMENT_STARTED")).toBe(1);
            const [log] = await baris<{ teks: string }>(`SELECT activity_logs::text AS teks FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'TWO_FA_ENROLLMENT_STARTED' AND entitas_id = ${String(a.id)}`);
            expect(log?.teks).not.toContain(data.secret);
            for (const k of data.kode_cadangan) expect(log?.teks).not.toContain(k);
        });

        it("enroll diulang sebelum konfirmasi → secret dan kode diganti; kode cadangan lama tak lagi cocok", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email);
            const satu = (await kirim("POST", "/auth/2fa/enroll", bearer(sesi.access))).json.data as { secret: string; kode_cadangan: string[] };
            const dua = (await kirim("POST", "/auth/2fa/enroll", bearer(sesi.access))).json.data as { secret: string; kode_cadangan: string[] };
            expect(dua.secret).not.toBe(satu.secret);
            expect(await baris(`SELECT 1 FROM totp_backup_codes WHERE user_id = ${String(a.id)}`)).toHaveLength(10);
            // konfirmasi dengan kode dari secret LAMA ditolak; dari secret baru diterima
            const kodeLama = kodeTotp(base32Decode(satu.secret), langkahTotp(clock.now()));
            const kodeBaru = kodeTotp(base32Decode(dua.secret), langkahTotp(clock.now()));
            expect((await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sesi.access), { kode: kodeLama })).status).toBe(422);
            expect((await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sesi.access), { kode: kodeBaru })).status).toBe(200);
        });

        it("konfirmasi kode SALAH → 422 pada field kode; 2FA tetap nonaktif; kode benar → 200, 2FA berlaku, TWO_FA_ENABLED, sesi naik ke amr otp", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email);
            const data = (await kirim("POST", "/auth/2fa/enroll", bearer(sesi.access))).json.data as { secret: string };
            const secret = base32Decode(data.secret);

            const salah = await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sesi.access), { kode: kodeSalah(secret) });
            expect(salah.status).toBe(422);
            expect(salah.json.error).toMatchObject({ code: "VALIDATION_ERROR", details: [{ field: "kode", message: "Kode verifikasi salah atau sudah tidak berlaku." }] });
            expect((await keadaan(a.id))?.totp_enabled_at).toBeNull();
            expect(await jumlahAudit(a.id, "TWO_FA_ENABLED")).toBe(0);

            const kode = kodeTotp(secret, langkahTotp(clock.now()));
            const ok = await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sesi.access), { kode });
            expect(ok.status).toBe(200);
            expect(ok.headers.get("cache-control")).toBe("no-store");
            const baru = ok.json.data?.["access_token"] as string;
            expect(klaim(baru)).toMatchObject({ amr: ["pwd", "otp"], pwd: false, sid: klaim(sesi.access).sid });
            const sesudah = await keadaan(a.id);
            expect(sesudah?.totp_enabled_at).not.toBeNull();
            expect(sesudah?.totp_last_step).toBe(langkahTotp(clock.now()));
            expect(await jumlahAudit(a.id, "TWO_FA_ENABLED")).toBe(1);
            expect((await keluarga(a.id)).map((k) => k.otp_verified)).toEqual([true]);
            // login berikutnya kini menantang
            expect((await login(a.email)).json.data).toHaveProperty("requires_2fa", true);
        });

        it("konfirmasi jalur WEB: token baru di cookie httpOnly, body access_token null", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email, "WEB");
            const cookie = { cookie: `sigm4_at=${sesi.access}` };
            const data = (await kirim("POST", "/auth/2fa/enroll", cookie)).json.data as { secret: string };
            const kode = kodeTotp(base32Decode(data.secret), langkahTotp(clock.now()));
            const r = await kirim("POST", "/auth/2fa/enroll/confirm", cookie, { kode });
            expect(r.status).toBe(200);
            expect(r.json.data).toEqual({ access_token: null });
            const baru = nilaiCookie(r.cookies, "sigm4_at") ?? "";
            expect(klaim(baru).amr).toEqual(["pwd", "otp"]);
            expect(r.cookies.find((c) => c.startsWith("sigm4_at="))).toMatch(/HttpOnly/);
        });

        it("akun must_change_password: token hasil konfirmasi tetap pwd=true (2FA tidak membuka gerbang ganti password)", async () => {
            const a = await seed("R-05", { wajibGanti: true });
            const { sesi } = await masukBiasa(a.email);
            const data = (await kirim("POST", "/auth/2fa/enroll", bearer(sesi.access))).json.data as { secret: string };
            const kode = kodeTotp(base32Decode(data.secret), langkahTotp(clock.now()));
            const ok = await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sesi.access), { kode });
            expect(ok.status).toBe(200);
            expect(klaim(ok.json.data?.["access_token"] as string)).toMatchObject({ pwd: true, amr: ["pwd", "otp"] });
        });

        it("BR-070e: konfirmasi yang berhasil mencabut SELURUH sesi lain (sesi ini tetap hidup); kode salah tidak mencabut apa pun", async () => {
            const a = await seed("R-05");
            const ini = await masukBiasa(a.email, "ANDROID");
            const lain1 = await masukBiasa(a.email, "IOS");
            const lain2 = await masukBiasa(a.email, "WEB");
            const data = (await kirim("POST", "/auth/2fa/enroll", bearer(ini.sesi.access))).json.data as { secret: string };
            const secret = base32Decode(data.secret);

            // kode SALAH: tidak ada yang keluar
            expect((await kirim("POST", "/auth/2fa/enroll/confirm", bearer(ini.sesi.access), { kode: kodeSalah(secret) })).status).toBe(422);
            expect((await kirim("GET", "/locations/tree", bearer(lain1.sesi.access))).status).toBe(200);
            expect((await keluarga(a.id)).every((k) => k.revoked_at === null)).toBe(true);

            const ok = await kirim("POST", "/auth/2fa/enroll/confirm", bearer(ini.sesi.access), { kode: kodeTotp(secret, langkahTotp(clock.now())) });
            expect(ok.status).toBe(200);
            const baru = ok.json.data?.["access_token"] as string;

            // sesi ini hidup; kedua sesi lain mati seketika (access DAN refresh)
            expect((await kirim("GET", "/locations/tree", bearer(baru))).status).toBe(200);
            expect((await kirim("GET", "/locations/tree", bearer(lain1.sesi.access))).status).toBe(401);
            expect((await kirim("GET", "/locations/tree", { cookie: `sigm4_at=${lain2.sesi.access}` })).status).toBe(401);
            expect((await kirim("POST", "/auth/refresh", {}, { refresh_token: lain1.sesi.refresh })).status).toBe(401);
            expect((await kirim("POST", "/auth/refresh", {}, { refresh_token: ini.sesi.refresh })).status).toBe(200);

            const alasan = await baris<{ family_id: string; revoke_reason: string | null; revoked_at: string | null }>(
                `SELECT DISTINCT family_id::text, revoke_reason, revoked_at::text FROM refresh_tokens WHERE user_id = ${String(a.id)} AND revoked_at IS NOT NULL`,
            );
            expect(alasan.map((r) => r.revoke_reason)).toEqual(["two_fa_enabled", "two_fa_enabled"]);
            expect(alasan.map((r) => r.family_id).sort()).toEqual([klaim(lain1.sesi.access).sid, klaim(lain2.sesi.access).sid].sort());

            // audit, dan event outbox dalam transaksi yang sama (SessionRevoked per sesi + TwoFactorEnabled)
            const [log] = await baris<{ n: string }>(`SELECT nilai_sesudah->>'sesi_dicabut' AS n FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'TWO_FA_ENABLED' AND entitas_id = ${String(a.id)}`);
            expect(log?.n).toBe("2");
            const events = await baris<{ event_name: string; alasan: string | null; sesi: string | null }>(
                `SELECT event_name, payload->>'alasan' AS alasan, payload->>'sesi_dicabut' AS sesi FROM event_outbox WHERE aggregate_id = ${String(a.id)} AND event_name IN ('SessionRevoked', 'TwoFactorEnabled') ORDER BY id`,
            );
            expect(events.filter((e) => e.event_name === "SessionRevoked").map((e) => e.alasan)).toEqual(["two_fa_enabled", "two_fa_enabled"]);
            expect(events.filter((e) => e.event_name === "TwoFactorEnabled").map((e) => e.sesi)).toEqual(["2"]);
        });

        it("keadaan yang salah: konfirmasi tanpa enroll → 422; enroll atau konfirmasi saat 2FA sudah aktif → 422; kode bukan 6 digit → 400", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email);
            const h = bearer(sesi.access);
            expect((await kirim("POST", "/auth/2fa/enroll/confirm", h, { kode: "123456" })).json.error?.details?.[0]?.message).toBe("Pendaftaran 2FA belum dimulai.");
            for (const kode of ["12345", "1234567", "abcdef", ""]) expect((await kirim("POST", "/auth/2fa/enroll/confirm", h, { kode })).status, kode).toBe(400);
            expect((await kirim("POST", "/auth/2fa/enroll/confirm", h, {})).status).toBe(400);

            const b = await seedBer2fa("R-05");
            const { sesi: sb } = await masukDuaFaktor(b);
            const enroll = await kirim("POST", "/auth/2fa/enroll", bearer(sb.access));
            expect(enroll.status).toBe(422);
            expect(enroll.json.error?.details?.[0]?.message).toBe("2FA sudah aktif pada akun ini.");
            const confirm = await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sb.access), { kode: await kodeSegar(b.id, b.secret, 1) });
            expect(confirm.status).toBe(422);
        });

        it("tanpa token → 401 pada seluruh route pendaftaran", async () => {
            for (const [metode, path, body] of [
                ["POST", "/auth/2fa/enroll", undefined],
                ["POST", "/auth/2fa/enroll/confirm", { kode: "123456" }],
                ["POST", "/auth/2fa/backup-codes/regenerate", undefined],
            ] as const) {
                const r = await kirim(metode, path, {}, body);
                expect(r.status, path).toBe(401);
                expect(r.json.error?.code).toBe("UNAUTHENTICATED");
            }
        });
    });

    // ---------------------------------------------------------------------------------------------------
    describe("BR-070 — role sensitif TIDAK dapat melewati 2FA (SDD-AUTH-09 gerbang 3)", () => {
        it("R-01 dengan sesi ber-pwd saja: SELURUH route terlindung → 403 TWO_FACTOR_REQUIRED, termasuk yang permission-nya ia pegang", async () => {
            const a = await seed("R-01");
            const { sesi, balasan } = await masukBiasa(a.email);
            expect(klaim(sesi.access).amr).toEqual(["pwd"]);
            expect(balasan.json.data).toHaveProperty("tokens");
            const h = bearer(sesi.access);
            for (const [metode, path, body] of [
                ["GET", "/settings", undefined], // setting.view — dipegang R-01
                ["GET", "/users", undefined],
                ["GET", "/locations/tree", undefined],
                ["GET", "/me", undefined],
                ["PUT", "/me", { nama: "Nama Baru" }],
                ["GET", "/auth/sessions", undefined],
                ["POST", "/auth/logout-all", undefined],
                ["POST", "/auth/password/change", { password_lama: PASSWORD, password_baru: "Rahasia-Baru2026" }],
                ["GET", "/auth/password/requests", undefined],
                ["POST", "/auth/2fa/backup-codes/regenerate", undefined],
            ] as const) {
                const r = await kirim(metode, path, h, body);
                expect(r.status, `${metode} ${path}`).toBe(403);
                expect(r.json.error?.code, `${metode} ${path}`).toBe("TWO_FACTOR_REQUIRED");
            }
            // tak ada perubahan yang lolos
            expect((await baris<{ nama: string }>(`SELECT nama FROM users WHERE id = ${String(a.id)}`))[0]?.nama).toBe("Uji Dua Faktor");
        });

        it("R-03 (Pimpinan Sekolah) diperlakukan sama", async () => {
            const a = await seed("R-03");
            const { sesi } = await masukBiasa(a.email);
            const r = await kirim("GET", "/settings", bearer(sesi.access));
            expect(r.status).toBe(403);
            expect(r.json.error?.code).toBe("TWO_FACTOR_REQUIRED");
        });

        it("hanya pendaftaran 2FA dan logout yang terjangkau — lalu, setelah konfirmasi, akses penuh terbuka dengan token BARU", async () => {
            const a = await seed("R-01");
            const { sesi } = await masukBiasa(a.email);
            const h = bearer(sesi.access);
            // BR-070d: role wajib mendaftar dengan kode aktivasi dari Administrator/CLI.
            const kodeAktivasi = await terbitkanKodeAktivasiUji(getDb(), a.id, clock.now());
            const data = (await kirim("POST", "/auth/2fa/enroll", h, { kode_aktivasi: kodeAktivasi })).json.data as { secret: string };
            const kode = kodeTotp(base32Decode(data.secret), langkahTotp(clock.now()));
            const ok = await kirim("POST", "/auth/2fa/enroll/confirm", h, { kode });
            expect(ok.status).toBe(200);
            const baru = ok.json.data?.["access_token"] as string;
            // token LAMA (amr [pwd]) tetap terkunci; token baru terbuka — sesinya sama
            expect((await kirim("GET", "/settings", h)).json.error?.code).toBe("TWO_FACTOR_REQUIRED");
            expect((await kirim("GET", "/settings", bearer(baru))).status).toBe(200);
            expect(klaim(baru).sid).toBe(klaim(sesi.access).sid);
        });

        it("logout tetap terjangkau bagi sesi yang belum terverifikasi (jalan keluar)", async () => {
            const a = await seed("R-01");
            const { sesi } = await masukBiasa(a.email);
            expect((await kirim("POST", "/auth/logout", bearer(sesi.access))).status).toBe(204);
            expect((await kirim("GET", "/auth/sessions", bearer(sesi.access))).status).toBe(401);
        });

        it("R-01 ber-2FA lewat login sungguhan: akses penuh; refresh MEMPERTAHANKAN amr otp (SDD-SESS-09) sepanjang rotasi", async () => {
            const a = await seedBer2fa("R-01");
            const { sesi } = await masukDuaFaktor(a);
            expect((await kirim("GET", "/settings", bearer(sesi.access))).status).toBe(200);

            const r1 = await kirim("POST", "/auth/refresh", {}, { refresh_token: sesi.refresh });
            expect(r1.status).toBe(200);
            const t1 = tokensDari(r1);
            expect(klaim(t1.access).amr).toEqual(["pwd", "otp"]);
            expect((await kirim("GET", "/settings", bearer(t1.access))).status).toBe(200);
            const r2 = await kirim("POST", "/auth/refresh", {}, { refresh_token: t1.refresh });
            expect(klaim(tokensDari(r2).access).amr).toEqual(["pwd", "otp"]);
            expect((await keluarga(a.id)).every((k) => k.otp_verified)).toBe(true);
        });

        it("refresh TIDAK dapat menaikkan sesi: R-01 ber-pwd tetap ber-pwd sesudah refresh dan tetap terkunci", async () => {
            const a = await seed("R-01");
            const { sesi } = await masukBiasa(a.email);
            const r = await kirim("POST", "/auth/refresh", {}, { refresh_token: sesi.refresh });
            expect(r.status).toBe(200);
            const t = tokensDari(r);
            expect(klaim(t.access).amr).toEqual(["pwd"]);
            expect((await kirim("GET", "/settings", bearer(t.access))).json.error?.code).toBe("TWO_FACTOR_REQUIRED");
        });

        it("refresh sesudah konfirmasi pendaftaran menerbitkan amr otp (baris refresh saat ini ditandai terverifikasi)", async () => {
            const a = await seed("R-01");
            const { sesi } = await masukBiasa(a.email);
            const kodeAktivasi = await terbitkanKodeAktivasiUji(getDb(), a.id, clock.now());
            const data = (await kirim("POST", "/auth/2fa/enroll", bearer(sesi.access), { kode_aktivasi: kodeAktivasi })).json.data as { secret: string };
            const kode = kodeTotp(base32Decode(data.secret), langkahTotp(clock.now()));
            expect((await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sesi.access), { kode })).status).toBe(200);
            const r = await kirim("POST", "/auth/refresh", {}, { refresh_token: sesi.refresh });
            const t = tokensDari(r);
            expect(klaim(t.access).amr).toEqual(["pwd", "otp"]);
            expect((await kirim("GET", "/settings", bearer(t.access))).status).toBe(200);
        });

        it("ganti password mempertahankan amr sesi ini: R-01 ber-2FA tetap terbuka; R-05 tetap [pwd]", async () => {
            const a = await seedBer2fa("R-01");
            const { sesi } = await masukDuaFaktor(a);
            const r = await kirim("POST", "/auth/password/change", bearer(sesi.access), { password_lama: PASSWORD, password_baru: "Rahasia-Baru2026" });
            expect(r.status).toBe(200);
            const baru = r.json.data?.["access_token"] as string;
            expect(klaim(baru).amr).toEqual(["pwd", "otp"]);
            expect((await kirim("GET", "/settings", bearer(baru))).status).toBe(200);

            const b = await seed("R-05");
            const { sesi: sb } = await masukBiasa(b.email);
            const rb = await kirim("POST", "/auth/password/change", bearer(sb.access), { password_lama: PASSWORD, password_baru: "Rahasia-Baru2026" });
            expect(klaim(rb.json.data?.["access_token"] as string).amr).toEqual(["pwd"]);
        });

        it("role opsional (R-05) tak pernah terhalang gerbang, dengan atau tanpa 2FA", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email);
            expect((await kirim("GET", "/locations/tree", bearer(sesi.access))).status).toBe(200);
            expect((await kirim("GET", "/me", bearer(sesi.access))).status).toBe(200);
        });
    });

    // ---------------------------------------------------------------------------------------------------
    describe("POST /auth/2fa/backup-codes/regenerate (FR-01.5 AC, UX P-77)", () => {
        it("sesi ber-otp: 10 kode baru SEKALI tampil; SELURUH kode lama (terpakai atau tidak) tak berlaku; tercatat", async () => {
            const a = await seedBer2fa("R-05");
            const { sesi } = await masukDuaFaktor(a);
            const r = await kirim("POST", "/auth/2fa/backup-codes/regenerate", bearer(sesi.access));
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            const baru = (r.json.data as { kode_cadangan: string[] }).kode_cadangan;
            expect(baru).toHaveLength(10);
            for (const k of baru) expect(k).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
            expect(await baris(`SELECT 1 FROM totp_backup_codes WHERE user_id = ${String(a.id)}`)).toHaveLength(10);
            expect(await baris(`SELECT 1 FROM totp_backup_codes WHERE user_id = ${String(a.id)} AND used_at IS NOT NULL`)).toHaveLength(0);
            expect(await jumlahAudit(a.id, "TWO_FA_BACKUP_CODES_REGENERATED")).toBe(1);
            const [log] = await baris<{ teks: string }>(`SELECT activity_logs::text AS teks FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'TWO_FA_BACKUP_CODES_REGENERATED' AND entitas_id = ${String(a.id)}`);
            for (const k of baru) expect(log?.teks).not.toContain(k);

            // kode LAMA ditolak; kode BARU diterima
            expect((await verifikasi(challengeDari(await login(a.email)), a.kodeCadangan[0] ?? "")).status).toBe(401);
            expect((await verifikasi(challengeDari(await login(a.email)), baru[0] ?? "")).status).toBe(200);
        });

        it("sesi TANPA otp ditolak 403 TWO_FACTOR_REQUIRED — sesi lama yang hanya memegang password tak boleh mencetak kode pemulihan", async () => {
            const a = await seed("R-05");
            const { sesi } = await masukBiasa(a.email); // sesi lahir SEBELUM 2FA aktif: amr [pwd]
            const totp = await daftarkanTotpUji(getDb(), a.id, clock.now());
            const r = await kirim("POST", "/auth/2fa/backup-codes/regenerate", bearer(sesi.access));
            expect(r.status).toBe(403);
            expect(r.json.error?.code).toBe("TWO_FACTOR_REQUIRED");
            // kode cadangan yang ada tidak tersentuh
            const hasil = await baris<{ code_hash: string }>(`SELECT code_hash FROM totp_backup_codes WHERE user_id = ${String(a.id)}`);
            expect(hasil).toHaveLength(totp.kodeCadangan.length);
            expect(await jumlahAudit(a.id, "TWO_FA_BACKUP_CODES_REGENERATED")).toBe(0);
        });

        it("2FA tidak aktif (dilepas sesudah sesi terbit) → 422", async () => {
            const a = await seedBer2fa("R-05");
            const { sesi } = await masukDuaFaktor(a);
            await kueri(`UPDATE users SET totp_enabled_at = NULL WHERE id = ${String(a.id)}`);
            const r = await kirim("POST", "/auth/2fa/backup-codes/regenerate", bearer(sesi.access));
            expect(r.status).toBe(422);
            expect(r.json.error?.details?.[0]?.message).toBe("2FA belum aktif pada akun ini.");
        });
    });
});
