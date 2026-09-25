// Gerbang keluar Phase 01 (`phase-01.md` §9) — bukti acceptance lintas modul terhadap
// PostgreSQL DAN Redis nyata, lewat HTTP penuh pada `createApp()` (komposisi produksi):
//
//   SEC-T-01  setiap route ber-permission benar-benar menolak 401/403 SEBELUM controller
//             pada aplikasi yang terakit (bukan hanya pada middleware `authorize` terpisah)
//   PM-05     perubahan matriks permission berlaku pada permintaan berikutnya tanpa restart
//   IMPT-02   impor 500 pengguna dengan laporan galat per baris
//   AL-01     setiap route TULIS menghasilkan entri activity log
//   FR-18.2   filter kombinasi activity log ≤ 3 detik untuk rentang 1 bulan (ukuran awal, 100.000 baris)
//
// `authenticate` sungguhan baru lahir di PR-02-02 (Phase 02). Sebagai gantinya uji ini
// memasang pengganti yang membaca permission efektif lewat `PermissionCache` NYATA pada
// setiap permintaan — persis langkah yang harus dilakukan `authenticate` nanti. Yang
// dibuktikan adalah rantai role -> cache -> AuthContext -> route, bukan JWT-nya.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import express from "express";
import type { Server } from "node:http";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, registry } from "../../src/api/index.js";
import { UserImportRunner } from "../../src/modules/m02-users/index.js";
import { StudentObligationRegistry } from "../../src/modules/m02-users/services/student-obligation-registry.js";
import { UserImportService } from "../../src/modules/m02-users/services/user-import.service.js";
import { UserService } from "../../src/modules/m02-users/services/user.service.js";
import { AuditLogger, ensurePartitions } from "../../src/shared/audit/index.js";
import { AMR_OTP, PermissionCache, createAuthContext, setAmr, setAuthContext } from "../../src/shared/auth/index.js";
import { closeRedis, createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu, daftarkanTotpUji } from "../helpers/auth.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA = process.env["DATABASE_URL"] !== undefined && process.env["REDIS_URL"] !== undefined;
const T1 = new Date("2026-09-19T03:00:00Z");
const ID_GAIB = "999999999";

