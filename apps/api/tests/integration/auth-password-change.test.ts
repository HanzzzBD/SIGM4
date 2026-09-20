// PR-02-06 — ganti password sendiri + kelola profil (FR-01.4) terhadap PostgreSQL DAN Redis
// nyata, lewat HTTP penuh pada `createApp()`.
//
// Yang dibuktikan: password lama diverifikasi dan password baru diperiksa terhadap kebijakan
// (`NFR-S-03a`, tanpa daftar bocor/riwayat 3 password — `PR-02-31`); ganti password mencabut
// SELURUH sesi lain tetapi TIDAK sesi ini sendiri; sesi ini langsung mendapat access token baru
// berklaim `pwd=false` sehingga gerbang ganti password (`SDD-AUTH-09`) terbuka seketika tanpa
// menunggu `/auth/refresh` (UX-FLOWS P-05); password sementara hasil reset yang diselesaikan
// menandai permintaannya `SELESAI` dan menerbitkan `NT-38a`; email dan role tidak dapat diubah
// lewat `PUT /me` (`BR-069`).

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
import { hashPassword } from "../../src/shared/security/index.js";
import { kunciUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-20T03:00:00Z");
const PASSWORD = "Sandi-Uji-Rahasia-1";
const NAMA = "Uji Ganti Sandi";
const BARU = "Rahasia-Baru2026";
const METODE = "KARTU_IDENTITAS_TATAP_MUKA";

type Platform = "WEB" | "ANDROID" | "IOS";

interface Balasan {
    readonly status: number;
    readonly teks: string;
    readonly json: {
        success?: boolean;
        data?: unknown;
        error?: { code: string; message: string; details?: readonly { field: string; message: string }[] };
    };
    readonly headers: Headers;
    readonly cookies: readonly string[];
}

interface Sesi {
    readonly platform: Platform;
    readonly access: string;
    readonly refresh: string;
}

const nilaiCookie = (cookies: readonly string[], nama: string): string | undefined =>
    /^([^=]+)=([^;]*)/.exec(cookies.find((c) => c.startsWith(`${nama}=`)) ?? "")?.[2];

describe.skipIf(!ADA)("PR-02-06 — ganti password + kelola profil sendiri (PostgreSQL + Redis nyata)", () => {
    let redis: Redis;
    let clock: FixedClock;
    let url: string;
    let server: Server;
    let hashSandi: string;
    const idPengguna: number[] = [];

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
                    jwtKeys: kunciUji(),
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
            await kueri(`DELETE FROM event_outbox WHERE aggregate_id IN (${daftar})`);
            await kueri(`DELETE FROM password_reset_requests WHERE user_id IN (${daftar}) OR diproses_oleh IN (${daftar})`);
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND (entitas_id IN (${daftar}) OR user_id IN (${daftar}))`);
            await kueri(`DELETE FROM users WHERE id IN (${daftar})`);
        }
        await redis.quit().catch(() => undefined);
        await closeRedis();
    });

    async function seed(opsi: { role?: string; wajibGanti?: boolean; telepon?: string } = {}): Promise<{ id: number; email: string }> {
        const email = `gantisandi-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password, telepon)
            VALUES ('${NAMA}', '${email}', '${hashSandi}', 'NIPGANTI${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = '${opsi.role ?? "R-05"}'), 'AKTIF', ${String(opsi.wajibGanti ?? false)},
                    ${opsi.telepon === undefined ? "NULL" : `'${opsi.telepon}'`})
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email };
    }

    async function kirim(metode: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Balasan> {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", ...headers },
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

    async function login(email: string, password = PASSWORD, platform: Platform = "ANDROID"): Promise<{ sesi: Sesi; balasan: Balasan }> {
        const r = await kirim("POST", "/auth/login", {}, { email, password, platform });
        if (r.status !== 200) return { sesi: { platform, access: "", refresh: "" }, balasan: r };
        const tokens = (r.json.data as { tokens: { access_token: string; refresh_token: string } | null }).tokens;
        const sesi: Sesi =
            tokens !== null
                ? { platform, access: tokens.access_token, refresh: tokens.refresh_token }
                : { platform, access: nilaiCookie(r.cookies, "sigm4_at") ?? "", refresh: nilaiCookie(r.cookies, "sigm4_rt") ?? "" };
        return { sesi, balasan: r };
    }

    const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });
    const auth = (s: Sesi): Record<string, string> => (s.platform === "WEB" ? { cookie: `sigm4_at=${s.access}` } : bearer(s.access));

    const me = (headers: Record<string, string>): Promise<Balasan> => kirim("GET", "/me", headers);
    const ubahProfil = (headers: Record<string, string>, body: unknown): Promise<Balasan> => kirim("PUT", "/me", headers, body);
    const gantiPassword = (headers: Record<string, string>, lama: string, baru: string): Promise<Balasan> =>
        kirim("POST", "/auth/password/change", headers, { password_lama: lama, password_baru: baru });

    const passwordHash = async (id: number): Promise<string> =>
        (await kueri<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ${String(id)}`))[0]?.password_hash ?? "";
    const wajibGanti = async (id: number): Promise<boolean> =>
        (await kueri<{ v: boolean }>(`SELECT must_change_password AS v FROM users WHERE id = ${String(id)}`))[0]?.v ?? false;
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
    const idPermintaanBaru = async (email: string, userId: number): Promise<string> => {
        expect((await kirim("POST", "/auth/password/forgot", {}, { email })).status).toBe(202);
        const [baris] = await kueri<{ id: string }>(
            `SELECT id::text FROM password_reset_requests WHERE user_id = ${String(userId)} ORDER BY id DESC LIMIT 1`,
        );
        if (baris === undefined) throw new Error("permintaan tidak terbentuk");
        return baris.id;
    };
    const terbitkanUntuk = async (adminAuth: Record<string, string>, id: string): Promise<string> => {
        const r = await kirim("POST", `/auth/password/requests/${id}/issue`, adminAuth, { metode_verifikasi: METODE });
        expect(r.status).toBe(200);
        return (r.json.data as { password_sementara: string }).password_sementara;
    };
    async function siapkanAdmin(): Promise<Record<string, string>> {
        const a = await seed({ role: "R-01" });
        const { sesi } = await login(a.email);
        return auth(sesi);
    }

    // ---------------------------------------------------------------------------------------
    describe("GET /me (FR-01.4)", () => {
        it("mengembalikan profil dan permission efektif; tak boleh di-cache", async () => {
            const { id, email } = await seed({ telepon: "081234567890" });
            const { sesi } = await login(email);
            const r = await me(auth(sesi));
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            expect(r.json.data).toMatchObject({
                user: { id: String(id), nama: NAMA, email, telepon: "081234567890", role_kode: "R-05", must_change_password: false },
            });
            const permissions = (r.json.data as { permissions: Record<string, string> }).permissions;
            expect(permissions["location.view"]).toBe("all");
        });

        it("tanpa token → 401", async () => {
            expect((await me({})).status).toBe(401);
        });

        it("must_change_password aktif → 403 PASSWORD_CHANGE_REQUIRED (gerbang SDD-AUTH-09, / bukan /auth/*)", async () => {
            const { email } = await seed({ wajibGanti: true });
            const { sesi } = await login(email);
            const r = await me(auth(sesi));
            expect(r.status).toBe(403);
            expect(r.json.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("PUT /me — kelola profil (FR-01.4 langkah 5, BR-069)", () => {
        it("memperbarui nama dan telepon; email serta role pada body diabaikan (BR-069); tercatat PROFILE_UPDATED", async () => {
            const { id, email } = await seed({ telepon: "081111111111" });
            const { sesi } = await login(email);

            const r = await ubahProfil(auth(sesi), { nama: "Nama Baru", telepon: "082222222222", email: "lain@sekolah.sch.id", role_kode: "R-01" });
            expect(r.status).toBe(200);
            expect(r.json.data).toEqual({ user: { id: String(id), nama: "Nama Baru", email, telepon: "082222222222", role_kode: "R-05", must_change_password: false } });

            const [baris] = await kueri<{ nama: string; email: string; role_kode: string }>(
                `SELECT u.nama, u.email, r.kode AS role_kode FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ${String(id)}`,
            );
            expect(baris).toEqual({ nama: "Nama Baru", email, role_kode: "R-05" });

            const [log] = await kueri<{ sebelum: string; sesudah: string }>(`
                SELECT nilai_sebelum::text AS sebelum, nilai_sesudah::text AS sesudah
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'PROFILE_UPDATED' AND entitas_id = ${String(id)}`);
            expect(JSON.parse(log?.sebelum ?? "{}")).toEqual({ nama: NAMA, telepon: "081111111111" });
            expect(JSON.parse(log?.sesudah ?? "{}")).toEqual({ nama: "Nama Baru", telepon: "082222222222" });
        });

        it("tanpa satu pun field yang berubah → 400 INVALID_REQUEST", async () => {
            const { email } = await seed();
            const { sesi } = await login(email);
            const r = await ubahProfil(auth(sesi), {});
            expect(r.status).toBe(400);
            expect(r.json.error?.code).toBe("INVALID_REQUEST");
        });

        it("tanpa token → 401", async () => {
            expect((await ubahProfil({}, { nama: "x" })).status).toBe(401);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/password/change — validasi (FR-01.4 langkah 2-3, NFR-S-03a)", () => {
        it("password lama salah → 422 VALIDATION_ERROR pada field password_lama; tidak ada yang berubah", async () => {
            const { id, email } = await seed();
            const { sesi } = await login(email);
            const hashAwal = await passwordHash(id);

            const r = await gantiPassword(auth(sesi), "password-salah-total", BARU);
            expect(r.status).toBe(422);
            expect(r.json.error?.code).toBe("VALIDATION_ERROR");
            expect(r.json.error?.details).toEqual([{ field: "password_lama", message: "Password lama salah." }]);
            expect(await passwordHash(id)).toBe(hashAwal);
            expect(await jumlahAudit(id, "PASSWORD_CHANGED")).toBe(0);
        });

        it("password baru terlalu pendek dan tanpa huruf besar → 422 dengan DUA butir error pada password_baru", async () => {
            const { email } = await seed();
            const { sesi } = await login(email);
            const r = await gantiPassword(auth(sesi), PASSWORD, "pendek1");
            expect(r.status).toBe(422);
            expect(r.json.error?.details).toEqual([
                { field: "password_baru", message: "Password baru minimal 12 karakter." },
                { field: "password_baru", message: "Password baru harus mengandung huruf besar." },
            ]);
        });

        it("password baru memuat potongan nama pengguna → 422 CONTAINS_IDENTITY", async () => {
            const { email } = await seed();
            const { sesi } = await login(email);
            const r = await gantiPassword(auth(sesi), PASSWORD, "SandiRahasia99Aa");
            expect(r.status).toBe(422);
            expect(r.json.error?.details).toEqual([{ field: "password_baru", message: "Password baru tidak boleh memuat nama atau email Anda." }]);
        });

        it("tanpa token → 401; body tak lengkap → 400", async () => {
            expect((await gantiPassword({}, PASSWORD, BARU)).status).toBe(401);
            const { email } = await seed();
            const { sesi } = await login(email);
            expect((await kirim("POST", "/auth/password/change", auth(sesi), { password_lama: PASSWORD })).status).toBe(400);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/password/change — sukses (FR-01.4 langkah 4, SDD-04 §4.6)", () => {
        it("mencabut sesi LAIN tetapi TIDAK sesi ini; token access LAMA sesi ini tetap hidup; password lama tak lagi berlaku", async () => {
            const { id, email } = await seed();
            const { sesi: ini } = await login(email, PASSWORD, "ANDROID");
            const { sesi: lain } = await login(email, PASSWORD, "IOS");

            const r = await gantiPassword(auth(ini), PASSWORD, BARU);
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            expect((r.json.data as { access_token: string | null }).access_token).toEqual(expect.any(String));

            // Sesi lain mati seketika.
            expect((await kirim("GET", "/auth/sessions", auth(lain))).status).toBe(401);
            // Sesi ini sendiri tetap hidup dengan token access LAMA sekalipun (family tidak dicabut).
            expect((await kirim("GET", "/auth/sessions", auth(ini))).status).toBe(200);

            expect((await login(email, PASSWORD)).balasan.status).toBe(401);
            expect((await login(email, BARU)).balasan.status).toBe(200);

            const baris = await barisKeluarga(id);
            expect(baris).toHaveLength(2);
            const punyaIni = baris.find((b) => b.revoked_at === null);
            const punyaLain = baris.find((b) => b.revoked_at !== null);
            expect(punyaIni?.revoke_reason).toBeNull();
            expect(punyaLain?.revoke_reason).toBe("password_changed");

            const [log] = await kueri<{ sesi: string; hasil: string; teks: string }>(`
                SELECT nilai_sesudah->>'sesi_dicabut' AS sesi, hasil::text, activity_logs::text AS teks
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'PASSWORD_CHANGED' AND entitas_id = ${String(id)}`);
            expect(log).toMatchObject({ sesi: "1", hasil: "SUKSES" });
            expect(log?.teks).not.toContain(BARU);
            expect(log?.teks).not.toContain(PASSWORD);

            const events = await kueri<{ payload: { alasan: string; family_id: string } }>(
                `SELECT payload FROM event_outbox WHERE event_name = 'SessionRevoked' AND aggregate_id = ${String(id)}`,
            );
            expect(events).toHaveLength(1);
            expect(events[0]?.payload).toMatchObject({ alasan: "password_changed", family_id: punyaLain?.family_id });
        });

        it("access token BARU membawa klaim pwd=false: gerbang ganti password terbuka seketika tanpa /auth/refresh (UX-FLOWS P-05)", async () => {
            const { email } = await seed({ wajibGanti: true });
            const { sesi: lama } = await login(email);
            expect((await me(auth(lama))).status).toBe(403); // token LAMA: pwd=true

            const r = await gantiPassword(auth(lama), PASSWORD, BARU);
            expect(r.status).toBe(200);
            const tokenBaru = (r.json.data as { access_token: string }).access_token;
            expect((await me(bearer(tokenBaru))).status).toBe(200);
            expect((await me(auth(lama))).status).toBe(403); // token lama tetap membawa klaim basi-nya sendiri
        });

        it("WEB: token baru dikirim lewat cookie sigm4_at (bukan body); cookie lama langsung dapat dipakai mengakses /me", async () => {
            const { email } = await seed({ wajibGanti: true });
            const { sesi } = await login(email, PASSWORD, "WEB");
            const r = await gantiPassword(auth(sesi), PASSWORD, BARU);
            expect(r.status).toBe(200);
            expect((r.json.data as { access_token: null }).access_token).toBeNull();
            const cookieBaru = nilaiCookie(r.cookies, "sigm4_at");
            expect(cookieBaru).toBeDefined();
            expect(r.cookies.some((c) => c.startsWith("sigm4_at=") && c.includes("Max-Age=3600") && c.includes("Path=/api/v1"))).toBe(true);
            expect((await me({ cookie: `sigm4_at=${cookieBaru}` })).status).toBe(200);
        });

        it("menyelesaikan penerbitan reset yang DITERBITKAN: status → SELESAI dan event PasswordChangedAfterReset (NT-38a) terbit", async () => {
            const admin = await siapkanAdmin();
            const { id, email } = await seed();
            const idPermintaan = await idPermintaanBaru(email, id);
            const sementara = await terbitkanUntuk(admin, idPermintaan);
            const { sesi } = await login(email, sementara);

            expect(await wajibGanti(id)).toBe(true);
            const r = await gantiPassword(auth(sesi), sementara, BARU);
            expect(r.status).toBe(200);
            expect(await wajibGanti(id)).toBe(false);

            const [baris] = await kueri<{ status: string }>(`SELECT status::text FROM password_reset_requests WHERE id = ${idPermintaan}`);
            expect(baris?.status).toBe("SELESAI");

            const [event] = await kueri<{ aggregate_type: string; payload: { user_id: string; permintaan_id: string } }>(
                `SELECT aggregate_type, payload FROM event_outbox WHERE event_name = 'PasswordChangedAfterReset' AND aggregate_id = ${String(id)}`,
            );
            expect(event).toEqual({ aggregate_type: "user", payload: { user_id: String(id), permintaan_id: idPermintaan } });
        });

        it("akun wajib-ganti TANPA permintaan reset (mis. akun baru buatan Administrator): sukses tanpa SELESAI/NT-38a", async () => {
            const { id, email } = await seed({ wajibGanti: true });
            const { sesi } = await login(email);
            const r = await gantiPassword(auth(sesi), PASSWORD, BARU);
            expect(r.status).toBe(200);
            expect(await wajibGanti(id)).toBe(false);

            expect(await kueri(`SELECT 1 FROM password_reset_requests WHERE user_id = ${String(id)}`)).toEqual([]);
            expect(
                await kueri(`SELECT 1 FROM event_outbox WHERE event_name = 'PasswordChangedAfterReset' AND aggregate_id = ${String(id)}`),
            ).toEqual([]);
        });
    });
});
