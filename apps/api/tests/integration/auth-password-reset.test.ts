// PR-02-05 — reset password administratif (FR-01.3) terhadap PostgreSQL DAN Redis nyata, lewat HTTP penuh
// pada `createApp()`: permintaan publik (`forgot`), antrean Administrator (P-67), penerbitan password
// sementara yang tampil SATU kali, penolakan, reset langsung dari detail pengguna (P-63), dan kedaluwarsa
// 72 jam yang ditegakkan saat login.
//
// Yang dibuktikan: jawaban `forgot` seragam apa pun keadaan emailnya; metode verifikasi wajib sebelum
// penerbitan; password sementara tidak tersimpan di mana pun (hanya hash-nya) dan tidak masuk log maupun
// event; penerbitan mencabut seluruh sesi dan membuka kunci login; password sementara mati setelah 72 jam.

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
import { checkPasswordPolicy, hashPassword, verifyPassword } from "../../src/shared/security/index.js";
import { kunciUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined;
const T0 = new Date("2026-09-19T03:00:00Z");
const JAM = 3_600_000;
const PASSWORD = "Sandi-Uji-Rahasia-1";
const SALAH = "password-yang-salah";
const METODE = "KARTU_IDENTITAS_TATAP_MUKA";

interface Balasan {
    readonly status: number;
    readonly teks: string;
    readonly json: {
        success?: boolean;
        data?: unknown;
        meta?: { total?: number; page?: number; per_page?: number; total_pages?: number };
        error?: { code: string; message: string; details?: unknown };
    };
    readonly headers: Headers;
}

interface Permintaan {
    id: string;
    pemohon: { id: string; nama: string; email: string; nip_nis: string; role_kode: string };
    status: string;
    metode_verifikasi: string | null;
    diminta_pada: string;
    diproses_oleh: { id: string; nama: string } | null;
    diproses_pada: string | null;
    kedaluwarsa_pada: string | null;
    alasan_penolakan: string | null;
}

type Baris = {
    id: string;
    status: string;
    metode_verifikasi: string | null;
    diproses_oleh: string | null;
    kedaluwarsa_pada: string | null;
    diminta_pada: string;
};

const tanpaRequestId = (b: Balasan): string => b.teks.replace(/"request_id":"[^"]*"/, '"request_id":"-"');

describe.skipIf(!ADA)("PR-02-05 — reset password administratif (PostgreSQL + Redis nyata)", () => {
    let redis: Redis;
    let clock: FixedClock;
    let url: string;
    let server: Server;
    let hashSandi: string;
    const idPengguna: number[] = [];
    const ipDipakai: string[] = [];
    const AWALAN_IP = `10.${String(1 + Math.floor(Math.random() * 250))}`;
    let urutIp = 0;

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
            await kueri(
                `DELETE FROM event_outbox WHERE event_name IN ('PasswordResetRequested', 'PasswordResetIssued', 'SessionRevoked') AND aggregate_id IN (${daftar})`,
            );
            await kueri(`DELETE FROM password_reset_requests WHERE user_id IN (${daftar}) OR diproses_oleh IN (${daftar})`);
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

    const ipBaru = (): string => {
        urutIp += 1;
        const ip = `${AWALAN_IP}.${String(Math.floor(urutIp / 250))}.${String(1 + (urutIp % 250))}`;
        ipDipakai.push(ip);
        return ip;
    };

    async function seed(opsi: { role?: string; status?: "AKTIF" | "NONAKTIF"; wajibGanti?: boolean } = {}): Promise<{ id: number; email: string; nama: string }> {
        const email = `reset-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
        const nama = "Uji Reset";
        const [baris] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('${nama}', '${email}', '${hashSandi}', 'NIPRESET${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = '${opsi.role ?? "R-05"}'), '${opsi.status ?? "AKTIF"}', ${String(opsi.wajibGanti ?? false)})
            RETURNING id::text`);
        if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
        const id = Number(baris.id);
        idPengguna.push(id);
        return { id, email, nama };
    }

    async function kirim(metode: string, path: string, headers: Record<string, string> = {}, body?: unknown): Promise<Balasan> {
        const res = await fetch(`${url}${path}`, {
            method: metode,
            headers: { "content-type": "application/json", "x-forwarded-for": ipBaru(), ...headers },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const teks = await res.text();
        return { status: res.status, teks, json: teks === "" ? {} : (JSON.parse(teks) as Balasan["json"]), headers: res.headers };
    }

    const login = (email: string, password = PASSWORD): Promise<Balasan> =>
        kirim("POST", "/auth/login", {}, { email, password, platform: "ANDROID" });
    const bearerDari = (r: Balasan): Record<string, string> => ({
        authorization: `Bearer ${(r.json.data as { tokens: { access_token: string } }).tokens.access_token}`,
    });
    async function masuk(email: string): Promise<Record<string, string>> {
        const r = await login(email);
        expect(r.status, "login").toBe(200);
        return bearerDari(r);
    }
    /** Administrator yang sudah login; token 60 menit, jadi uji yang memajukan jam memanggil ulang. */
    async function siapkanAdmin(): Promise<{ id: number; auth: Record<string, string> }> {
        const a = await seed({ role: "R-01" });
        return { id: a.id, auth: await masuk(a.email) };
    }

    const forgot = (email: string): Promise<Balasan> => kirim("POST", "/auth/password/forgot", {}, { email });
    const antre = (auth: Record<string, string>, query = ""): Promise<Balasan> => kirim("GET", `/auth/password/requests${query}`, auth);
    // Argumen opsional dibedakan dari `undefined` yang SENGAJA (uji "tanpa metode/alasan"): parameter bawaan JS
    // akan mengganti `undefined` dengan nilai sah dan membuat uji penolakan lolos diam-diam.
    const terbitkan = (auth: Record<string, string>, id: string, ...opsi: [unknown?]): Promise<Balasan> => {
        const metode = opsi.length === 0 ? METODE : opsi[0];
        return kirim("POST", `/auth/password/requests/${id}/issue`, auth, metode === undefined ? {} : { metode_verifikasi: metode });
    };
    const tolak = (auth: Record<string, string>, id: string, ...opsi: [unknown?]): Promise<Balasan> => {
        const alasan = opsi.length === 0 ? "Identitas tidak dapat diverifikasi" : opsi[0];
        return kirim("POST", `/auth/password/requests/${id}/reject`, auth, alasan === undefined ? {} : { alasan });
    };
    const passwordDari = (r: Balasan): string => (r.json.data as { password_sementara: string }).password_sementara;

    const barisPermintaan = (userId: number) =>
        kueri<Baris>(`
            SELECT id::text, status::text, metode_verifikasi::text, diproses_oleh::text, kedaluwarsa_pada::text, diminta_pada::text
            FROM password_reset_requests WHERE user_id = ${String(userId)} ORDER BY id`);
    const idPermintaanBaru = async (email: string, userId: number): Promise<string> => {
        expect((await forgot(email)).status).toBe(202);
        const daftar = await barisPermintaan(userId);
        const id = daftar[daftar.length - 1]?.id;
        if (id === undefined) throw new Error("permintaan tidak terbentuk");
        return id;
    };
    const jumlahAudit = async (id: number, aksi: string): Promise<number> =>
        Number(
            (await kueri<{ n: string }>(
                `SELECT count(*)::text AS n FROM activity_logs WHERE modul = 'm01-auth' AND aksi = '${aksi}' AND entitas_id = ${String(id)}`,
            ))[0]?.n,
        );
    const passwordHash = async (id: number): Promise<string> =>
        (await kueri<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ${String(id)}`))[0]?.password_hash ?? "";

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/password/forgot — jawaban seragam (FR-01.3 A1)", () => {
        it("email terdaftar, tak terdaftar, akun nonaktif, dan permintaan melebihi batas → 202 IDENTIK byte demi byte (selain request_id)", async () => {
            const ada = await seed();
            const nonaktif = await seed({ status: "NONAKTIF" });
            const jenuh = await seed();
            for (let i = 0; i < 3; i += 1) await forgot(jenuh.email);

            const hasil = [
                await forgot(ada.email),
                await forgot(`tidak-ada-${randomUUID().slice(0, 8)}@sekolah.sch.id`),
                await forgot(nonaktif.email),
                await forgot(jenuh.email), // ke-4: melebihi batas
            ];
            for (const r of hasil) {
                expect(r.status).toBe(202);
                expect(r.json.data).toEqual({ message: "Permintaan diterima" });
                expect(r.headers.get("retry-after")).toBeNull();
            }
            expect(new Set(hasil.map(tanpaRequestId)).size).toBe(1);
        });

        it("hanya akun AKTIF yang terdaftar yang membentuk permintaan MENUNGGU; email tak dikenal dan akun nonaktif tidak", async () => {
            const ada = await seed();
            const nonaktif = await seed({ status: "NONAKTIF" });
            const [sebelum] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM password_reset_requests");
            await forgot(ada.email);
            await forgot(nonaktif.email);
            await forgot(`tidak-ada-${randomUUID().slice(0, 8)}@sekolah.sch.id`);
            const [sesudah] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM password_reset_requests");
            expect(Number(sesudah?.n) - Number(sebelum?.n)).toBe(1);
            expect((await barisPermintaan(ada.id)).map((b) => b.status)).toEqual(["MENUNGGU"]);
            expect(await barisPermintaan(nonaktif.id)).toEqual([]);
        });

        it("email dicocokkan tanpa memandang huruf besar-kecil dan spasi tepi", async () => {
            const { id, email } = await seed();
            expect((await forgot(`  ${email.toUpperCase()}  `)).status).toBe(202);
            expect(await barisPermintaan(id)).toHaveLength(1);
        });

        it("tanpa email → 400 INVALID_REQUEST (bentuk permintaan, bukan keberadaan akun)", async () => {
            const r = await kirim("POST", "/auth/password/forgot", {}, {});
            expect(r.status).toBe(400);
            expect(r.json.error?.code).toBe("INVALID_REQUEST");
        });

        it("email TIDAK PERNAH berubah menjadi sesi atau token: jawaban tanpa Set-Cookie dan tanpa token", async () => {
            const { email } = await seed();
            const r = await forgot(email);
            expect(r.headers.getSetCookie()).toEqual([]);
            expect(r.teks).not.toMatch(/token|password_sementara/i);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("audit dan event permintaan (AL-01, AL-02, AL-07, NFR-S-16)", () => {
        it("permintaan sukses: PASSWORD_RESET_REQUESTED tanpa pelaku, sasaran pada entitas, IP dan perangkat; event PasswordResetRequested terbit (NT-37)", async () => {
            const { id, email } = await seed();
            const ip = ipBaru();
            const r = await kirim("POST", "/auth/password/forgot", { "x-forwarded-for": ip, "user-agent": "SIGM4-Test/1.0" }, { email });
            expect(r.status).toBe(202);

            const [log] = await kueri<{ user_id: string | null; hasil: string; host: string; ua: string; permintaan: string; teks: string }>(`
                SELECT user_id::text, hasil::text, host(ip) AS host, user_agent AS ua, nilai_sesudah->>'permintaan_id' AS permintaan, activity_logs::text AS teks
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'PASSWORD_RESET_REQUESTED' AND entitas_id = ${String(id)}`);
            const [permintaan] = await barisPermintaan(id);
            expect(log).toMatchObject({ user_id: null, hasil: "SUKSES", host: ip, ua: "SIGM4-Test/1.0", permintaan: permintaan?.id });
            expect(log?.teks).not.toContain(email);

            const [event] = await kueri<{ aggregate_type: string; payload: { permintaan_id: string; user_id: string } }>(`
                SELECT aggregate_type, payload FROM event_outbox WHERE event_name = 'PasswordResetRequested' AND aggregate_id = ${String(id)}`);
            expect(event).toEqual({ aggregate_type: "user", payload: { permintaan_id: permintaan?.id, user_id: String(id) } });
        });

        it("email tak dikenal dan akun nonaktif: dicatat GAGAL dengan alasan internal; email yang dicoba tidak tersimpan", async () => {
            const nonaktif = await seed({ status: "NONAKTIF" });
            const asing = `tidak-ada-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
            const ipAsing = ipBaru();
            await kirim("POST", "/auth/password/forgot", { "x-forwarded-for": ipAsing }, { email: asing });
            await forgot(nonaktif.email);

            const [log] = await kueri<{ user_id: string | null; entitas: string | null; hasil: string; alasan: string; teks: string }>(`
                SELECT user_id::text, entitas, hasil::text, nilai_sesudah->>'alasan' AS alasan, activity_logs::text AS teks
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'PASSWORD_RESET_REQUESTED' AND host(ip) = '${ipAsing}'`);
            expect(log).toMatchObject({ user_id: null, entitas: null, hasil: "GAGAL", alasan: "EMAIL_TIDAK_DIKENAL" });
            expect(log?.teks).not.toContain(asing);

            const [logNonaktif] = await kueri<{ hasil: string; alasan: string }>(`
                SELECT hasil::text, nilai_sesudah->>'alasan' AS alasan FROM activity_logs
                WHERE modul = 'm01-auth' AND aksi = 'PASSWORD_RESET_REQUESTED' AND entitas_id = ${String(nonaktif.id)}`);
            expect(logNonaktif).toEqual({ hasil: "GAGAL", alasan: "AKUN_NONAKTIF" });
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("batas 3 permintaan per akun per 24 jam (FR-01.3 A4)", () => {
        it("permintaan ke-4 tetap dijawab netral tetapi TIDAK dibuat; dicatat sebagai anomali (GAGAL, MELEBIHI_BATAS)", async () => {
            const { id, email } = await seed();
            for (let i = 0; i < 4; i += 1) expect((await forgot(email)).status).toBe(202);
            expect(await barisPermintaan(id)).toHaveLength(3);

            const [anomali] = await kueri<{ hasil: string; alasan: string; jumlah: string }>(`
                SELECT hasil::text, nilai_sesudah->>'alasan' AS alasan, nilai_sesudah->>'jumlah_24_jam' AS jumlah
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'PASSWORD_RESET_REQUESTED' AND entitas_id = ${String(id)} AND hasil = 'GAGAL'`);
            expect(anomali).toEqual({ hasil: "GAGAL", alasan: "MELEBIHI_BATAS", jumlah: "3" });
            expect(await jumlahAudit(id, "PASSWORD_RESET_REQUESTED")).toBe(4);
        });

        it("jendela 24 jam: sesudah 24 jam dari permintaan pertama, permintaan baru diterima lagi", async () => {
            const { id, email } = await seed();
            for (let i = 0; i < 3; i += 1) await forgot(email);
            clock.advance(24 * JAM + 1000);
            try {
                await forgot(email);
                expect(await barisPermintaan(id)).toHaveLength(4);
            } finally {
                clock.advance(-(24 * JAM + 1000));
            }
        });

        it("permintaan SERENTAK: batas tetap 3 (baris pengguna dikunci), bukan tiga ditambah yang berbalapan", async () => {
            const { id, email } = await seed();
            const hasil = await Promise.all(Array.from({ length: 8 }, () => forgot(email)));
            expect(hasil.every((h) => h.status === 202)).toBe(true);
            expect(await barisPermintaan(id)).toHaveLength(3);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("GET /auth/password/requests — antrean Administrator (P-67)", () => {
        it("tanpa token → 401; tanpa user.reset_password (Guru) → 403 INSUFFICIENT_PERMISSION", async () => {
            const guru = await seed({ role: "R-05" });
            expect((await kirim("GET", "/auth/password/requests")).status).toBe(401);
            const r = await antre(await masuk(guru.email));
            expect(r.status).toBe(403);
            expect(r.json.error?.code).toBe("INSUFFICIENT_PERMISSION");
        });

        it("memuat identitas pemohon untuk verifikasi luring; tidak boleh di-cache; paginasi dan filter status", async () => {
            const admin = await siapkanAdmin();
            const a = await seed();
            const b = await seed();
            const idA = await idPermintaanBaru(a.email, a.id);
            await idPermintaanBaru(b.email, b.id);
            expect((await terbitkan(admin.auth, idA)).status).toBe(200);

            const semua = await antre(admin.auth, "?per_page=100");
            expect(semua.status).toBe(200);
            expect(semua.headers.get("cache-control")).toBe("no-store");
            const rows = semua.json.data as Permintaan[];
            const dariA = rows.find((r) => r.id === idA);
            expect(dariA).toMatchObject({
                status: "DITERBITKAN",
                metode_verifikasi: METODE,
                pemohon: { id: String(a.id), nama: a.nama, email: a.email, role_kode: "R-05" },
                diproses_oleh: { id: String(admin.id) },
            });
            expect(dariA?.pemohon.nip_nis).toMatch(/^NIPRESET/);

            const menunggu = (await antre(admin.auth, "?per_page=100&filter[status]=MENUNGGU")).json.data as Permintaan[];
            expect(menunggu.every((r) => r.status === "MENUNGGU")).toBe(true);
            expect(menunggu.some((r) => r.pemohon.id === String(b.id))).toBe(true);
            expect(menunggu.some((r) => r.id === idA)).toBe(false);

            const halaman = await antre(admin.auth, "?per_page=1&page=1");
            expect((halaman.json.data as unknown[]).length).toBe(1);
            expect(halaman.json.meta?.per_page).toBe(1);
            expect(halaman.json.meta?.total).toBeGreaterThanOrEqual(2);
        });

        it("status efektif: penerbitan yang lewat 72 jam tampil KEDALUWARSA (dan tersaring sebagai itu) meski barisnya belum disentuh", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            await terbitkan(admin.auth, id);
            clock.advance(72 * JAM + 1000);
            try {
                const auth = await masuk((await kueri<{ email: string }>(`SELECT email FROM users WHERE id = ${String(admin.id)}`))[0]?.email ?? "");
                const tampil = (await antre(auth, "?per_page=100")).json.data as Permintaan[];
                expect(tampil.find((r) => r.id === id)?.status).toBe("KEDALUWARSA");
                expect(((await antre(auth, "?per_page=100&filter[status]=DITERBITKAN")).json.data as Permintaan[]).some((r) => r.id === id)).toBe(false);
                expect(((await antre(auth, "?per_page=100&filter[status]=KEDALUWARSA")).json.data as Permintaan[]).some((r) => r.id === id)).toBe(true);
                expect((await barisPermintaan(u.id))[0]?.status).toBe("DITERBITKAN"); // barisnya sendiri belum disentuh
            } finally {
                clock.advance(-(72 * JAM + 1000));
            }
        });

        it("status tak dikenal pada filter → 400", async () => {
            const admin = await siapkanAdmin();
            expect((await antre(admin.auth, "?filter[status]=BUKAN")).status).toBe(400);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/password/requests/{id}/issue — penerbitan password sementara (FR-01.3 langkah 3–4)", () => {
        it("metode verifikasi WAJIB dipilih sebelum penerbitan: tanpa/tak sah → 400 dan tidak ada yang berubah", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const hashAwal = await passwordHash(u.id);

            for (const metode of [undefined, "", "LISAN", 5]) {
                const r = await terbitkan(admin.auth, id, metode);
                expect(r.status, JSON.stringify(metode)).toBe(400);
                expect(r.json.error?.code).toBe("INVALID_REQUEST");
            }
            expect((await barisPermintaan(u.id))[0]?.status).toBe("MENUNGGU");
            expect(await passwordHash(u.id)).toBe(hashAwal);
        });

        it("sukses: password sementara lolos kebijakan NFR-S-03a, tampil di respons tanpa cache; permintaan DITERBITKAN + metode + pelaku + 72 jam", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);

            const r = await terbitkan(admin.auth, id, "KONFIRMASI_ATASAN_ATAU_WALI_KELAS");
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            const sementara = passwordDari(r);
            const [nipNis] = await kueri<{ nip_nis: string }>(`SELECT nip_nis FROM users WHERE id = ${String(u.id)}`);
            expect(checkPasswordPolicy(sementara, { nama: u.nama, email: u.email, nipNis: nipNis?.nip_nis ?? "" })).toEqual([]);
            expect(sementara).toHaveLength(16);

            const [baris] = await barisPermintaan(u.id);
            expect(baris).toMatchObject({ status: "DITERBITKAN", metode_verifikasi: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS", diproses_oleh: String(admin.id) });
            expect(new Date(baris?.kedaluwarsa_pada ?? "").getTime()).toBe(T0.getTime() + 72 * JAM);
            const tampil = (r.json.data as { permintaan: Permintaan }).permintaan;
            expect(tampil).toMatchObject({ id, status: "DITERBITKAN", metode_verifikasi: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS" });
        });

        it("password sementara TIDAK tersimpan di mana pun: hanya hash-nya; tak ada di log, event, baris permintaan, maupun antrean", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const sementara = passwordDari(await terbitkan(admin.auth, id));

            const hash = await passwordHash(u.id);
            expect(hash).not.toContain(sementara);
            expect(await verifyPassword(hash, sementara)).toBe(true);
            expect(await verifyPassword(hash, PASSWORD)).toBe(false);

            // Pencarian dilakukan di sisi uji, bukan dengan menyisipkan nilai dari respons HTTP ke dalam SQL.
            for (const [nama, sql] of [
                ["activity_logs", "SELECT activity_logs::text AS teks FROM activity_logs WHERE modul = 'm01-auth'"],
                ["event_outbox", "SELECT event_outbox::text AS teks FROM event_outbox"],
                ["password_reset_requests", "SELECT password_reset_requests::text AS teks FROM password_reset_requests"],
            ] as const) {
                const baris = await kueri<{ teks: string }>(sql);
                expect(baris.length, `${nama} tidak kosong — pencarian ini benar-benar memeriksa sesuatu`).toBeGreaterThan(0);
                expect(baris.filter((b) => b.teks.includes(sementara)), nama).toEqual([]);
            }
            // Tak dapat dibaca ulang: antrean dan penerbitan ulang tidak mengembalikannya.
            expect((await antre(admin.auth, "?per_page=100")).teks).not.toContain(sementara);
        });

        it("password lama tidak berlaku lagi dan must_change_password menyala; login dengan yang sementara berhasil tetapi menu lain diblokir (FR-01.3 langkah 6)", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const sementara = passwordDari(await terbitkan(admin.auth, id));

            expect((await login(u.email, PASSWORD)).status).toBe(401);
            const masukSementara = await login(u.email, sementara);
            expect(masukSementara.status).toBe(200);
            expect((masukSementara.json.data as { user: { must_change_password: boolean } }).user.must_change_password).toBe(true);
            const blokir = await kirim("GET", "/settings", bearerDari(masukSementara));
            expect(blokir.status).toBe(403);
            expect(blokir.json.error?.code).toBe("PASSWORD_CHANGE_REQUIRED");
        });

        it("MENCABUT seluruh sesi pengguna (access dan refresh mati seketika) dan menerbitkan SessionRevoked per sesi dengan alasan password_reset", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const s1 = await login(u.email);
            const s2 = await login(u.email);
            const tokens = [s1, s2].map((s) => (s.json.data as { tokens: { access_token: string; refresh_token: string } }).tokens);
            const id = await idPermintaanBaru(u.email, u.id);

            expect((await kirim("GET", "/settings", bearerDari(s1))).status).toBe(403); // Guru: tanpa setting.view — tetapi sesinya hidup (bukan 401)
            await terbitkan(admin.auth, id);

            for (const s of [s1, s2]) expect((await kirim("GET", "/auth/sessions", bearerDari(s))).status).toBe(401);
            for (const t of tokens) {
                expect((await kirim("POST", "/auth/refresh", {}, { refresh_token: t.refresh_token })).status).toBe(401);
            }
            const baris = await kueri<{ revoke_reason: string }>(`SELECT revoke_reason FROM refresh_tokens WHERE user_id = ${String(u.id)}`);
            expect(baris.every((b) => b.revoke_reason === "password_reset" || b.revoke_reason === null)).toBe(true);

            const events = await kueri<{ payload: { alasan: string; user_id: string } }>(`
                SELECT payload FROM event_outbox WHERE event_name = 'SessionRevoked' AND aggregate_id = ${String(u.id)}`);
            expect(events).toHaveLength(2);
            expect(events.every((e) => e.payload.alasan === "password_reset" && e.payload.user_id === String(u.id))).toBe(true);
        });

        it("MEMBUKA kunci login: akun yang terkunci lima kali gagal dapat masuk dengan password sementara, penghitung dihapus", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            for (let i = 0; i < 5; i += 1) await login(u.email, SALAH);
            expect((await login(u.email)).status, "terkunci").toBe(401);
            const id = await idPermintaanBaru(u.email, u.id);
            const sementara = passwordDari(await terbitkan(admin.auth, id));

            const [status] = await kueri<{ n: number; kunci: string | null; jendela: string | null }>(`
                SELECT failed_login_count AS n, locked_until::text AS kunci, failed_login_window_start::text AS jendela FROM users WHERE id = ${String(u.id)}`);
            expect(status).toEqual({ n: 0, kunci: null, jendela: null });
            expect((await login(u.email, sementara)).status).toBe(200);
        });

        it("AL-01/AL-05: PASSWORD_RESET_ISSUED memuat pelaku, sasaran, metode, jumlah sesi; event PasswordResetIssued terbit (NT-38) tanpa password", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            await login(u.email);
            const id = await idPermintaanBaru(u.email, u.id);
            const r = await kirim("POST", `/auth/password/requests/${id}/issue`, { ...admin.auth, "user-agent": "SIGM4-Admin/1.0", "x-forwarded-for": "198.51.100.77" }, { metode_verifikasi: METODE });
            expect(r.status).toBe(200);

            const [log] = await kueri<{ user_id: string; hasil: string; host: string; ua: string; metode: string; sesi: string; permintaan: string }>(`
                SELECT user_id::text, hasil::text, host(ip) AS host, user_agent AS ua,
                       nilai_sesudah->>'metode_verifikasi' AS metode, nilai_sesudah->>'sesi_dicabut' AS sesi, nilai_sesudah->>'permintaan_id' AS permintaan
                FROM activity_logs WHERE modul = 'm01-auth' AND aksi = 'PASSWORD_RESET_ISSUED' AND entitas_id = ${String(u.id)}`);
            expect(log).toEqual({ user_id: String(admin.id), hasil: "SUKSES", host: "198.51.100.77", ua: "SIGM4-Admin/1.0", metode: METODE, sesi: "1", permintaan: id });

            const [event] = await kueri<{ aggregate_type: string; payload: Record<string, string> }>(`
                SELECT aggregate_type, payload FROM event_outbox WHERE event_name = 'PasswordResetIssued' AND aggregate_id = ${String(u.id)}`);
            expect(event?.aggregate_type).toBe("user");
            expect(Object.keys(event?.payload ?? {}).sort()).toEqual(["kedaluwarsa_pada", "oleh", "permintaan_id", "user_id"]);
            expect(event?.payload).toMatchObject({ permintaan_id: id, user_id: String(u.id), oleh: String(admin.id) });
        });

        it("permintaan yang sudah diproses tidak dapat diterbitkan lagi (422); id tak ada → 404; akun yang kini nonaktif → 422 tanpa mengganti password", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            expect((await terbitkan(admin.auth, id)).status).toBe(200);
            const lagi = await terbitkan(admin.auth, id);
            expect(lagi.status).toBe(422);
            expect(lagi.json.error?.code).toBe("VALIDATION_ERROR");
            expect((await terbitkan(admin.auth, "999999999")).status).toBe(404);

            const n = await seed();
            const idN = await idPermintaanBaru(n.email, n.id);
            await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${String(n.id)}`);
            const hashAwal = await passwordHash(n.id);
            const r = await terbitkan(admin.auth, idN);
            expect(r.status).toBe(422);
            expect(await passwordHash(n.id)).toBe(hashAwal);
            expect((await barisPermintaan(n.id))[0]?.status).toBe("MENUNGGU");
        });

        it("penerbitan baru menggantikan yang lama: permintaan sebelumnya KEDALUWARSA dan password sementara pertama tak berlaku lagi", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id1 = await idPermintaanBaru(u.email, u.id);
            const pertama = passwordDari(await terbitkan(admin.auth, id1));
            const id2 = await idPermintaanBaru(u.email, u.id);
            const kedua = passwordDari(await terbitkan(admin.auth, id2));

            expect((await barisPermintaan(u.id)).map((b) => b.status)).toEqual(["KEDALUWARSA", "DITERBITKAN"]);
            expect((await login(u.email, pertama)).status).toBe(401);
            expect((await login(u.email, kedua)).status).toBe(200);
        });

        it("dua penerbitan SERENTAK atas satu permintaan: satu berhasil, satu 422; hanya satu password yang berlaku dan satu entri log", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const [x, y] = await Promise.all([terbitkan(admin.auth, id), terbitkan(admin.auth, id)]);
            expect([x.status, y.status].sort()).toEqual([200, 422]);
            const menang = x.status === 200 ? x : y;
            expect(await jumlahAudit(u.id, "PASSWORD_RESET_ISSUED")).toBe(1);
            expect((await login(u.email, passwordDari(menang))).status).toBe(200);
        });

        it("tanpa token → 401; Guru (tanpa user.reset_password) → 403 dan password tak berubah", async () => {
            const guru = await seed();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const hashAwal = await passwordHash(u.id);
            expect((await kirim("POST", `/auth/password/requests/${id}/issue`, {}, { metode_verifikasi: METODE })).status).toBe(401);
            const r = await terbitkan(await masuk(guru.email), id);
            expect(r.status).toBe(403);
            expect(await passwordHash(u.id)).toBe(hashAwal);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /auth/password/requests/{id}/reject — penolakan (FR-01.3 A2)", () => {
        it("alasan wajib (400); sukses: DITOLAK beserta alasan dan pemroses; password tak berubah; tercatat PASSWORD_RESET_REJECTED", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const hashAwal = await passwordHash(u.id);

            for (const alasan of [undefined, "", "   "]) expect((await tolak(admin.auth, id, alasan)).status, JSON.stringify(alasan)).toBe(400);
            expect((await barisPermintaan(u.id))[0]?.status).toBe("MENUNGGU");

            const r = await tolak(admin.auth, id, "Tidak dapat menunjukkan kartu identitas");
            expect(r.status).toBe(200);
            expect(r.json.data as Permintaan).toMatchObject({
                id,
                status: "DITOLAK",
                alasan_penolakan: "Tidak dapat menunjukkan kartu identitas",
                diproses_oleh: { id: String(admin.id) },
                metode_verifikasi: null,
                kedaluwarsa_pada: null,
            });
            expect(await passwordHash(u.id)).toBe(hashAwal);
            expect((await login(u.email)).status).toBe(200); // password lama tetap berlaku

            const [log] = await kueri<{ user_id: string; alasan: string; hasil: string }>(`
                SELECT user_id::text, nilai_sesudah->>'alasan' AS alasan, hasil::text FROM activity_logs
                WHERE modul = 'm01-auth' AND aksi = 'PASSWORD_RESET_REJECTED' AND entitas_id = ${String(u.id)}`);
            expect(log).toEqual({ user_id: String(admin.id), alasan: "Tidak dapat menunjukkan kartu identitas", hasil: "SUKSES" });
        });

        it("yang sudah DITOLAK atau DITERBITKAN tidak dapat ditolak/diterbitkan lagi (422); id tak ada → 404; tanpa token 401, Guru 403", async () => {
            const admin = await siapkanAdmin();
            const a = await seed();
            const b = await seed();
            const idA = await idPermintaanBaru(a.email, a.id);
            const idB = await idPermintaanBaru(b.email, b.id);
            expect((await tolak(admin.auth, idA)).status).toBe(200);
            expect((await tolak(admin.auth, idA)).status).toBe(422);
            expect((await terbitkan(admin.auth, idA)).status).toBe(422);
            expect((await terbitkan(admin.auth, idB)).status).toBe(200);
            expect((await tolak(admin.auth, idB)).status).toBe(422);
            expect((await tolak(admin.auth, "999999999")).status).toBe(404);
            expect((await kirim("POST", `/auth/password/requests/${idA}/reject`, {}, { alasan: "x" })).status).toBe(401);
            expect((await tolak(await masuk((await seed()).email), idA)).status).toBe(403);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("kedaluwarsa 72 jam ditegakkan saat login (FR-01.3 A3)", () => {
        it("tepat sebelum 72 jam password sementara masih berlaku; sesudahnya 401 SERAGAM, permintaan ditutup KEDALUWARSA, tidak menambah penghitung kunci", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const sementara = passwordDari(await terbitkan(admin.auth, id));

            clock.advance(72 * JAM - 1000);
            try {
                expect((await login(u.email, sementara)).status).toBe(200);
                clock.advance(2000);
                const kedaluwarsa = await login(u.email, sementara);
                const salah = await login(u.email, SALAH);
                expect(kedaluwarsa.status).toBe(401);
                expect(tanpaRequestId(kedaluwarsa)).toBe(tanpaRequestId(salah));
            } finally {
                clock.advance(-(72 * JAM + 1000));
            }
            expect((await barisPermintaan(u.id))[0]?.status).toBe("KEDALUWARSA");
            const [n] = await kueri<{ n: number }>(`SELECT failed_login_count AS n FROM users WHERE id = ${String(u.id)}`);
            expect(n?.n).toBe(1); // hanya SALAH yang menghitung; yang kedaluwarsa tidak
            const [log] = await kueri<{ alasan: string; hasil: string }>(`
                SELECT nilai_sesudah->>'alasan' AS alasan, hasil::text FROM activity_logs
                WHERE modul = 'm01-auth' AND aksi = 'LOGIN_FAILED' AND entitas_id = ${String(u.id)} AND nilai_sesudah->>'alasan' = 'PASSWORD_SEMENTARA_KEDALUWARSA'`);
            expect(log).toEqual({ alasan: "PASSWORD_SEMENTARA_KEDALUWARSA", hasil: "GAGAL" });
        });

        it("tetap ditolak pada percobaan berikutnya; permintaan baru (forgot + terbitkan) memulihkan akses", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const sementara = passwordDari(await terbitkan(admin.auth, await idPermintaanBaru(u.email, u.id)));
            clock.advance(73 * JAM);
            try {
                expect((await login(u.email, sementara)).status).toBe(401);
                expect((await login(u.email, sementara)).status).toBe(401);
                const auth = await masuk((await kueri<{ email: string }>(`SELECT email FROM users WHERE id = ${String(admin.id)}`))[0]?.email ?? "");
                const baru = passwordDari(await terbitkan(auth, await idPermintaanBaru(u.email, u.id)));
                expect((await login(u.email, baru)).status).toBe(200);
            } finally {
                clock.advance(-73 * JAM);
            }
        });

        it("batas 72 jam hanya bagi password hasil RESET: akun baru buatan Administrator (must_change_password tanpa penerbitan) tak terpengaruh", async () => {
            const u = await seed({ wajibGanti: true });
            clock.advance(100 * JAM);
            try {
                expect((await login(u.email)).status).toBe(200);
            } finally {
                clock.advance(-100 * JAM);
            }
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("POST /users/{id}/reset-password — reset langsung dari detail pengguna (M-02, P-63)", () => {
        const langsung = (auth: Record<string, string>, id: number | string, ...opsi: [unknown?]): Promise<Balasan> => {
            const metode = opsi.length === 0 ? METODE : opsi[0];
            return kirim("POST", `/users/${String(id)}/reset-password`, auth, metode === undefined ? {} : { metode_verifikasi: metode });
        };

        it("tanpa token 401; Guru 403; pengguna tak ada 404; akun nonaktif 422; metode wajib (400)", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const nonaktif = await seed({ status: "NONAKTIF" });
            expect((await kirim("POST", `/users/${String(u.id)}/reset-password`, {}, { metode_verifikasi: METODE })).status).toBe(401);
            expect((await langsung(await masuk((await seed()).email), u.id)).status).toBe(403);
            expect((await langsung(admin.auth, 999999999)).status).toBe(404);
            expect((await langsung(admin.auth, nonaktif.id)).status).toBe(422);
            expect((await langsung(admin.auth, u.id, undefined)).status).toBe(400);
            expect((await langsung(admin.auth, u.id, "LISAN")).status).toBe(400);
            expect(await barisPermintaan(u.id)).toEqual([]);
        });

        it("tanpa permintaan pemohon: mencatat permintaan BARU langsung DITERBITKAN (metode + pelaku + 72 jam); password sementara sekali tampil", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const r = await langsung(admin.auth, u.id, "KONFIRMASI_ATASAN_ATAU_WALI_KELAS");
            expect(r.status).toBe(200);
            expect(r.headers.get("cache-control")).toBe("no-store");
            const data = r.json.data as { user_id: string; permintaan_id: string; password_sementara: string; berlaku_sampai: string };
            expect(data.user_id).toBe(String(u.id));
            expect(new Date(data.berlaku_sampai).getTime()).toBe(T0.getTime() + 72 * JAM);

            const baris = await barisPermintaan(u.id);
            expect(baris).toHaveLength(1);
            expect(baris[0]).toMatchObject({ id: data.permintaan_id, status: "DITERBITKAN", metode_verifikasi: "KONFIRMASI_ATASAN_ATAU_WALI_KELAS", diproses_oleh: String(admin.id) });
            expect((await login(u.email, data.password_sementara)).status).toBe(200);
            expect(await verifyPassword(await passwordHash(u.id), PASSWORD)).toBe(false);
            expect(await jumlahAudit(u.id, "PASSWORD_RESET_ISSUED")).toBe(1);
        });

        it("bila akun itu punya permintaan MENUNGGU, permintaan itulah yang diselesaikan — tidak ada permintaan ganda", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const id = await idPermintaanBaru(u.email, u.id);
            const r = await langsung(admin.auth, u.id);
            expect((r.json.data as { permintaan_id: string }).permintaan_id).toBe(id);
            const baris = await barisPermintaan(u.id);
            expect(baris).toHaveLength(1);
            expect(baris[0]?.status).toBe("DITERBITKAN");
        });

        it("efek yang sama dengan antrean: sesi lama dicabut dan kunci login dibuka", async () => {
            const admin = await siapkanAdmin();
            const u = await seed();
            const sesi = await login(u.email);
            for (let i = 0; i < 5; i += 1) await login(u.email, SALAH);
            const r = await langsung(admin.auth, u.id);
            expect(r.status).toBe(200);
            expect((await kirim("GET", "/auth/sessions", bearerDari(sesi))).status).toBe(401);
            expect((await login(u.email, (r.json.data as { password_sementara: string }).password_sementara)).status).toBe(200);
        });
    });
});
