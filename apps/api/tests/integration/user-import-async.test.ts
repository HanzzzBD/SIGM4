// Acceptance PR-01-17: "Berkas > 200 baris diproses BullMQ, notifikasi NT-52 saat
// selesai; unggah ulang berkas identik dalam 24 jam tidak memproses ulang;
// laporan per baris tersedia lewat endpoint pengambilan tersendiri"
// (IMPT-02, IMPT-03, IMPT-04, NT-52, SDD-DB-22, SDD-05 §4.7f) terhadap
// PostgreSQL NYATA.
//
// Yang diuji di sini adalah logika pekerjaan (`UserImportService`,
// `UserImportRunner`) dan kontrak HTTP — bukan BullMQ, yang jaminannya milik
// BullMQ dan sudah diuji `worker-scheduler.test.ts`. Pemasangan event -> antrean
// diuji unit (`tests/shared/user-import-worker.test.ts`).
//
// NT-52 sendiri (notifikasi in-app) tidak diuji: yang terbit dan diuji adalah
// event `UserImportCompleted`; konsumennya menyusul di `PR-02-25` (keputusan 33).

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import type { Express, RequestHandler } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { UserImportRunner, usersRouter } from "../../src/modules/m02-users/index.js";
import { StudentObligationRegistry } from "../../src/modules/m02-users/services/student-obligation-registry.js";
import { UserImportService } from "../../src/modules/m02-users/services/user-import.service.js";
import { UserService } from "../../src/modules/m02-users/services/user.service.js";
import { authorize, createAuthContext, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext, EffectivePermissions } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { createUserImportRepository } from "../../src/modules/m02-users/repositories/user-import.repository.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const T1 = new Date("2026-09-19T03:00:00Z");
const BATAS = 200;

let urut = 0;
const emailUnik = () => `impor-${(urut += 1)}-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
const nipUnik = () => `NIPIMPOR${randomUUID().replace(/-/g, "").slice(0, 16)}`;

async function seedAdmin(status = "AKTIF"): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Impor', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-01'), '${status}', false)
        RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan admin uji");
    return Number(baris.id);
}

function buatCtx(userId: number, izin: readonly string[] = ["user.view", "user.create", "user.update"]): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map(izin.map((i) => [i, "all"] as const)),
    });
}

const audit = () => new AuditLogger({ clock: new FixedClock(T1) });
const logger = () => new Logger({ clock: new FixedClock(T1), tulis: () => undefined });
const layananPengguna = () => new UserService(getDb(), audit(), new StudentObligationRegistry(), new FixedClock(T1));
const layananImpor = (waktu = T1) =>
    new UserImportService(getDb(), layananPengguna(), audit(), logger(), new FixedClock(waktu));

/** Baris valid + baris yang gagal validasi cepat (tanpa hashing), agar 201 baris tetap murah. */
function csv(valid: readonly string[], gagalTambahan = 0): string {
    const baris = ["nama_lengkap,email,nip_nis,kode_role"];
    for (const email of valid) baris.push(`Peserta,${email},${nipUnik()},R-05`);
    for (let i = 0; i < gagalTambahan; i += 1) baris.push(`Rusak,bukan-email-${String(i)},${nipUnik()},R-05`);
    return baris.join("\n");
}
const b64 = (teks: string) => Buffer.from(teks, "utf8").toString("base64");

const izinAdmin = new Map([["user.create", "all" as const]]);
function pembaca(scopes: ReadonlyMap<string, "all"> = izinAdmin) {
    return {
        load: (): Promise<EffectivePermissions> =>
            Promise.resolve({ roleId: "1", roleCode: "ADMIN", roleVersion: "1", scopes }),
    };
}
const runner = (scopes?: ReadonlyMap<string, "all">) =>
    new UserImportRunner(getDb(), pembaca(scopes), layananImpor(), logger());

async function jumlahPengguna(awalan: string): Promise<number> {
    const [n] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM users WHERE email LIKE '${awalan}%'`);
    return Number(n?.n);
}

