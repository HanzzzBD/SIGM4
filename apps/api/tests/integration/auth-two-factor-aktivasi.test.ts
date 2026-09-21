// PR-02-33 — kode aktivasi 2FA (BR-070d) dan reset 2FA oleh Administrator (FR-01.5 A3/A5/A7) terhadap PostgreSQL DAN
// Redis nyata, lewat HTTP penuh pada `createApp()`.
//
// Yang dibuktikan: akun role wajib 2FA (R-01/R-03) TIDAK dapat menyelesaikan pendaftaran 2FA hanya dengan password —
// tanpa kode aktivasi yang diterbitkan Administrator lain, `enroll` ditolak dan tak ada secret yang tersimpan; kode
// sekali pakai, hanya hash, 72 jam, hangus setelah 5 kesalahan TANPA mengunci akun; `enroll/confirm` menuntut kode yang
// sudah terverifikasi pada `enroll`; penerbitan dan reset tidak untuk akun sendiri dan menuntut `user.reset_2fa`; reset
// melepas 2FA, mencabut SELURUH sesi sasaran, dan menerbitkan kode baru bagi role wajib.

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
import { base32Decode, hashPassword, kodeTotp, langkahTotp } from "../../src/shared/security/index.js";
import { daftarkanTotpUji, duaFaktorUji, kunciUji, loginDuaFaktor, terbitkanKodeAktivasiUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-21T03:00:15Z");
const PASSWORD = "Sandi-Uji-Rahasia-1";
const JAM = 3_600_000;
const METODE = "KARTU_IDENTITAS_TATAP_MUKA";
const PESAN_TIDAK_BERLAKU = "Kode aktivasi tidak berlaku. Minta kode baru kepada Administrator.";

type Platform = "WEB" | "ANDROID" | "IOS";

interface Balasan {
    readonly status: number;
    readonly teks: string;
    readonly json: {
        data?: Record<string, unknown>;
        error?: { code: string; message: string; details?: readonly { field: string; message: string }[] };
    };
    readonly headers: Headers;
}

interface Akun {
    readonly id: number;
    readonly email: string;
}

const klaim = (token: string): { sid: string } =>
    JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as { sid: string };

describe.skipIf(!ADA)("PR-02-33 — kode aktivasi 2FA + reset 2FA (PostgreSQL + Redis nyata)", () => {
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
            await kueri(`DELETE FROM event_outbox WHERE event_name IN ('SessionRevoked', 'TwoFactorEnabled') AND aggregate_id IN (${daftar})`);
            await kueri(`DELETE FROM refresh_tokens WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM totp_backup_codes WHERE user_id IN (${daftar})`);
            await kueri(`DELETE FROM totp_activation_codes WHERE user_id IN (${daftar}) OR issued_by IN (${daftar})`);
            await kueri(`DELETE FROM activity_logs WHERE modul = 'm01-auth' AND (entitas_id IN (${daftar}) OR user_id IN (${daftar}))`);
            await kueri(`DELETE FROM users WHERE id IN (${daftar})`);
        }
        await redis.quit().catch(() => undefined);
        await closeRedis();
    });

    // ---- perkakas ----------------------------------------------------------------------------------

    async function seed(role: string, opsi: { status?: "AKTIF" | "NONAKTIF" } = {}): Promise<Akun> {
        const email = `aktivasi-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Uji Aktivasi', '${email}', '${hashSandi}', 'NIPAKT${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = '${role}'), '${opsi.status ?? "AKTIF"}', false)
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email };
    }

    async function kirim(metode: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Balasan> {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.55", ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const teks = await res.text();
        return { status: res.status, teks, json: teks === "" ? {} : (JSON.parse(teks) as Balasan["json"]), headers: res.headers };
    }

    const bearer = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

    /** Administrator (R-01) yang sudah lolos 2FA lewat alur sungguhan; mengembalikan header + akunnya. */
    async function siapkanAdmin(): Promise<{ akun: Akun; h: Record<string, string> }> {
        const akun = await seed("R-01");
        const { accessToken } = await loginDuaFaktor({ url, db: getDb(), userId: akun.id, email: akun.email, password: PASSWORD, sekarang: clock.now() });
        return { akun, h: bearer(accessToken) };
    }

    /** Login biasa (tanpa 2FA aktif) yang harus menghasilkan sesi langsung. */
    async function masuk(email: string, platform: Platform = "ANDROID"): Promise<{ access: string; refresh: string }> {
        const r = await kirim("POST", "/auth/login", {}, { email, password: PASSWORD, platform });
        const t = r.json.data?.["tokens"] as { access_token: string; refresh_token: string } | null | undefined;
        if (r.status !== 200 || t === null || t === undefined) throw new Error(`login gagal: ${String(r.status)} ${r.teks}`);
        return { access: t.access_token, refresh: t.refresh_token };
    }

    const terbitkan = (h: Record<string, string>, id: number, body: unknown = { metode_verifikasi: METODE }): Promise<Balasan> =>
        kirim("POST", `/users/${String(id)}/2fa-activation-code`, h, body);
    const reset = (h: Record<string, string>, id: number, body: unknown = { metode_verifikasi: METODE }): Promise<Balasan> =>
        kirim("POST", `/users/${String(id)}/reset-2fa`, h, body);
    const enroll = (access: string, body?: unknown): Promise<Balasan> => kirim("POST", "/auth/2fa/enroll", bearer(access), body);
    const konfirmasi = (access: string, secretBase32: string): Promise<Balasan> =>
        kirim("POST", "/auth/2fa/enroll/confirm", bearer(access), { kode: kodeTotp(base32Decode(secretBase32), langkahTotp(clock.now())) });

    const baris = <T extends Record<string, unknown>>(sql: string): Promise<T[]> => kueri<T>(sql);
    const kodeAktif = async (uid: number) =>
        (await baris<{ id: string; verified_at: string | null; consumed_at: string | null; failed_attempts: number; issued_by: string | null; metode: string | null; berlaku_jam: number; hash: string }>(
            `SELECT id::text, verified_at::text, consumed_at::text, failed_attempts, issued_by::text, metode_verifikasi::text AS metode,
                    EXTRACT(EPOCH FROM (expires_at - issued_at))::float / 3600 AS berlaku_jam, code_hash AS hash
             FROM totp_activation_codes WHERE user_id = ${String(uid)} AND consumed_at IS NULL`,
        ))[0];
    const userState = async (uid: number) =>
        (await baris<{ enc: Buffer | null; aktif: string | null; langkah: number | null; gagal: number; kunci: string | null }>(
            `SELECT totp_secret_enc AS enc, totp_enabled_at::text AS aktif, totp_last_step AS langkah, failed_login_count AS gagal, locked_until::text AS kunci FROM users WHERE id = ${String(uid)}`,
        ))[0];
    const audit = (uid: number, aksi: string) =>
        baris<{ alasan: string | null; sisa: string | null; pelaku: string | null; nilai: string | null; teks: string }>(
            `SELECT nilai_sesudah->>'alasan' AS alasan, nilai_sesudah->>'sisa_percobaan' AS sisa, user_id::text AS pelaku, nilai_sesudah::text AS nilai, activity_logs::text AS teks
             FROM activity_logs WHERE modul = 'm01-auth' AND aksi = '${aksi}' AND entitas_id = ${String(uid)} ORDER BY id`,
        );
    const keluarga = (uid: number) =>
        baris<{ family_id: string; revoked_at: string | null; revoke_reason: string | null }>(
            `SELECT DISTINCT family_id::text, revoked_at::text, revoke_reason FROM refresh_tokens WHERE user_id = ${String(uid)} ORDER BY family_id`,
        );
    const kodeSalah = (): string => "AAAAA-AAAAA";

    // ---------------------------------------------------------------------------------------------------
    describe("BR-070d — role WAJIB 2FA tidak dapat mendaftar hanya dengan password (POST /auth/2fa/enroll)", () => {
        it("tanpa kode aktivasi → 422 seragam; TIDAK ada secret tersimpan; penolakan tercatat (alasan internal)", async () => {
            for (const role of ["R-01", "R-03"]) {
                const a = await seed(role);
                const s = await masuk(a.email); // sesi ber-pwd: menjangkau enroll (jalan keluar 2FA), tetapi tidak lebih
                for (const body of [undefined, {}, { kode_aktivasi: "" }]) {
                    const r = await enroll(s.access, body);
                    expect(r.status, `${role} ${JSON.stringify(body)}`).toBe(422);
                    expect(r.json.error).toMatchObject({ code: "VALIDATION_ERROR", details: [{ field: "kode_aktivasi", message: PESAN_TIDAK_BERLAKU }] });
                }
                const u = await userState(a.id);
                expect(u?.enc).toBeNull();
                expect(u?.aktif).toBeNull();
                expect(await baris(`SELECT 1 FROM totp_backup_codes WHERE user_id = ${String(a.id)}`)).toHaveLength(0);
                expect((await audit(a.id, "TWO_FA_ENROLLMENT_STARTED")).length).toBe(0);
                expect((await audit(a.id, "TWO_FA_ACTIVATION_CODE_REJECTED")).map((l) => l.alasan)).toEqual(["TIDAK_ADA", "TIDAK_ADA", "TIDAK_ADA"]);
            }
        });

        it("kode benar → enroll berhasil; confirm menghabiskan kode; sesi lain keluar; kode tidak berlaku dua kali", async () => {
            const { akun: admin, h } = await siapkanAdmin();
            const a = await seed("R-03");
            const s = await masuk(a.email);
            const lain = await masuk(a.email, "IOS");
            const t = await terbitkan(h, a.id);
            expect(t.status).toBe(200);
            const kode = t.json.data?.["kode_aktivasi"] as string;

            const e = await enroll(s.access, { kode_aktivasi: kode });
            expect(e.status).toBe(200);
            const dalam = await kodeAktif(a.id);
            expect(dalam).toMatchObject({ consumed_at: null, failed_attempts: 0 });
            expect(dalam?.verified_at).not.toBeNull(); // dicocokkan pada enroll, belum dihabiskan
            expect((await userState(a.id))?.enc).not.toBeNull();

            const c = await konfirmasi(s.access, (e.json.data as { secret: string }).secret);
            expect(c.status).toBe(200);
            expect(await kodeAktif(a.id)).toBeUndefined(); // dihabiskan
            const [habis] = await baris<{ n: string }>(`SELECT count(*)::text AS n FROM totp_activation_codes WHERE user_id = ${String(a.id)} AND consumed_at IS NOT NULL`);
            expect(habis?.n).toBe("1");
            const [enabled] = await audit(a.id, "TWO_FA_ENABLED");
            expect(JSON.parse(enabled?.nilai ?? "{}")).toEqual({ sesi_dicabut: 1, kode_aktivasi_dipakai: true });
            expect((await kirim("GET", "/locations/tree", bearer(lain.access))).status).toBe(401); // BR-070e

            // 2FA sudah aktif: mendaftar lagi ditolak, dan kode yang sama tak dapat dipakai untuk apa pun
            const lagi = await enroll(s.access, { kode_aktivasi: kode });
            expect(lagi.status).toBe(422);
            expect(lagi.json.error?.details?.[0]?.message).toBe("2FA sudah aktif pada akun ini.");
            expect(admin.id).not.toBe(a.id);
        });

        it("format toleran: huruf kecil dan tanpa tanda hubung diterima", async () => {
            const { h } = await siapkanAdmin();
            const a = await seed("R-01");
            const s = await masuk(a.email);
            const kode = (await terbitkan(h, a.id)).json.data?.["kode_aktivasi"] as string;
            expect((await enroll(s.access, { kode_aktivasi: kode.toLowerCase().replace("-", " ") })).status).toBe(200);
        });

        it("kode SALAH dihitung dan tercatat dengan sisa percobaan; kelima menghanguskan kode — TANPA mengunci akun", async () => {
            const { h } = await siapkanAdmin();
            const a = await seed("R-01");
            const s = await masuk(a.email);
            const kode = (await terbitkan(h, a.id)).json.data?.["kode_aktivasi"] as string;

            for (let i = 1; i <= 5; i++) {
                const r = await enroll(s.access, { kode_aktivasi: kodeSalah() });
                expect(r.status, `salah ke-${String(i)}`).toBe(422);
                expect(r.json.error?.details?.[0]?.message).toBe(PESAN_TIDAK_BERLAKU);
                expect((await kodeAktif(a.id))?.failed_attempts).toBe(i);
            }
            expect((await audit(a.id, "TWO_FA_ACTIVATION_CODE_REJECTED")).map((l) => `${l.alasan ?? ""}:${l.sisa ?? ""}`)).toEqual(["SALAH:4", "SALAH:3", "SALAH:2", "SALAH:1", "SALAH:0"]);

            // kode yang BENAR sesudah hangus tetap ditolak — jawabannya sama, sebab hanya di log (HANGUS)
            const benar = await enroll(s.access, { kode_aktivasi: kode });
            expect(benar.status).toBe(422);
            expect(benar.json.error?.details?.[0]?.message).toBe(PESAN_TIDAK_BERLAKU);
            expect((await audit(a.id, "TWO_FA_ACTIVATION_CODE_REJECTED")).at(-1)?.alasan).toBe("HANGUS");
            expect((await userState(a.id))?.enc).toBeNull();

            // akun TIDAK terkunci: login dengan password tetap berhasil, penghitung login tak tersentuh
            const u = await userState(a.id);
            expect(u).toMatchObject({ gagal: 0, kunci: null });
            expect((await kirim("POST", "/auth/login", {}, { email: a.email, password: PASSWORD, platform: "ANDROID" })).status).toBe(200);

            // Administrator menerbitkan kode baru → pendaftaran dapat dilanjutkan
            const baru = (await terbitkan(h, a.id)).json.data?.["kode_aktivasi"] as string;
            expect((await enroll(s.access, { kode_aktivasi: baru })).status).toBe(200);
        });

        it("kode yang tak dikirim atau berbentuk mustahil cocok DITOLAK tanpa menambah penghitung", async () => {
            const { h } = await siapkanAdmin();
            const a = await seed("R-03");
            const s = await masuk(a.email);
            await terbitkan(h, a.id);
            for (const body of [undefined, { kode_aktivasi: "abc" }, { kode_aktivasi: "ABCDE-FGHJK-M" }]) {
                expect((await enroll(s.access, body)).status).toBe(422);
            }
            expect((await kodeAktif(a.id))?.failed_attempts).toBe(0);
            expect((await audit(a.id, "TWO_FA_ACTIVATION_CODE_REJECTED")).map((l) => l.alasan)).toEqual(["TIDAK_DIKIRIM", "BENTUK_SALAH", "BENTUK_SALAH"]);
        });

        it("kedaluwarsa 72 jam menurut Clock: tepat sebelum masih berlaku, sesudahnya ditolak", async () => {
            const a = await seed("R-01");
            const kode = await terbitkanKodeAktivasiUji(getDb(), a.id, clock.now());
            clock.advance(72 * JAM - 1000);
            try {
                // sesi dibuat SESUDAH jam maju: access token hanya berumur 60 menit
                const s = await masuk(a.email);
                expect((await enroll(s.access, { kode_aktivasi: kode })).status).toBe(200);
                clock.advance(2000);
                const r = await konfirmasi(s.access, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"); // kadaluwarsa terdeteksi SEBELUM kode TOTP diperiksa
                expect(r.status).toBe(422);
                expect(r.json.error?.details?.[0]).toEqual({ field: "kode_aktivasi", message: PESAN_TIDAK_BERLAKU });
            } finally {
                clock.advance(-(72 * JAM + 1000));
            }
            const b = await seed("R-01");
            const sb = await masuk(b.email);
            const kb = await terbitkanKodeAktivasiUji(getDb(), b.id, clock.now(), { berlakuMs: 1000 });
            clock.advance(2000);
            try {
                expect((await enroll(sb.access, { kode_aktivasi: kb })).status).toBe(422);
                expect((await audit(b.id, "TWO_FA_ACTIVATION_CODE_REJECTED")).map((l) => l.alasan)).toEqual(["KEDALUWARSA"]);
            } finally {
                clock.advance(-2000);
            }
        });

        it("confirm HANYA untuk pendaftaran yang kodenya terverifikasi pada enroll: secret tertunda tanpa kode tak dapat dikonfirmasi", async () => {
            const a = await seed("R-01");
            const s = await masuk(a.email);
            // secret tertunda yang lahir tanpa kode (mis. sebelum aturan berlaku) + kode aktif yang BELUM terverifikasi
            const { secret } = await daftarkanTotpUji(getDb(), a.id, clock.now());
            await kueri(`UPDATE users SET totp_enabled_at = NULL WHERE id = ${String(a.id)}`);
            await terbitkanKodeAktivasiUji(getDb(), a.id, clock.now());
            const r = await kirim("POST", "/auth/2fa/enroll/confirm", bearer(s.access), { kode: kodeTotp(secret, langkahTotp(clock.now())) });
            expect(r.status).toBe(422);
            expect(r.json.error?.details?.[0]).toEqual({ field: "kode_aktivasi", message: PESAN_TIDAK_BERLAKU });
            expect((await userState(a.id))?.aktif).toBeNull();

            // tanpa baris kode sama sekali → sama
            const b = await seed("R-03");
            const sb = await masuk(b.email);
            const { secret: sb2 } = await daftarkanTotpUji(getDb(), b.id, clock.now());
            await kueri(`UPDATE users SET totp_enabled_at = NULL WHERE id = ${String(b.id)}`);
            const r2 = await kirim("POST", "/auth/2fa/enroll/confirm", bearer(sb.access), { kode: kodeTotp(sb2, langkahTotp(clock.now())) });
            expect(r2.status).toBe(422);
            expect((await userState(b.id))?.aktif).toBeNull();
        });

        it("kode DITERBITKAN ULANG antara enroll dan confirm: confirm ditolak (kode baru belum terverifikasi); enroll ulang lalu confirm berhasil", async () => {
            const { h } = await siapkanAdmin();
            const a = await seed("R-03");
            const s = await masuk(a.email);
            const k1 = (await terbitkan(h, a.id)).json.data?.["kode_aktivasi"] as string;
            const e = await enroll(s.access, { kode_aktivasi: k1 });
            const secret1 = (e.json.data as { secret: string }).secret;

            const k2 = (await terbitkan(h, a.id)).json.data?.["kode_aktivasi"] as string;
            expect((await konfirmasi(s.access, secret1)).status).toBe(422);
            expect((await userState(a.id))?.aktif).toBeNull();
            // kode LAMA tak lagi berlaku; yang baru berlaku
            expect((await enroll(s.access, { kode_aktivasi: k1 })).status).toBe(422);
            const e2 = await enroll(s.access, { kode_aktivasi: k2 });
            expect(e2.status).toBe(200);
            expect((await konfirmasi(s.access, (e2.json.data as { secret: string }).secret)).status).toBe(200);
        });

        it("role OPSIONAL (R-05) mendaftar dengan password saja; kode yang dikirim diabaikan dan tak dihitung", async () => {
            const a = await seed("R-05");
            const s = await masuk(a.email);
            const r = await enroll(s.access, { kode_aktivasi: kodeSalah() });
            expect(r.status).toBe(200);
            expect((await audit(a.id, "TWO_FA_ACTIVATION_CODE_REJECTED")).length).toBe(0);
            expect((await konfirmasi(s.access, (r.json.data as { secret: string }).secret)).status).toBe(200);
            const [tot] = await baris<{ n: string }>(`SELECT count(*)::text AS n FROM totp_activation_codes WHERE user_id = ${String(a.id)}`);
            expect(tot?.n).toBe("0");
        });
    });

    // ---------------------------------------------------------------------------------------------------
    describe("POST /users/{id}/2fa-activation-code — penerbitan oleh Administrator (FR-01.5 A7)", () => {
        it("sukses: kode tampil SEKALI, hash Argon2id 72 jam, penerbit + metode tercatat, TANPA nilai kode di log", async () => {
            const { akun: admin, h } = await siapkanAdmin();
            const a = await seed("R-03");
            const r = await terbitkan(h, a.id, { metode_verifikasi: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS" });
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            const data = r.json.data as { user_id: string; kode_aktivasi: string; berlaku_sampai: string };
            expect(data.user_id).toBe(String(a.id));
            expect(data.kode_aktivasi).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
            expect(new Date(data.berlaku_sampai).getTime()).toBe(clock.now().getTime() + 72 * JAM);

            const k = await kodeAktif(a.id);
            expect(k).toMatchObject({ issued_by: String(admin.id), metode: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS", verified_at: null, failed_attempts: 0 });
            expect(k?.berlaku_jam).toBe(72);
            expect(k?.hash).toMatch(/^\$argon2id\$/);
            expect(k?.hash).not.toContain(data.kode_aktivasi.replace("-", ""));

            const [log] = await audit(a.id, "TWO_FA_ACTIVATION_CODE_ISSUED");
            expect(log?.pelaku).toBe(String(admin.id));
            expect(JSON.parse(log?.nilai ?? "{}")).toMatchObject({ metode_verifikasi: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS" });
            expect(log?.teks).not.toContain(data.kode_aktivasi);
            expect(log?.teks).not.toContain(data.kode_aktivasi.replace("-", ""));
        });

        it("penerbitan ulang MENGGANTIKAN: hanya satu baris aktif; kode lama tak berlaku", async () => {
            const { h } = await siapkanAdmin();
            const a = await seed("R-01");
            const s = await masuk(a.email);
            const k1 = (await terbitkan(h, a.id)).json.data?.["kode_aktivasi"] as string;
            const k2 = (await terbitkan(h, a.id)).json.data?.["kode_aktivasi"] as string;
            expect(k2).not.toBe(k1);
            const [n] = await baris<{ n: string }>(`SELECT count(*)::text AS n FROM totp_activation_codes WHERE user_id = ${String(a.id)}`);
            expect(n?.n).toBe("1");
            expect((await enroll(s.access, { kode_aktivasi: k1 })).status).toBe(422);
            expect((await enroll(s.access, { kode_aktivasi: k2 })).status).toBe(200);
        });

        it("penolakan: akun sendiri, role opsional, sudah ber-2FA, nonaktif → 422; tidak ada → 404; metode wajib → 400", async () => {
            const { akun: admin, h } = await siapkanAdmin();
            const diri = await terbitkan(h, admin.id);
            expect(diri.status).toBe(422);
            expect(diri.json.error?.details?.[0]?.message).toBe("Tidak dapat menerbitkan kode aktivasi 2FA bagi akun sendiri.");

            const guru = await seed("R-05");
            expect((await terbitkan(h, guru.id)).json.error?.details?.[0]?.message).toBe("Kode aktivasi 2FA hanya untuk akun role yang wajib 2FA.");

            const sudah = await seed("R-03");
            await daftarkanTotpUji(getDb(), sudah.id, clock.now());
            expect((await terbitkan(h, sudah.id)).json.error?.details?.[0]?.message).toContain("2FA sudah aktif");

            const nonaktif = await seed("R-03", { status: "NONAKTIF" });
            expect((await terbitkan(h, nonaktif.id)).status).toBe(422);

            expect((await terbitkan(h, 999_999_999)).status).toBe(404);
            const ok = await seed("R-03");
            expect((await terbitkan(h, ok.id, {})).status).toBe(400);
            expect((await terbitkan(h, ok.id, { metode_verifikasi: "TEBAK" })).status).toBe(400);
            for (const u of [guru, sudah, nonaktif, ok]) expect(await kodeAktif(u.id)).toBeUndefined();
        });

        it("otorisasi: tanpa token 401; role tanpa user.reset_2fa 403; Administrator yang belum lolos 2FA 403 TWO_FACTOR_REQUIRED", async () => {
            const a = await seed("R-03");
            expect((await terbitkan({}, a.id)).status).toBe(401);

            const guru = await seed("R-05");
            const sg = await masuk(guru.email);
            const tolak = await terbitkan(bearer(sg.access), a.id);
            expect(tolak.status).toBe(403);
            expect(tolak.json.error?.code).toBe("INSUFFICIENT_PERMISSION");

            const adminPwd = await seed("R-01");
            const sp = await masuk(adminPwd.email); // hanya password: bukan 2FA
            const gerbang = await terbitkan(bearer(sp.access), a.id);
            expect(gerbang.status).toBe(403);
            expect(gerbang.json.error?.code).toBe("TWO_FACTOR_REQUIRED");
            expect(await kodeAktif(a.id)).toBeUndefined();
        });
    });

    // ---------------------------------------------------------------------------------------------------
    describe("POST /users/{id}/reset-2fa — reset oleh Administrator (FR-01.5 A3)", () => {
        it("role wajib: 2FA dilepas, kode cadangan dan kode aktivasi lama dihapus, SELURUH sesi dicabut, kode aktivasi BARU terbit; pendaftaran ulang bekerja", async () => {
            const { akun: admin, h } = await siapkanAdmin();
            const a = await seed("R-03");
            await daftarkanTotpUji(getDb(), a.id, clock.now());
            await kueri(`UPDATE users SET totp_last_step = 7 WHERE id = ${String(a.id)}`);
            await terbitkanKodeAktivasiUji(getDb(), a.id, clock.now()); // sisa kode lama yang belum terpakai
            // dua sesi target lewat alur sungguhan? akun ber-2FA login menantang; sesi ditanam lewat login sebelum 2FA aktif:
            await kueri(`UPDATE users SET totp_enabled_at = NULL, totp_secret_enc = NULL WHERE id = ${String(a.id)}`);
            const s1 = await masuk(a.email);
            const s2 = await masuk(a.email, "IOS");
            const { secret } = await daftarkanTotpUji(getDb(), a.id, clock.now());
            await kueri(`UPDATE users SET totp_last_step = 7 WHERE id = ${String(a.id)}`);
            expect(secret.length).toBe(20);

            const r = await reset(h, a.id);
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            const data = r.json.data as { user_id: string; sesi_dicabut: number; kode_aktivasi: string | null; berlaku_sampai: string | null };
            expect(data).toMatchObject({ user_id: String(a.id), sesi_dicabut: 2 });
            expect(data.kode_aktivasi).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
            expect(new Date(data.berlaku_sampai ?? "").getTime()).toBe(clock.now().getTime() + 72 * JAM);

            expect(await userState(a.id)).toMatchObject({ enc: null, aktif: null, langkah: null });
            expect(await baris(`SELECT 1 FROM totp_backup_codes WHERE user_id = ${String(a.id)}`)).toHaveLength(0);
            const [tot] = await baris<{ n: string }>(`SELECT count(*)::text AS n FROM totp_activation_codes WHERE user_id = ${String(a.id)}`);
            expect(tot?.n).toBe("1"); // yang lama dihapus, yang baru menggantikan
            expect((await kodeAktif(a.id))?.issued_by).toBe(String(admin.id));

            // seluruh sesi mati seketika (access DAN refresh), dengan alasan dan event per sesi
            expect((await kirim("GET", "/locations/tree", bearer(s1.access))).status).toBe(401);
            expect((await kirim("GET", "/locations/tree", bearer(s2.access))).status).toBe(401);
            expect((await kirim("POST", "/auth/refresh", {}, { refresh_token: s1.refresh })).status).toBe(401);
            const fam = (await keluarga(a.id)).filter((f) => f.revoke_reason === "two_fa_reset");
            expect(fam.map((f) => f.family_id).sort()).toEqual([klaim(s1.access).sid, klaim(s2.access).sid].sort());
            const ev = await baris<{ alasan: string }>(`SELECT payload->>'alasan' AS alasan FROM event_outbox WHERE event_name = 'SessionRevoked' AND aggregate_id = ${String(a.id)} AND payload->>'alasan' = 'two_fa_reset'`);
            expect(ev).toHaveLength(2);

            // AL-01: TWO_FA_RESET oleh Administrator, TANPA nilai kode
            const [log] = await audit(a.id, "TWO_FA_RESET");
            expect(log?.pelaku).toBe(String(admin.id));
            expect(JSON.parse(log?.nilai ?? "{}")).toEqual({ metode_verifikasi: METODE, sesi_dicabut: 2, kode_aktivasi_diterbitkan: true });
            expect(log?.teks).not.toContain(data.kode_aktivasi ?? "tidak-ada");
            expect((await audit(a.id, "TWO_FA_ACTIVATION_CODE_ISSUED")).length).toBeGreaterThanOrEqual(1);

            // pendaftaran ulang: login biasa (2FA lepas) → digerbang → enroll dengan kode baru → confirm → login menantang
            const baru = await masuk(a.email);
            expect((await kirim("GET", "/settings", bearer(baru.access))).json.error?.code).toBe("TWO_FACTOR_REQUIRED");
            expect((await enroll(baru.access)).status).toBe(422);
            const e = await enroll(baru.access, { kode_aktivasi: data.kode_aktivasi });
            expect(e.status).toBe(200);
            expect((await konfirmasi(baru.access, (e.json.data as { secret: string }).secret)).status).toBe(200);
            expect((await kirim("POST", "/auth/login", {}, { email: a.email, password: PASSWORD, platform: "ANDROID" })).json.data).toHaveProperty("requires_2fa", true);
        });

        it("role OPSIONAL: 2FA dilepas dan sesi dicabut, tetapi TIDAK ada kode aktivasi (kode_aktivasi null)", async () => {
            const { h } = await siapkanAdmin();
            const a = await seed("R-05");
            await daftarkanTotpUji(getDb(), a.id, clock.now());
            const r = await reset(h, a.id, { metode_verifikasi: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS" });
            expect(r.status).toBe(200);
            expect(r.json.data).toMatchObject({ sesi_dicabut: 0, kode_aktivasi: null, berlaku_sampai: null });
            expect((await userState(a.id))?.aktif).toBeNull();
            expect(await kodeAktif(a.id)).toBeUndefined();
            const [log] = await audit(a.id, "TWO_FA_RESET");
            expect(JSON.parse(log?.nilai ?? "{}")).toMatchObject({ kode_aktivasi_diterbitkan: false });
        });

        it("akun NONAKTIF ber-2FA: dapat direset (pembersihan) tanpa kode aktivasi; sisa kode lama dihapus", async () => {
            const { h } = await siapkanAdmin();
            const a = await seed("R-03");
            await daftarkanTotpUji(getDb(), a.id, clock.now());
            await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(a.id)}`);
            await terbitkanKodeAktivasiUji(getDb(), a.id, clock.now()); // sisa kode lama: harus ikut dihapus, bukan digantikan
            const r = await reset(h, a.id);
            expect(r.status).toBe(200);
            expect(r.json.data).toMatchObject({ kode_aktivasi: null });
            expect(await kodeAktif(a.id)).toBeUndefined();
        });

        it("penolakan: akun sendiri → 422 (tak ada perubahan); belum ber-2FA → 422; tidak ada → 404; metode wajib → 400", async () => {
            const { akun: admin, h } = await siapkanAdmin();
            const diri = await reset(h, admin.id);
            expect(diri.status).toBe(422);
            expect(diri.json.error?.details?.[0]?.message).toBe("Tidak dapat mereset 2FA akun sendiri; minta Administrator lain.");
            expect((await userState(admin.id))?.aktif).not.toBeNull(); // 2FA Administrator tak tersentuh
            expect((await keluarga(admin.id)).every((f) => f.revoked_at === null)).toBe(true);

            const kosong = await seed("R-03");
            expect((await reset(h, kosong.id)).json.error?.details?.[0]?.message).toBe("2FA belum aktif pada akun ini.");
            expect((await reset(h, 999_999_999)).status).toBe(404);
            const ber2fa = await seed("R-05");
            await daftarkanTotpUji(getDb(), ber2fa.id, clock.now());
            expect((await reset(h, ber2fa.id, {})).status).toBe(400);
            expect((await userState(ber2fa.id))?.aktif).not.toBeNull();
        });

        it("otorisasi: tanpa token 401; role tanpa user.reset_2fa 403; Administrator yang belum lolos 2FA 403 TWO_FACTOR_REQUIRED", async () => {
            const a = await seed("R-05");
            await daftarkanTotpUji(getDb(), a.id, clock.now());
            expect((await reset({}, a.id)).status).toBe(401);
            const guru = await seed("R-05");
            const sg = await masuk(guru.email);
            expect((await reset(bearer(sg.access), a.id)).json.error?.code).toBe("INSUFFICIENT_PERMISSION");
            const adminPwd = await seed("R-01");
            const sp = await masuk(adminPwd.email);
            expect((await reset(bearer(sp.access), a.id)).json.error?.code).toBe("TWO_FACTOR_REQUIRED");
            expect((await userState(a.id))?.aktif).not.toBeNull();
        });
    });
});