const emailUnik = () => `gerbang-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
const nipUnik = () => `NIPGERBANG${randomUUID().replace(/-/g, "").slice(0, 12)}`;

async function seedPengguna(kodeRole: string): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Gerbang', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), 'AKTIF', false)
        RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
    return Number(baris.id);
}

/** Tabel master yang mencatat pelaku terakhir (`updated_by`) menunjuk users: dilepas sebelum pengguna uji dihapus. */
async function lepasPelaku(): Promise<void> {
    await kueri("UPDATE roles SET updated_by = NULL WHERE updated_by IS NOT NULL");
    await kueri("UPDATE system_settings SET updated_by = NULL WHERE updated_by IS NOT NULL");
}

interface Balasan {
    readonly status: number;
    readonly json: { success?: boolean; data?: unknown; meta?: unknown; error?: { code: string; message: string } };
}

describe.skipIf(!ADA)("Gerbang keluar Phase 01 — acceptance lintas modul (PostgreSQL + Redis nyata)", () => {
    let server: Server;
    let url: string;
    let redis: Redis;
    let cache: PermissionCache;
    // Mode AuthContext dipilih SISI UJI (bukan dari isi permintaan): permintaan HTTP tidak pernah
    // menentukan siapa dirinya. Aman karena setiap `panggil` di berkas ini di-await berurutan.
    let modeAktif = "tanpa";

    beforeAll(async () => {
        dbmate("up");
        redis = createRedis(readRedisConfig());
        cache = new PermissionCache(getDb(), redis);
        const clock = new FixedClock(T1);
        const logger = new Logger({ clock, tulis: () => undefined });
        const app = createApp({
            health: new HealthRegistry(30).register(
                { name: "database", probe: () => Promise.resolve({ status: "up" }) },
                { name: "redis", probe: () => Promise.resolve({ status: "up" }) },
            ),
            limiter: { hit: () => Promise.resolve({ lolos: true, batas: 1000, sisa: 999, resetDetik: 60 }) },
            security: { objectStorageOrigin: "http://minio:9000" },
            logger,
            clock,
            db: getDb(),
            auth: authPalsu(),
        });
        // Pengganti `authenticate` (PR-02-02): mode dipilih uji lewat `modeAktif`.
        const luar = express();
        luar.use((_req, res, next) => {
            const mode = modeAktif;
            const selesai = () => next();
            if (mode === "tanpa") return selesai();
            if (mode === "kosong") {
                setAuthContext(res, createAuthContext({ userId: 1, roleCode: "SISWA", scopes: new Map() }));
                return selesai();
            }
            if (mode.startsWith("penuh:")) {
                setAuthContext(res, createAuthContext({ userId: 1, roleCode: "ADMIN", scopes: new Map([[mode.slice(6), "all"]]) }));
                return selesai();
            }
            // dinamis:<userId> — permission efektif dibaca dari PermissionCache NYATA setiap permintaan.
            const userId = Number(mode.slice("dinamis:".length));
            cache
                .load(userId)
                .then((efektif) => {
                    if (efektif !== undefined) {
                        setAuthContext(res, createAuthContext({ userId, roleCode: efektif.roleCode, scopes: efektif.scopes }));
                        // Pengganti `authenticate` juga meniru klaim `amr`-nya: sesi uji ini sesi ber-2FA (BR-070); 2FA sendiri
                        // dibuktikan `auth-two-factor.test.ts`, bukan gerbang Phase 01.
                        setAmr(res, ["pwd", AMR_OTP]);
                    }
                    selesai();
                })
                .catch(next);
        });
        luar.use(app);
        server = createServer(luar);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    });

    afterAll(async () => {
        await new Promise((r) => server.close(r));
        await redis.quit().catch(() => undefined);
        await closeRedis();
    });

    async function panggil(mode: string, metode: string, path: string, body?: unknown): Promise<Balasan> {
        modeAktif = mode;
        const res = await fetch(`${url}/api/v1${path}`, {
            method: metode,
            headers: { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        // Ekspor berkas (XLSX) bukan JSON: hanya statusnya yang dipakai.
        if (!(res.headers.get("content-type") ?? "").includes("json")) {
            await res.arrayBuffer();
            return { status: res.status, json: {} };
        }
        return { status: res.status, json: (await res.json()) as Balasan["json"] };
    }

    // ---------------------------------------------------------------------------------------
    describe("SEC-T-01 — setiap route ber-permission pada aplikasi TERAKIT", () => {
        const rute = registry.guarded();
        const konkret = (path: string) => path.replace(/:[A-Za-z_]+/g, ID_GAIB);

        it("registri memuat route keempat modul + M-18 + kesehatan — uji ini benar-benar menguji sesuatu", () => {
            const modul = new Set(rute.map((r) => r.module));
            for (const m of ["m02-users", "m03-locations", "m18-activity-log", "m20-settings", "m04-assets"]) {
                expect(modul.has(m), m).toBe(true);
            }
            expect(rute.length).toBeGreaterThanOrEqual(35);
        });

        it("TANPA AuthContext → 401 UNAUTHENTICATED; AuthContext tanpa permission → 403 INSUFFICIENT_PERMISSION — SEBELUM validasi body/controller, untuk SEMUA route", async () => {
            const gagal: string[] = [];
            for (const r of rute) {
                const path = konkret(r.path);
                // Body sengaja `{}` (tidak sah untuk hampir semua route): bila controller/validasi berjalan
                // lebih dulu daripada otorisasi, jawabannya 400, bukan 401/403.
                const tanpa = await panggil("tanpa", r.method, path, r.method === "GET" ? undefined : {});
                if (tanpa.status !== 401 || tanpa.json.error?.code !== "UNAUTHENTICATED") gagal.push(`${r.method} ${r.path} tanpa konteks -> ${String(tanpa.status)} ${tanpa.json.error?.code ?? ""}`);
                const kosong = await panggil("kosong", r.method, path, r.method === "GET" ? undefined : {});
                if (kosong.status !== 403 || kosong.json.error?.code !== "INSUFFICIENT_PERMISSION") gagal.push(`${r.method} ${r.path} tanpa permission -> ${String(kosong.status)} ${kosong.json.error?.code ?? ""}`);
            }
            expect(gagal).toEqual([]);
        });

        it("pemegang PERMISSION YANG TEPAT lolos otorisasi (bukan 401/403) pada setiap route — otorisasi tidak menolak berlebihan", async () => {
            const gagal: string[] = [];
            for (const r of rute) {
                const hasil = await panggil(`penuh:${r.permission}`, r.method, konkret(r.path), r.method === "GET" ? undefined : {});
                if (hasil.status === 401 || hasil.status === 403) gagal.push(`${r.method} ${r.path} (${r.permission}) -> ${String(hasil.status)}`);
            }
            expect(gagal).toEqual([]);
        });

        it("permission LAIN tidak cukup: route menuntut permission-nya sendiri, bukan sembarang permission", async () => {
            const gagal: string[] = [];
            for (const r of rute) {
                const lain = r.permission === "setting.manage" ? "setting.view" : "setting.manage";
                const hasil = await panggil(`penuh:${lain}`, r.method, konkret(r.path), r.method === "GET" ? undefined : {});
                if (hasil.status !== 403 && r.permission !== lain) gagal.push(`${r.method} ${r.path} dengan ${lain} -> ${String(hasil.status)}`);
            }
            expect(gagal).toEqual([]);
        });

        it("route publik hanya probe kesehatan, login/refresh (PR-02-02), dan forgot password (PR-02-05), dan dapat dijangkau tanpa AuthContext", async () => {
            const publik = registry.publicRoutes().map((r) => `${r.method} ${r.path}`).sort();
            expect(publik).toEqual(["GET /health/live", "GET /health/ready", "POST /auth/2fa/verify", "POST /auth/login", "POST /auth/password/forgot", "POST /auth/refresh"]);
            expect((await panggil("tanpa", "GET", "/health/live")).status).toBe(200);
            expect((await panggil("tanpa", "GET", "/health/ready")).status).toBe(200);
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("PM-05 — perubahan matriks permission berlaku tanpa restart (≤ 60 detik)", () => {
        it("Administrator mencabut asset.view dari Petugas → permintaan BERIKUTNYA Petugas 403; dipulihkan → lolos lagi; kunci cache ber-TTL ≤ 60 detik", async () => {
            const admin = await seedPengguna("R-01");
            const petugas = await seedPengguna("R-02");
            const [role] = await kueri<{ id: string; role_version: string }>("SELECT id::text, role_version::text FROM roles WHERE kode = 'R-02'");
            const roleId = Number(role?.id);
            const matriks = await kueri<{ kode: string; scope: string }>(`
                SELECT p.kode, rp.scope::text AS scope FROM role_permissions rp
                  JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ${roleId} ORDER BY p.kode`);
            const semua = matriks.map((m) => ({ kode: m.kode, scope: m.scope }));
            expect(semua.some((m) => m.kode === "asset.view")).toBe(true);

            try {
                // Sebelum: lolos otorisasi (sumber daya tidak ada -> 404, bukan 403).
                const sebelum = await panggil(`dinamis:${petugas}`, "GET", `/rooms/${ID_GAIB}/assets`);
                expect(sebelum.status).toBe(404);

                const cabut = await panggil(`dinamis:${admin}`, "PUT", `/roles/${roleId}/permissions`, {
                    permissions: semua.filter((m) => m.kode !== "asset.view"),
                });
                expect(cabut.status).toBe(200);

                const mulai = performance.now();
                const sesudah = await panggil(`dinamis:${petugas}`, "GET", `/rooms/${ID_GAIB}/assets`);
                const jeda = performance.now() - mulai;
                expect(sesudah.status).toBe(403);
                expect(sesudah.json.error?.code).toBe("INSUFFICIENT_PERMISSION");
                // Berlaku pada permintaan berikutnya — jauh di dalam batas 60 detik PM-05.
                expect(jeda).toBeLessThan(60_000);
                console.log(`[PM-05] permintaan pertama setelah pencabutan ditolak dalam ${jeda.toFixed(1)} ms`);

                const versi = (await kueri<{ v: string }>(`SELECT role_version::text AS v FROM roles WHERE id = ${roleId}`))[0]?.v;
                const ttl = await redis.ttl(`sigm4:perm:${String(petugas)}:${String(roleId)}:${String(versi)}`);
                expect(ttl).toBeGreaterThan(0);
                expect(ttl).toBeLessThanOrEqual(60);

                const pulih = await panggil(`dinamis:${admin}`, "PUT", `/roles/${roleId}/permissions`, { permissions: semua });
                expect(pulih.status).toBe(200);
                expect((await panggil(`dinamis:${petugas}`, "GET", `/rooms/${ID_GAIB}/assets`)).status).toBe(404);
            } finally {
                await kueri(`UPDATE roles SET role_version = ${role?.role_version} WHERE id = ${roleId}`);
                await lepasPelaku();
                await kueri(`DELETE FROM users WHERE id IN (${admin}, ${petugas})`);
            }
        });
    });

    // ---------------------------------------------------------------------------------------
    describe("IMPT-02 — impor 500 pengguna dengan laporan galat per baris", () => {
        it("500 baris (> 200 → asinkron): 440 sukses, 60 gagal dilaporkan per nomor baris; tiap sukses ber-USER_CREATED", async () => {
            const admin = await seedPengguna("R-01");
            await kueri("DELETE FROM work_units WHERE kode = 'TU-01'");
            await kueri("INSERT INTO work_units (nama, kode, jenis) VALUES ('Tata Usaha', 'TU-01', 'TATA_USAHA')");
            const awalan = `imp500${randomUUID().slice(0, 6)}`;
            const emailIni = (i: number) => `${awalan}-${String(i)}@sekolah.sch.id`;

            // Rancangan: baris ke-i (0-based) = baris berkas ke-(i+2). Kategori gagal ditetapkan per rentang.
            const kategori = (i: number): "sah" | "email" | "duplikat" | "role" | "unitKosong" | "unitTakDikenal" => {
                if (i >= 480 && i < 495) return "duplikat"; // menyalin email 15 baris SAH pertama
                if (i % 25 === 3) return "email"; // 20 baris: 3, 28, ..., 478
                if (i % 50 === 10) return "role"; // 10 baris
                if (i % 50 === 20) return "unitKosong"; // 10 baris
                if (i % 100 === 30) return "unitTakDikenal"; // 5 baris
                return "sah";
            };
            const asalSah = Array.from({ length: 480 }, (_, i) => i).filter((i) => kategori(i) === "sah").slice(0, 15);
            const baris = ["nama_lengkap,email,nip_nis,kode_role,kode_unit_kerja"];
            const gagalDiharapkan: number[] = [];
            for (let i = 0; i < 500; i += 1) {
                const k = kategori(i);
                const email = k === "email" ? `bukan-email-${String(i)}` : k === "duplikat" ? emailIni(asalSah[i - 480]!) : emailIni(i);
                const role = k === "role" ? "R-99" : "R-05";
                const unit = k === "unitKosong" ? "" : k === "unitTakDikenal" ? "TIDAK-ADA" : "TU-01";
                baris.push(`Peserta ${String(i)},${email},NIP${awalan}${String(i).padStart(4, "0")},${role},${unit}`);
                if (k !== "sah") gagalDiharapkan.push(i + 2);
            }
            expect(gagalDiharapkan).toHaveLength(60);
            const berkas = Buffer.from(baris.join("\n"), "utf8").toString("base64");

            const terima = await panggil(`dinamis:${admin}`, "POST", "/users/import", { filename: "pengguna-500.csv", content_base64: berkas });
            expect(terima.status).toBe(202);
            const job = terima.json.data as { id: string; status: string; total: number };
            expect(job).toMatchObject({ status: "MENUNGGU", total: 500 });

            const clock = new FixedClock(T1);
            const logger = new Logger({ clock, tulis: () => undefined });
            const audit = new AuditLogger({ clock });
            const service = new UserImportService(getDb(), new UserService(getDb(), audit, new StudentObligationRegistry(), clock), audit, logger, clock);
            const mulai = performance.now();
            await new UserImportRunner(getDb(), cache, service, logger).run({ job_id: job.id, oleh: admin }, false);
            const detik = (performance.now() - mulai) / 1000;
            console.log(`[IMPT-02] 500 baris diproses worker dalam ${detik.toFixed(1)} detik (440 pengguna dibuat)`);

            const laporan = await panggil(`dinamis:${admin}`, "GET", `/users/import/${job.id}`);
            const data = laporan.json.data as { status: string; total: number; terproses: number; sukses: number; gagal: number; laporan_gagal: { baris: number; email: string | null; pesan: string }[] };
            expect(data).toMatchObject({ status: "SELESAI", total: 500, terproses: 500, sukses: 440, gagal: 60 });
            // Laporan per baris: tepat baris yang dirancang gagal, terurut, masing-masing beralasan.
            expect(data.laporan_gagal.map((g) => g.baris)).toEqual(gagalDiharapkan);
            expect(data.laporan_gagal.every((g) => g.pesan.length > 0)).toBe(true);
            const alasan = (baris: number) => data.laporan_gagal.find((g) => g.baris === baris)?.pesan;
            expect(alasan(2 + 480)).toBe("Email sudah digunakan.");
            expect(alasan(2 + 10)).toMatch(/R-99/);
            expect(alasan(2 + 20)).toBe("Kode unit kerja wajib diisi (E.5.2).");
            expect(alasan(2 + 30)).toBe("Kode unit kerja tidak dikenal: TIDAK-ADA");

            const [dibuat] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM users WHERE email LIKE '${awalan}-%'`);
            expect(dibuat?.n).toBe("440");
            const [log] = await kueri<{ n: string }>(
                `SELECT count(*)::text AS n FROM activity_logs a JOIN users u ON u.id = a.entitas_id WHERE a.aksi = 'USER_CREATED' AND a.entitas = 'users' AND u.email LIKE '${awalan}-%'`,
            );
            expect(log?.n).toBe("440");

            await kueri("DELETE FROM user_import_jobs");
            await kueri("UPDATE users SET work_unit_id = NULL");
            await kueri("DELETE FROM work_units WHERE kode = 'TU-01'");
            await lepasPelaku();
            await kueri(`DELETE FROM users WHERE email LIKE '${awalan}-%' OR id = ${admin}`);
        }, 300_000);
    });

    // ---------------------------------------------------------------------------------------
    describe("AL-01 — setiap route TULIS menghasilkan entri activity log", () => {
        it("FR-18.1: activity log hanya dapat DIBACA lewat aplikasi — semua route m18-activity-log berupa GET (tidak ada penyuntingan/penghapusan bagi role mana pun)", () => {
            const metode = registry.all().filter((r) => r.module === "m18-activity-log").map((r) => r.method);
            expect(metode.length).toBeGreaterThan(0);
            expect(metode.every((m) => m === "GET")).toBe(true);
        });

        it("menjalankan SEMUA route tulis M-02/M-03/M-20 dengan masukan sah dan memeriksa entri log-nya; tidak ada route tulis di registri yang terlewat", async () => {
            const admin = await seedPengguna("R-01");
            const mode = `dinamis:${admin}`;
            const disentuh = new Set<string>();

            const jumlah = async (aksi: string): Promise<number> =>
                Number((await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE user_id = ${admin} AND aksi = '${aksi}' AND hasil = 'SUKSES'`))[0]?.n);

            /** Satu langkah: panggil route, harapkan 2xx, lalu setiap aksi yang disebut bertambah tepat satu. */
            async function langkah(pola: string, path: string, body: unknown, aksi: readonly string[]): Promise<Balasan> {
                const [metode] = pola.split(" ") as [string];
                const sebelum = await Promise.all(aksi.map(jumlah));
                const hasil = await panggil(mode, metode, path, body);
                expect(hasil.status, `${pola} -> ${JSON.stringify(hasil.json)}`).toBeLessThan(300);
                const sesudah = await Promise.all(aksi.map(jumlah));
                aksi.forEach((a, i) => expect(sesudah[i]! - sebelum[i]!, `${pola} harus mencatat ${a}`).toBe(1));
                disentuh.add(pola);
                return hasil;
            }
            const id = (h: Balasan) => (h.json.data as { id: string }).id;
            const idUser = (h: Balasan) => (h.json.data as { user?: { id: string }; id: string }).id;
            const sfx = randomUUID().slice(0, 6);

            const cadangan = {
                hari: await kueri<{ hari: number; aktif: boolean }>("SELECT hari, aktif FROM work_days ORDER BY hari"),
                horizon: (await kueri<{ value: unknown }>("SELECT value FROM system_settings WHERE key = 'reservasi.horizon_hari'"))[0]?.value,
            };
            const [roleTeknisi] = await kueri<{ id: string; role_version: string }>("SELECT id::text, role_version::text FROM roles WHERE kode = 'R-04'");
            const matriksTeknisi = (
                await kueri<{ kode: string; scope: string }>(`
                    SELECT p.kode, rp.scope::text AS scope FROM role_permissions rp
                      JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = ${roleTeknisi?.id} ORDER BY p.kode`)
            ).map((m) => ({ kode: m.kode, scope: m.scope }));

            try {
                // --- M-20: unit kerja
                const unit = await langkah("POST /work-units", "/work-units", { nama: `Kelas X-1 ${sfx}`, kode: `X1${sfx}`, jenis: "KELAS" }, ["WORK_UNIT_CREATED"]);
                await langkah("PUT /work-units/:id", `/work-units/${id(unit)}`, { nama: `Kelas X-1A ${sfx}`, kode: `X1${sfx}`, jenis: "KELAS" }, ["WORK_UNIT_UPDATED"]);
                await langkah("PATCH /work-units/:id/status", `/work-units/${id(unit)}/status`, { status: "NONAKTIF" }, ["WORK_UNIT_DEACTIVATED"]);
                await panggil(mode, "PATCH", `/work-units/${id(unit)}/status`, { status: "AKTIF" });
                expect(await jumlah("WORK_UNIT_REACTIVATED")).toBeGreaterThanOrEqual(1);

                // --- M-20: kalender akademik
                const tahun = (nama: string, m: string, s: string, g: string, n: string) => ({
                    nama, tanggal_mulai: m, tanggal_selesai: s,
                    semester: [{ nama: "GANJIL", tanggal_mulai: m, tanggal_selesai: g }, { nama: "GENAP", tanggal_mulai: n, tanggal_selesai: s }],
                });
                const y1 = await langkah("POST /academic-years", "/academic-years", tahun(`Gerbang ${sfx} A`, "2040-07-01", "2041-06-30", "2040-12-31", "2041-01-02"), ["ACADEMIC_YEAR_CREATED"]);
                const y2 = await panggil(mode, "POST", "/academic-years", tahun(`Gerbang ${sfx} B`, "2041-07-01", "2042-06-30", "2041-12-31", "2042-01-02"));
                expect(y2.status).toBe(201);
                await langkah("PUT /academic-years/:id", `/academic-years/${id(y2)}`, tahun(`Gerbang ${sfx} B2`, "2041-07-01", "2042-06-30", "2041-12-31", "2042-01-02"), ["ACADEMIC_YEAR_UPDATED"]);
                await langkah("PATCH /academic-years/:id/activate", `/academic-years/${id(y2)}/activate`, undefined, ["ACADEMIC_YEAR_ACTIVATED"]);

                // --- M-20: hari libur, hari kerja, parameter
                const libur = await langkah("POST /holidays", "/holidays", { tanggal: "2040-08-17", nama: `Libur ${sfx}`, jenis: "SEKOLAH" }, ["HOLIDAY_CREATED"]);
                await langkah("PUT /holidays/:id", `/holidays/${id(libur)}`, { tanggal: "2040-08-18", nama: `Libur ${sfx}`, jenis: "SEKOLAH" }, ["HOLIDAY_UPDATED"]);
                await langkah("DELETE /holidays/:id", `/holidays/${id(libur)}`, undefined, ["HOLIDAY_DELETED"]);
                await langkah("PUT /work-days", "/work-days", { hari_kerja: [1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: hari !== 3 })) }, ["WORK_DAYS_UPDATED"]);
                await langkah("PUT /settings", "/settings", { settings: { "reservasi.horizon_hari": 91 } }, ["SETTING_UPDATED"]);

                // --- M-03: lokasi
                const gedung = await langkah("POST /buildings", "/buildings", { nama: `Gedung ${sfx}`, kode: `G${sfx}` }, ["LOCATION_CREATED"]);
                const area = await langkah("POST /areas", "/areas", { building_id: id(gedung), nama: `Area ${sfx}`, kode: `A${sfx}`, lantai: 1 }, ["LOCATION_CREATED"]);
                const ruang = await langkah("POST /rooms", "/rooms", { area_id: id(area), nama: `Ruang ${sfx}`, kode: `R${sfx}`, jenis: "KELAS", kapasitas: 30, dapat_direservasi: true, boleh_direservasi_siswa: false }, ["LOCATION_CREATED"]);
                await langkah("PUT /rooms/:id", `/rooms/${id(ruang)}`, { area_id: id(area), nama: `Ruang ${sfx} B`, kode: `R${sfx}`, jenis: "KELAS", kapasitas: 32, dapat_direservasi: true, boleh_direservasi_siswa: false }, ["LOCATION_UPDATED"]);

                // --- M-04: aset (PR-02-11) — SEBELUM ruangan dinonaktifkan (BR-009: ruangan wajib AKTIF).
                // asset_categories belum berendpoint (CRUD milik PR-02-15) — kategori disisipkan langsung.
                const [kategoriAset] = await kueri<{ id: string }>(
                    `INSERT INTO asset_categories (nama, kode) VALUES ('Kategori Gerbang ${sfx}', 'KAT${sfx}') RETURNING id::text`,
                );
                await langkah(
                    "POST /assets",
                    "/assets",
                    {
                        nama: `Aset Gerbang ${sfx}`,
                        category_id: Number(kategoriAset?.id),
                        tahun_perolehan: 2024,
                        sumber_perolehan: "PEMBELIAN",
                        room_id: Number(id(ruang)),
                        kondisi: "BAIK",
                    },
                    ["ASSET_CREATED"],
                );
                // BR-015 (fix/PR-02-10): ruangan beraset tidak dapat dinonaktifkan. Aset
                // di atas hanya untuk membuktikan AL-01 POST /assets, bukan untuk diuji di
                // sini — disingkirkan sebelum langkah PATCH .../status di bawah.
                await kueri(`DELETE FROM assets WHERE room_id = ${id(ruang)}`);

                await langkah("PATCH /rooms/:id/status", `/rooms/${id(ruang)}/status`, { status: "NONAKTIF" }, ["LOCATION_DEACTIVATED"]);
                await langkah("PATCH /buildings/:id/status", `/buildings/${id(gedung)}/status`, { status: "NONAKTIF" }, ["LOCATION_DEACTIVATED"]);

                // --- M-02: pengguna, siswa, kenaikan kelas, role, impor
                const [roleGuru] = await kueri<{ id: string }>("SELECT id::text FROM roles WHERE kode = 'R-05'");
                const [roleSiswa] = await kueri<{ id: string }>("SELECT id::text FROM roles WHERE kode = 'R-07'");
                const guru = await langkah("POST /users", "/users", { nama: "Guru Gerbang", email: emailUnik(), nip_nis: nipUnik(), role_id: Number(roleGuru?.id) }, ["USER_CREATED"]);
                await langkah("PUT /users/:id", `/users/${idUser(guru)}`, { nama: "Guru Gerbang B", email: emailUnik(), nip_nis: nipUnik(), role_id: Number(roleGuru?.id) }, ["USER_UPDATED"]);
                // PR-02-05: reset langsung (M-02) — sebelum akunnya dinonaktifkan di bawah, sebab akun nonaktif tak dapat direset.
                await langkah("POST /users/:id/reset-password", `/users/${idUser(guru)}/reset-password`, { metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" }, ["PASSWORD_RESET_ISSUED"]);
                // PR-02-33: kode aktivasi 2FA (role wajib yang belum ber-2FA) lalu reset 2FA (setelah 2FA aktif) — M-02.
                const [roleWajib2fa] = await kueri<{ id: string }>("SELECT id::text FROM roles WHERE kode = 'R-03'");
                const pimpinan = await langkah("POST /users", "/users", { nama: "Pimpinan Gerbang", email: emailUnik(), nip_nis: nipUnik(), role_id: Number(roleWajib2fa?.id) }, ["USER_CREATED"]);
                await langkah("POST /users/:id/2fa-activation-code", `/users/${idUser(pimpinan)}/2fa-activation-code`, { metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" }, ["TWO_FA_ACTIVATION_CODE_ISSUED"]);
                await daftarkanTotpUji(getDb(), idUser(pimpinan), new Date());
                await langkah("POST /users/:id/reset-2fa", `/users/${idUser(pimpinan)}/reset-2fa`, { metode_verifikasi: "KARTU_IDENTITAS_TATAP_MUKA" }, ["TWO_FA_RESET"]);
                await langkah("PATCH /users/:id/status", `/users/${idUser(guru)}/status`, { status: "NONAKTIF", alasan: "Uji gerbang" }, ["USER_DEACTIVATED"]);
                await panggil(mode, "PATCH", `/users/${idUser(guru)}/status`, { status: "AKTIF" });
                expect(await jumlah("USER_REACTIVATED")).toBeGreaterThanOrEqual(1);

                const siswa = await panggil(mode, "POST", "/users", { nama: "Siswa Gerbang", email: emailUnik(), nip_nis: nipUnik(), role_id: Number(roleSiswa?.id), consent_wali: true });
                expect(siswa.status).toBe(201);
                await langkah("POST /class-promotions", "/class-promotions", { academic_year_id: Number(id(y1)), items: [{ user_id: Number(idUser(siswa)), tindakan: "NAIK", kelas_id: Number(id(unit)) }] }, ["STUDENT_ENROLLMENT_SET"]);
                const lulus = await panggil(mode, "POST", "/class-promotions", { academic_year_id: Number(id(y1)), items: [{ user_id: Number(idUser(siswa)), tindakan: "LULUS" }] });
                expect(lulus.status).toBe(200);
                expect(await jumlah("STUDENT_MARKED_GRADUATED")).toBeGreaterThanOrEqual(1);

                const semuaPerm = matriksTeknisi;
                await langkah("PUT /roles/:id/permissions", `/roles/${roleTeknisi?.id}/permissions`, { permissions: semuaPerm.slice(1) }, ["ROLE_PERMISSION_UPDATED"]);

                const csv = `nama_lengkap,email,nip_nis,kode_role,kode_unit_kerja\nImpor Gerbang,${emailUnik()},${nipUnik()},R-05,X1${sfx}\n`;
                await langkah("POST /users/import", "/users/import", { filename: "kecil.csv", content_base64: Buffer.from(csv, "utf8").toString("base64") }, ["USER_IMPORT_REQUESTED", "USER_IMPORTED"]);

                // --- M-18: dua pembacaan yang WAJIB tercatat
                await langkah("GET /activity-logs", "/activity-logs?per_page=5", undefined, ["ACTIVITY_LOG_VIEWED"]);
                await langkah("GET /activity-logs/export", "/activity-logs/export?filter[modul]=m20-settings", undefined, ["ACTIVITY_LOG_EXPORTED"]);

                // Penjaga: setiap route TULIS di registri (dan dua pembacaan berlog) tersentuh. Route tulis baru
                // yang ditambahkan PR berikutnya tanpa langkah di atas membuat uji ini merah.
                // Route M-01 (login/refresh, PR-02-02) publik dan tanpa AuthContext: bukti AL-01-nya ada di auth-login-refresh.test.ts.
                const wajib = registry
                    .all()
                    .filter((r) => r.module !== "m01-auth")
                    .filter((r) => r.method !== "GET" || r.path === "/activity-logs" || r.path === "/activity-logs/export")
                    .map((r) => `${r.method} ${r.path}`)
                    .sort();
                expect([...disentuh].sort()).toEqual(wajib);
            } finally {
                for (const h of cadangan.hari) await kueri(`UPDATE work_days SET aktif = ${String(h.aktif)} WHERE hari = ${h.hari}`);
                await kueri(`UPDATE system_settings SET value = '${JSON.stringify(cadangan.horizon)}'::jsonb WHERE key = 'reservasi.horizon_hari'`);
                await kueri(`DELETE FROM role_permissions WHERE role_id = ${roleTeknisi?.id}`);
                for (const m of matriksTeknisi) {
                    await kueri(`INSERT INTO role_permissions (role_id, permission_id, scope) SELECT ${roleTeknisi?.id}, id, '${m.scope}'::permission_scope FROM permissions WHERE kode = '${m.kode}'`);
                }
                await kueri(`UPDATE roles SET role_version = ${roleTeknisi?.role_version} WHERE id = ${roleTeknisi?.id}`);
                // Urutan mengikuti FK: users <-> work_units saling merujuk, dan tabel ber-created_by menunjuk users.
                await kueri("DELETE FROM user_import_jobs");
                await kueri("DELETE FROM student_enrollments");
                await kueri("UPDATE users SET work_unit_id = NULL");
                // PR-02-11: assets/asset_code_counters menunjuk rooms DAN asset_categories — sebelum keduanya.
                await kueri("DELETE FROM assets");
                await kueri("DELETE FROM asset_code_counters");
                await kueri("DELETE FROM asset_categories");
                await kueri("DELETE FROM rooms");
                await kueri("DELETE FROM areas");
                await kueri("DELETE FROM buildings");
                await kueri("DELETE FROM holidays");
                await kueri("DELETE FROM academic_terms");
                await kueri("DELETE FROM academic_years");
                await kueri("DELETE FROM work_units");
                await lepasPelaku();
                await kueri("DELETE FROM password_reset_requests"); // PR-02-05: reset langsung mencatat permintaan
                await kueri("DELETE FROM totp_activation_codes"); // PR-02-33: kode aktivasi menunjuk users
                await kueri("DELETE FROM totp_backup_codes");
                await kueri("DELETE FROM users");
            }
        }, 120_000);
    });

    // ---------------------------------------------------------------------------------------
    describe("FR-18.2 — filter kombinasi ≤ 3 detik untuk rentang 1 bulan", () => {
        const JUMLAH = 100_000;
        const MODUL_UJI = "perf-uji-fr182";

        it(`${String(JUMLAH)} entri dalam satu bulan: GET /activity-logs dengan filter kombinasi (rentang + pengguna + modul + aksi) dan rentang saja, masing-masing ≤ 3 detik`, async () => {
            await ensurePartitions(getDb(), new FixedClock(new Date()));
            const admin = await seedPengguna("R-01");
            // Data sintetis LANGSUNG ke tabel (akun uji berhak DML; akun aplikasi tidak — AL-03b): waktu tersebar
            // dari awal bulan berjalan sampai sekarang, ~1% milik pengguna dan aksi yang dicari.
            await kueri(`
                INSERT INTO activity_logs (waktu, user_id, user_nama, role, modul, aksi, entitas, entitas_id, hasil, row_hash)
                SELECT date_trunc('month', now()) + random() * (now() - date_trunc('month', now())),
                       CASE WHEN g % 100 = 0 THEN ${admin} ELSE 1000000 + (g % 50) END,
                       'Pengguna Uji', 'Guru',
                       CASE WHEN g % 4 = 0 THEN '${MODUL_UJI}' ELSE 'm-lain-' || (g % 3) END,
                       'AKSI_' || (g % 10),
                       'users', g, 'SUKSES', decode(md5(g::text), 'hex')
                  FROM generate_series(1, ${JUMLAH}) g`);
            await kueri("ANALYZE activity_logs");
            try {
                const awal = new Date();
                awal.setUTCDate(1);
                awal.setUTCHours(0, 0, 0, 0);
                const dari = encodeURIComponent(awal.toISOString());
                const sampai = encodeURIComponent(new Date().toISOString());
                const kombinasi = `/activity-logs?filter[dari]=${dari}&filter[sampai]=${sampai}&filter[user_id]=${admin}&filter[modul]=${MODUL_UJI}&filter[aksi]=AKSI_0&page=1&per_page=25`;
                const rentang = `/activity-logs?filter[dari]=${dari}&filter[sampai]=${sampai}&page=1&per_page=25`;

                const ukur = async (path: string): Promise<{ ms: number; total: number }> => {
                    const mulai = performance.now();
                    const hasil = await panggil(`dinamis:${admin}`, "GET", path);
                    const ms = performance.now() - mulai;
                    expect(hasil.status, path).toBe(200);
                    return { ms, total: (hasil.json.meta as { total: number }).total };
                };
                await ukur(kombinasi); // pemanasan: rencana kueri dan cache halaman
                const percobaan = [await ukur(kombinasi), await ukur(kombinasi), await ukur(kombinasi)];
                const luas = [await ukur(rentang), await ukur(rentang), await ukur(rentang)];
                const median = (xs: { ms: number }[]) => xs.map((x) => x.ms).sort((a, b) => a - b)[1]!;
                console.log(`[FR-18.2] ${String(JUMLAH)} entri: filter kombinasi median ${median(percobaan).toFixed(0)} ms (total ${String(percobaan[0]!.total)}); rentang saja median ${median(luas).toFixed(0)} ms (total ${String(luas[0]!.total)})`);

                expect(percobaan[0]!.total).toBeGreaterThan(0);
                expect(luas[0]!.total).toBeGreaterThanOrEqual(JUMLAH);
                expect(median(percobaan)).toBeLessThan(3000);
                expect(median(luas)).toBeLessThan(3000);
            } finally {
                await kueri(`DELETE FROM activity_logs WHERE entitas = 'users' AND aksi LIKE 'AKSI_%' AND (modul = '${MODUL_UJI}' OR modul LIKE 'm-lain-%')`);
                await lepasPelaku();
                await kueri(`DELETE FROM users WHERE id = ${admin}`);
            }
        }, 180_000);
    });
});