describe.skipIf(!ADA_DB)("PR-01-17 — impor pengguna asinkron + idempotensi (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    // Pekerjaan impor merujuk users (created_by): dihapus lebih dulu.
    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM user_import_jobs");
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM event_outbox");
    }
    beforeEach(bersihkan);
    afterEach(bersihkan);
    afterAll(bersihkan);

    it("IMPT-03: berkas identik dalam 24 jam mengembalikan pekerjaan yang sama, tanpa memproses ulang (sinkron)", async () => {
        const admin = await seedAdmin();
        const berkas = b64(csv([emailUnik(), emailUnik()]));

        const pertama = await layananImpor().submit(buatCtx(admin), { filename: "a.csv", contentBase64: berkas });
        const kedua = await layananImpor().submit(buatCtx(admin), { filename: "b.csv", contentBase64: berkas });

        expect(pertama).toMatchObject({ replay: false, job: { status: "SELESAI", sukses: 2, gagal: 0 } });
        expect(kedua.replay).toBe(true);
        expect(kedua.job.id).toBe(pertama.job.id);
        const [jumlah] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM user_import_jobs");
        expect(jumlah?.n).toBe("1");
        const [selesai] = await kueri<{ n: string }>(
            `SELECT count(*)::text AS n FROM activity_logs WHERE aksi = 'USER_IMPORTED' AND entitas_id = ${pertama.job.id}`,
        );
        expect(selesai?.n).toBe("1");
    });

    it("IMPT-03: sesudah jendela 24 jam berkas diproses lagi; pekerjaan GAGAL tidak pernah di-replay", async () => {
        const admin = await seedAdmin();
        const berkas = b64(csv([emailUnik()]));
        const pertama = await layananImpor().submit(buatCtx(admin), { filename: "a.csv", contentBase64: berkas });

        const lewat = new Date(Date.now() + 25 * 60 * 60 * 1000);
        const kedua = await layananImpor(lewat).submit(buatCtx(admin), { filename: "a.csv", contentBase64: berkas });
        expect(kedua.replay).toBe(false);
        expect(kedua.job.id).not.toBe(pertama.job.id);

        await kueri("UPDATE user_import_jobs SET status = 'GAGAL'");
        const ulang = await layananImpor().submit(buatCtx(admin), { filename: "a.csv", contentBase64: berkas });
        expect(ulang.replay).toBe(false);
        expect(ulang.job.id).not.toBe(kedua.job.id);
    });

    it("IMPT-03: dua unggahan identik BERSAMAAN menghasilkan tepat satu pekerjaan (kunci atas hash)", async () => {
        const admin = await seedAdmin();
        const berkas = b64(csv([emailUnik(), emailUnik(), emailUnik()]));

        const hasil = await Promise.all(
            [1, 2, 3].map(() => layananImpor().submit(buatCtx(admin), { filename: "a.csv", contentBase64: berkas })),
        );

        expect(hasil.filter((h) => !h.replay)).toHaveLength(1);
        expect(new Set(hasil.map((h) => h.job.id)).size).toBe(1);
        const [jumlah] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM user_import_jobs");
        expect(jumlah?.n).toBe("1");
    });

    it("IMPT-03: submit menunggu kunci advisory atas hash — selama transaksi lain memegangnya, tidak ada pekerjaan yang dibuat", async () => {
        const admin = await seedAdmin();
        const ctx = buatCtx(admin);
        const berkas = b64(csv([emailUnik()]));
        const hash = createHash("sha256").update(Buffer.from(berkas, "base64")).digest("hex");
        let selesai = false;
        let submit: Promise<{ replay: boolean }> | undefined;

        await getDb()
            .transaction()
            .execute(async (tx) => {
                await createUserImportRepository(tx).lockHash(ctx, hash);
                submit = layananImpor()
                    .submit(ctx, { filename: "a.csv", contentBase64: berkas })
                    .finally(() => {
                        selesai = true;
                    });
                await new Promise((r) => setTimeout(r, 500));
                // Kunci masih dipegang: submit tidak boleh sudah lewat pencarian dan penyisipan.
                expect(selesai).toBe(false);
                const [jumlah] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM user_import_jobs");
                expect(jumlah?.n).toBe("0");
            });

        expect(await submit).toMatchObject({ replay: false });
    });

    it("pekerjaan yang sudah SELESAI tidak berubah GAGAL oleh penutupan yang terlambat, dan tidak ada log/event tambahan", async () => {
        const admin = await seedAdmin();
        const { job } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar.csv",
            contentBase64: b64(csv([emailUnik()], BATAS)),
        });
        await runner().run({ job_id: job.id, oleh: admin }, false);
        const [sebelum] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE entitas_id = ${job.id}`);

        await layananImpor().gagalkan(buatCtx(admin), Number(job.id), "terlambat");

        expect((await layananImpor().get(buatCtx(admin), Number(job.id))).status).toBe("SELESAI");
        const [sesudah] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM activity_logs WHERE entitas_id = ${job.id}`);
        expect(sesudah?.n).toBe(sebelum?.n);
    });

    it("IMPT-04: 201 baris dijadwalkan (MENUNGGU, event outbox dalam transaksi yang sama), belum diproses", async () => {
        const admin = await seedAdmin();
        const awal = emailUnik();
        const berkas = b64(csv([awal], BATAS));

        const { job } = await layananImpor().submit(buatCtx(admin), { filename: "besar.csv", contentBase64: berkas });

        expect(job).toMatchObject({ status: "MENUNGGU", total_baris: BATAS + 1, baris_terproses: 0, sukses: 0, gagal: 0 });
        expect(await jumlahPengguna(awal.slice(0, 12))).toBe(0);
        const [event] = await kueri<{ event_name: string; aggregate_id: string; payload: { job_id: string; oleh: number } }>(
            "SELECT event_name, aggregate_id::text, payload FROM event_outbox WHERE event_name = 'UserImportRequested'",
        );
        expect(event).toMatchObject({ aggregate_id: job.id, payload: { job_id: job.id, oleh: admin } });
        const [berkasTersimpan] = await kueri<{ ada: boolean }>(`SELECT berkas IS NOT NULL AS ada FROM user_import_jobs WHERE id = ${job.id}`);
        expect(berkasTersimpan?.ada).toBe(true);
    });

    it("IMPT-04/NT-52: worker memproses pekerjaan → SELESAI, laporan per baris, berkas dikosongkan (DP-03), event selesai terbit", async () => {
        const admin = await seedAdmin();
        const valid = [emailUnik(), emailUnik(), emailUnik()];
        const { job } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar.csv",
            contentBase64: b64(csv(valid, BATAS)),
        });

        await runner().run({ job_id: job.id, oleh: admin }, false);

        const akhir = await layananImpor().get(buatCtx(admin), Number(job.id));
        expect(akhir).toMatchObject({ status: "SELESAI", total_baris: BATAS + 3, baris_terproses: BATAS + 3, sukses: 3, gagal: BATAS });
        expect(akhir.laporan_gagal).toHaveLength(BATAS);
        // Baris 5 berkas = baris data ke-4 (header = baris 1): tiga valid lebih dulu.
        expect(akhir.laporan_gagal[0]).toMatchObject({ baris: 5, email: "bukan-email-0" });
        expect(akhir.selesai_pada).not.toBeNull();
        for (const email of valid) {
            expect(await kueri(`SELECT 1 FROM users WHERE email = '${email}'`)).toHaveLength(1);
        }
        const [berkas] = await kueri<{ ada: boolean }>(`SELECT berkas IS NOT NULL AS ada FROM user_import_jobs WHERE id = ${job.id}`);
        expect(berkas?.ada).toBe(false);
        const [event] = await kueri<{ payload: { job_id: string; oleh: number } }>(
            "SELECT payload FROM event_outbox WHERE event_name = 'UserImportCompleted'",
        );
        expect(event?.payload).toMatchObject({ job_id: job.id, oleh: admin });
        // AL-01: pelaku pencatatan = pengunggah, bukan SYSTEM.
        const log = await kueri<{ aksi: string; pelaku_id: string | null }>(
            `SELECT aksi, user_id::text AS pelaku_id FROM activity_logs
              WHERE aksi IN ('USER_IMPORT_REQUESTED', 'USER_IMPORTED') AND entitas_id = ${job.id} ORDER BY id`,
        );
        expect(log.map((l) => l.aksi)).toEqual(["USER_IMPORT_REQUESTED", "USER_IMPORTED"]);
        expect(log.every((l) => l.pelaku_id === String(admin))).toBe(true);
    });

    it("JOB-06: pekerjaan yang terputus melanjutkan dari baris_terproses — pengguna tidak dibuat dua kali", async () => {
        const admin = await seedAdmin();
        const valid = [emailUnik(), emailUnik(), emailUnik(), emailUnik()];
        const { job } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar.csv",
            contentBase64: b64(csv(valid, BATAS)),
        });

        // Keadaan setelah crash: dua baris pertama sudah dibuat dan dicatat.
        const peran = await kueri<{ id: string }>("SELECT id::text FROM roles WHERE kode = 'R-05'");
        for (const email of valid.slice(0, 2)) {
            await layananPengguna().create(buatCtx(admin), {
                nama: "Peserta",
                email,
                nipNis: nipUnik(),
                roleId: Number(peran[0]?.id),
                workUnitId: null,
                telepon: null,
            });
        }
        await kueri(`UPDATE user_import_jobs SET status = 'BERJALAN', baris_terproses = 2, sukses = 2 WHERE id = ${job.id}`);

        await runner().run({ job_id: job.id, oleh: admin }, false);

        const akhir = await layananImpor().get(buatCtx(admin), Number(job.id));
        // Tanpa titik lanjut, baris 2-3 dibuat ulang dan dilaporkan "email sudah digunakan".
        expect(akhir).toMatchObject({ status: "SELESAI", sukses: 4, gagal: BATAS });
        expect(akhir.laporan_gagal.every((g) => g.email?.startsWith("bukan-email"))).toBe(true);
        for (const email of valid) {
            expect(await kueri(`SELECT 1 FROM users WHERE email = '${email}'`)).toHaveLength(1);
        }
    });

    it("JOB-06: pekerjaan yang sudah SELESAI tidak dijalankan lagi (worker idempoten)", async () => {
        const admin = await seedAdmin();
        const { job } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar.csv",
            contentBase64: b64(csv([emailUnik()], BATAS)),
        });
        await runner().run({ job_id: job.id, oleh: admin }, false);
        const sebelum = await layananImpor().get(buatCtx(admin), Number(job.id));

        await runner().run({ job_id: job.id, oleh: admin }, false);

        expect(await layananImpor().get(buatCtx(admin), Number(job.id))).toEqual(sebelum);
        const [selesai] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM event_outbox WHERE event_name = 'UserImportCompleted'");
        expect(selesai?.n).toBe("1");
    });

    it("PM-05: pengunggah yang dinonaktifkan / kehilangan user.create membuat pekerjaan GAGAL, tanpa membuat pengguna", async () => {
        const admin = await seedAdmin();
        const awal = emailUnik();
        const { job } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar.csv",
            contentBase64: b64(csv([awal], BATAS)),
        });

        await runner(new Map()).run({ job_id: job.id, oleh: admin }, false);

        const akhir = await layananImpor().get(buatCtx(admin), Number(job.id));
        expect(akhir).toMatchObject({ status: "GAGAL", pesan_galat: "Pengunggah tidak lagi berwenang mengimpor pengguna." });
        expect(await jumlahPengguna(awal)).toBe(0);

        await kueri("DELETE FROM user_import_jobs");
        const { job: job2 } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar2.csv",
            contentBase64: b64(csv([emailUnik()], BATAS)),
        });
        await kueri(`UPDATE users SET status = 'NONAKTIF' WHERE id = ${admin}`);
        await runner().run({ job_id: job2.id, oleh: admin }, false);
        expect((await layananImpor().get(buatCtx(admin), Number(job2.id))).status).toBe("GAGAL");
    });

    it("JOB-06: galat pada percobaan terakhir menutup pekerjaan GAGAL; sebelum itu tetap BERJALAN untuk dicoba ulang", async () => {
        const admin = await seedAdmin();
        const { job } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar.csv",
            contentBase64: b64(csv([emailUnik()], BATAS)),
        });
        // Isi berkas dirusak setelah diterima: pembacaan ulang oleh worker gagal.
        await kueri(`UPDATE user_import_jobs SET berkas = 'tanpa,header\n1,2'::bytea WHERE id = ${job.id}`);

        await expect(runner().run({ job_id: job.id, oleh: admin }, false)).rejects.toBeDefined();
        expect((await layananImpor().get(buatCtx(admin), Number(job.id))).status).toBe("BERJALAN");

        await expect(runner().run({ job_id: job.id, oleh: admin }, true)).rejects.toBeDefined();
        const akhir = await layananImpor().get(buatCtx(admin), Number(job.id));
        expect(akhir.status).toBe("GAGAL");
        expect(akhir.pesan_galat).toMatch(/kesalahan sistem/);
        const [berkas] = await kueri<{ ada: boolean }>(`SELECT berkas IS NOT NULL AS ada FROM user_import_jobs WHERE id = ${job.id}`);
        expect(berkas?.ada).toBe(false);
    });

    it("pekerjaan milik pengunggah lain tidak dijalankan atas nama pemanggil lain", async () => {
        const admin = await seedAdmin();
        const lain = await seedAdmin();
        const { job } = await layananImpor().submit(buatCtx(admin), {
            filename: "besar.csv",
            contentBase64: b64(csv([emailUnik()], BATAS)),
        });

        await expect(runner().run({ job_id: job.id, oleh: lain }, false)).rejects.toMatchObject({ kode: "FORBIDDEN" });
    });

    describe("GET /users/import/{id} lewat HTTP", () => {
        const server: { instance: ReturnType<typeof createServer> | undefined } = { instance: undefined };
        afterEach(async () => {
            if (server.instance !== undefined) {
                await new Promise((r) => server.instance?.close(r));
                server.instance = undefined;
            }
        });

        async function panggil(ctx: AuthContext, metode: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
            const app: Express = express();
            app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
            app.use((_req, res, next) => {
                setAuthContext(res, ctx);
                next();
            });
            const batasi = (): RequestHandler => (_req, _res, next) => next();
            app.use("/api/v1", usersRouter({ db: getDb(), auditLogger: audit(), logger: logger(), clock: new FixedClock(T1) }, batasi, authorize));
            app.use(
                ujungRantai({
                    limiter: { hit: () => Promise.resolve({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) },
                    logger: logger(),
                }),
            );
            server.instance = createServer(app);
            await new Promise<void>((r) => server.instance?.listen(0, "127.0.0.1", r));
            const url = `http://127.0.0.1:${String((server.instance.address() as AddressInfo).port)}`;
            const res = await fetch(`${url}/api/v1${path}`, {
                method: metode,
                headers: { "content-type": "application/json" },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            });
            return { status: res.status, json: await res.json() };
        }

        it("POST ≤200 → 200 SELESAI; POST ulang → 200 idempotent_replay; POST >200 → 202; GET → laporan per baris", async () => {
            const admin = await seedAdmin();
            const ctx = buatCtx(admin);
            const kecil = { filename: "kecil.csv", content_base64: b64(csv([emailUnik()], 1)) };

            const pertama = await panggil(ctx, "POST", "/users/import", kecil);
            expect(pertama.status).toBe(200);
            expect(pertama.json).toMatchObject({
                data: { status: "SELESAI", total: 2, sukses: 1, gagal: 1, laporan_gagal: [{ baris: 3, email: "bukan-email-0" }] },
                meta: { idempotent_replay: false },
            });
            const ulang = await panggil(ctx, "POST", "/users/import", kecil);
            expect(ulang.status).toBe(200);
            expect(ulang.json).toMatchObject({ meta: { idempotent_replay: true } });

            const besar = await panggil(ctx, "POST", "/users/import", { filename: "besar.csv", content_base64: b64(csv([emailUnik()], BATAS)) });
            expect(besar.status).toBe(202);
            const id = (besar.json as { data: { id: string } }).data.id;

            const ambil = await panggil(ctx, "GET", `/users/import/${id}`);
            expect(ambil.status).toBe(200);
            expect(ambil.json).toMatchObject({ data: { id, status: "MENUNGGU", total: BATAS + 1 }, meta: null });
        });

        it("GET id tak dikenal → 404; tanpa user.create → 403 (PM-01, PM-02)", async () => {
            const admin = await seedAdmin();
            const tidakAda = await panggil(buatCtx(admin), "GET", "/users/import/999999");
            expect(tidakAda.status).toBe(404);
            expect(tidakAda.json).toMatchObject({ error: { code: "NOT_FOUND" } });

            const tanpaIzin = await panggil(buatCtx(admin, ["user.view"]), "GET", "/users/import/1");
            expect(tanpaIzin.status).toBe(403);
        });
    });
});
