// Acceptance PR-01-13: "Siklus akun siswa: kenaikan kelas massal, kelulusan"
// — "Siswa berkewajiban aktif tidak dapat dinonaktifkan" (Lampiran E.4, SL-01…
// SL-04, SDD-DB-20, SDD-05 §4.7d) terhadap PostgreSQL NYATA.
//
// Definisi "kewajiban" milik Phase 05 (`PR-05-09`): di sini pemeriksanya berupa
// tiruan yang mendaftar ke titik ekstensi — yang diuji adalah titik ekstensinya,
// bukan definisi kewajiban.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Express, RequestHandler } from "express";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { usersRouter } from "../../src/modules/m02-users/index.js";
import { ClassPromotionService } from "../../src/modules/m02-users/services/class-promotion.service.js";
import type { PromotionItem } from "../../src/modules/m02-users/services/class-promotion.service.js";
import { GraduationService } from "../../src/modules/m02-users/services/graduation.service.js";
import { StudentObligationRegistry } from "../../src/modules/m02-users/services/student-obligation-registry.js";
import { UserService } from "../../src/modules/m02-users/services/user.service.js";
import { authorize, createAuthContext, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";
import { penerbitPalsu, pengelolaPalsu } from "../helpers/auth.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const WAKTU = new Date("2026-09-19T00:00:00Z");

const TAHUN_LAMA = { nama: "2020/2021", mulai: "2020-07-01", selesai: "2021-06-30" };
const TAHUN_BARU = { nama: "2099/2100", mulai: "2099-07-01", selesai: "2100-06-30" };

async function seedPengguna(kodeRole: string, status = "AKTIF"): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Uji Siklus', 'siklus-${randomUUID()}@sekolah.sch.id', 'x',
                'NIPSIKLUS${randomUUID().replace(/-/g, "").slice(0, 16)}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false)
        RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
    return Number(baris.id);
}

async function seedUnit(kode: string, jenis = "KELAS", status = "AKTIF"): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO work_units (nama, kode, jenis, status)
        VALUES ('Unit ${kode}', '${kode}', '${jenis}', '${status}') RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan unit uji");
    return Number(baris.id);
}

/** Tahun ajaran pertama wajib aktif (SDD-DB-18); yang berikutnya tidak. */
async function seedTahun(t: { nama: string; mulai: string; selesai: string }, aktif: boolean): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai, is_active)
        VALUES ('${t.nama}', '${t.mulai}', '${t.selesai}', ${aktif}) RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan tahun ajaran uji");
    return Number(baris.id);
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map([
            ["user.view", "all"],
            ["user.update", "all"],
        ]),
    });
}

const audit = () => new AuditLogger({ clock: new FixedClock(WAKTU) });
const logger = () => new Logger({ clock: new FixedClock(WAKTU), tulis: () => undefined });

function buatRegistri(kewajiban: readonly { jenis: string; keterangan: string }[] = []): StudentObligationRegistry {
    return new StudentObligationRegistry().register({
        nama: "uji",
        daftarKewajiban: () => Promise.resolve(kewajiban),
    });
}

const PINJAMAN = { jenis: "PEMINJAMAN_AKTIF", keterangan: "Masih meminjam 1 unit." };

async function jumlahLog(aksi: string, entitasId: string): Promise<number> {
    const [baris] = await kueri<{ n: string }>(`
        SELECT count(*)::text AS n FROM activity_logs
         WHERE modul = 'm02-users' AND aksi = '${aksi}' AND entitas_id = '${entitasId}'`);
    return Number(baris?.n ?? 0);
}

async function barisEnrollment(userId: number, tahunId: number) {
    const [baris] = await kueri<{ id: string; kelas_id: string; lulus: boolean }>(`
        SELECT id::text, kelas_id::text, lulus FROM student_enrollments
         WHERE user_id = ${userId} AND academic_year_id = ${tahunId}`);
    return baris;
}

async function statusPengguna(userId: number): Promise<string | undefined> {
    const [baris] = await kueri<{ status: string }>(`SELECT status::text FROM users WHERE id = ${userId}`);
    return baris?.status;
}

describe.skipIf(!ADA_DB)("PR-01-13 — siklus akun siswa (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    // Urutan mengikuti FK: enrollment -> pengguna & unit -> tahun ajaran.
    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM student_enrollments");
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
        await kueri("DELETE FROM academic_terms");
        await kueri("DELETE FROM academic_years");
    }
    beforeEach(bersihkan);
    afterEach(bersihkan);

    function promosi(registri = new StudentObligationRegistry()): ClassPromotionService {
        return new ClassPromotionService(getDb(), audit(), logger(), registri);
    }

    it("SL-01: satu baris per siswa per tahun ajaran — UNIQUE (user_id, academic_year_id); kelas wajib unit yang ada", async () => {
        const tahun = await seedTahun(TAHUN_LAMA, true);
        const siswa = await seedPengguna("R-07");
        const kelas = await seedUnit("7A");
        await kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id) VALUES (${siswa}, ${tahun}, ${kelas})`);

        await expect(
            kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id) VALUES (${siswa}, ${tahun}, ${kelas})`),
        ).rejects.toMatchObject({ code: "23505", constraint: "student_enrollments_siswa_tahun_uq" });
        const siswa2 = await seedPengguna("R-07");
        await expect(
            kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id) VALUES (${siswa2}, ${tahun}, 999999999)`),
        ).rejects.toMatchObject({ code: "23503" });
    });

    it("SL-02 NAIK: menetapkan kelas pada tahun ajaran itu, tercatat STUDENT_ENROLLMENT_SET; kelas yang sama tidak menulis ulang", async () => {
        const admin = await seedPengguna("R-01");
        const tahun = await seedTahun(TAHUN_BARU, true);
        const siswa = await seedPengguna("R-07");
        const kelasA = await seedUnit("7A");
        const kelasB = await seedUnit("8A");
        const naik = (kelasId: number): PromotionItem[] => [{ userId: siswa, tindakan: "NAIK", kelasId }];

        const hasil = await promosi().promote(buatCtx(admin), tahun, naik(kelasA));
        expect(hasil).toMatchObject({ total: 1, sukses: 1, gagal: 0 });
        const baris = await barisEnrollment(siswa, tahun);
        expect(baris).toMatchObject({ kelas_id: String(kelasA), lulus: false });
        expect(await jumlahLog("STUDENT_ENROLLMENT_SET", baris!.id)).toBe(1);

        await promosi().promote(buatCtx(admin), tahun, naik(kelasA));
        expect(await jumlahLog("STUDENT_ENROLLMENT_SET", baris!.id)).toBe(1); // tanpa perubahan, tanpa log

        await promosi().promote(buatCtx(admin), tahun, naik(kelasB));
        expect(await barisEnrollment(siswa, tahun)).toMatchObject({ id: baris!.id, kelas_id: String(kelasB) });
        expect(await jumlahLog("STUDENT_ENROLLMENT_SET", baris!.id)).toBe(2);
    });

    it("SL-02: satu siswa gagal tidak menggagalkan yang lain, dan alasannya dilaporkan per siswa", async () => {
        const admin = await seedPengguna("R-01");
        const tahun = await seedTahun(TAHUN_BARU, true);
        const baik = await seedPengguna("R-07");
        const guru = await seedPengguna("R-05");
        const nonaktif = await seedPengguna("R-07", "NONAKTIF");
        const kelas = await seedUnit("7A");
        const bukanKelas = await seedUnit("TU", "TATA_USAHA");
        const kelasMati = await seedUnit("LAMA", "KELAS", "NONAKTIF");

        const hasil = await promosi().promote(buatCtx(admin), tahun, [
            { userId: guru, tindakan: "NAIK", kelasId: kelas },
            { userId: nonaktif, tindakan: "NAIK", kelasId: kelas },
            { userId: 999999999, tindakan: "NAIK", kelasId: kelas },
            { userId: baik, tindakan: "NAIK", kelasId: bukanKelas },
            { userId: baik, tindakan: "NAIK", kelasId: kelasMati },
            { userId: baik, tindakan: "NAIK", kelasId: 999999999 },
            { userId: baik, tindakan: "NAIK", kelasId: kelas },
        ]);

        expect(hasil.baris.map((b) => b.pesan)).toEqual([
            "Bukan akun siswa.",
            "Akun siswa tidak aktif.",
            "Pengguna tidak ditemukan.",
            "Unit kerja itu bukan kelas.",
            "Kelas tidak aktif.",
            "Kelas tidak ditemukan.",
            null,
        ]);
        expect(hasil).toMatchObject({ total: 7, sukses: 1, gagal: 6 });
        expect(await barisEnrollment(baik, tahun)).toMatchObject({ kelas_id: String(kelas) });
    });

    it("tahun ajaran tidak dikenal menolak SELURUH permintaan; melebihi batas item ditolak sebelum diproses", async () => {
        const admin = await seedPengguna("R-01");
        const siswa = await seedPengguna("R-07");
        await seedTahun(TAHUN_BARU, true);
        const kelas = await seedUnit("7A");

        await expect(
            promosi().promote(buatCtx(admin), 999999999, [{ userId: siswa, tindakan: "NAIK", kelasId: kelas }]),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "academic_year_id" } });

        const terlalu = Array.from({ length: 201 }, () => ({ userId: siswa, tindakan: "LULUS" }) as const);
        await expect(promosi().promote(buatCtx(admin), 1, terlalu)).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
    });

    it("SL-02 LULUS: wajib sudah punya kelas pada tahun itu; menandai tercatat, idempoten; NAIK sesudahnya mencabut tanda", async () => {
        const admin = await seedPengguna("R-01");
        const tahun = await seedTahun(TAHUN_LAMA, true);
        const siswa = await seedPengguna("R-07");
        const kelas = await seedUnit("9A");
        const service = promosi();

        const tanpaKelas = await service.promote(buatCtx(admin), tahun, [{ userId: siswa, tindakan: "LULUS" }]);
        expect(tanpaKelas.baris[0]?.pesan).toBe(
            "Siswa belum memiliki kelas pada tahun ajaran ini; tetapkan kelas (NAIK) lebih dulu.",
        );

        await service.promote(buatCtx(admin), tahun, [{ userId: siswa, tindakan: "NAIK", kelasId: kelas }]);
        const hasil = await service.promote(buatCtx(admin), tahun, [{ userId: siswa, tindakan: "LULUS" }]);
        expect(hasil.sukses).toBe(1);
        const baris = (await barisEnrollment(siswa, tahun))!;
        expect(baris.lulus).toBe(true);
        expect(await jumlahLog("STUDENT_MARKED_GRADUATED", baris.id)).toBe(1);

        await service.promote(buatCtx(admin), tahun, [{ userId: siswa, tindakan: "LULUS" }]);
        expect(await jumlahLog("STUDENT_MARKED_GRADUATED", baris.id)).toBe(1); // idempoten

        await service.promote(buatCtx(admin), tahun, [{ userId: siswa, tindakan: "NAIK", kelasId: kelas }]);
        expect((await barisEnrollment(siswa, tahun))!.lulus).toBe(false);
    });

    it("SL-04: penandaan lulus menampilkan kewajiban siswa (dari titik ekstensi) tanpa menggagalkan penandaan", async () => {
        const admin = await seedPengguna("R-01");
        const tahun = await seedTahun(TAHUN_LAMA, true);
        const siswa = await seedPengguna("R-07");
        const kelas = await seedUnit("9A");
        const service = promosi(buatRegistri([PINJAMAN]));

        await service.promote(buatCtx(admin), tahun, [{ userId: siswa, tindakan: "NAIK", kelasId: kelas }]);
        const hasil = await service.promote(buatCtx(admin), tahun, [{ userId: siswa, tindakan: "LULUS" }]);

        expect(hasil.baris[0]).toMatchObject({ status: "SUKSES", kewajiban: [PINJAMAN] });
        expect((await barisEnrollment(siswa, tahun))!.lulus).toBe(true);
    });

    describe("SL-03 — penonaktifan lulusan setelah tahun ajaran berakhir", () => {
        async function lulusan(tahun: number): Promise<number> {
            const siswa = await seedPengguna("R-07");
            const kelas = await seedUnit(`K-${randomUUID().slice(0, 6)}`);
            await kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id, lulus)
                         VALUES (${siswa}, ${tahun}, ${kelas}, true)`);
            return siswa;
        }
        const graduation = (registri = new StudentObligationRegistry()) =>
            new GraduationService(getDb(), audit(), registri);

        it("dinonaktifkan HANYA bila tanggal_selesai < hari ini; akun tidak dihapus; idempoten (JOB-03)", async () => {
            const admin = await seedPengguna("R-01");
            const tahun = await seedTahun(TAHUN_LAMA, true); // selesai 2021-06-30
            const lulus = await lulusan(tahun);
            const tidakLulus = await seedPengguna("R-07");
            const kelas = await seedUnit("KLS");
            await kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id) VALUES (${tidakLulus}, ${tahun}, ${kelas})`);

            // Hari terakhir tahun ajaran: belum berakhir.
            expect(await graduation().deactivateDueGraduates(buatCtx(admin), "2021-06-30")).toMatchObject({
                diproses: 0,
                dinonaktifkan: 0,
            });
            expect(await statusPengguna(lulus)).toBe("AKTIF");

            const hasil = await graduation().deactivateDueGraduates(buatCtx(admin), "2021-07-01");
            expect(hasil).toMatchObject({ diproses: 1, dinonaktifkan: 1, terblokir: [] });
            expect(await statusPengguna(lulus)).toBe("NONAKTIF");
            expect(await statusPengguna(tidakLulus)).toBe("AKTIF");
            expect(await jumlahLog("STUDENT_GRADUATION_DEACTIVATED", String(lulus))).toBe(1);
            expect(await kueri(`SELECT 1 FROM users WHERE id = ${lulus}`)).toHaveLength(1);

            expect(await graduation().deactivateDueGraduates(buatCtx(admin), "2021-07-01")).toMatchObject({ diproses: 0 });
        });

        it("SL-04: lulusan berkewajiban TIDAK dinonaktifkan dan daftarnya dikembalikan", async () => {
            const admin = await seedPengguna("R-01");
            const tahun = await seedTahun(TAHUN_LAMA, true);
            const lulus = await lulusan(tahun);

            const hasil = await graduation(buatRegistri([PINJAMAN])).deactivateDueGraduates(buatCtx(admin), "2021-07-01");

            expect(hasil).toMatchObject({ diproses: 1, dinonaktifkan: 0, terblokir: [{ userId: lulus, kewajiban: [PINJAMAN] }] });
            expect(await statusPengguna(lulus)).toBe("AKTIF");
        });
    });

    describe("SL-04 — penonaktifan siswa lewat UserService.updateStatus", () => {
        const nonaktifkan = { status: "NONAKTIF", alasan: "Uji" } as const;

        it("siswa berkewajiban ditolak dengan daftar kewajibannya; status tidak berubah", async () => {
            const admin = await seedPengguna("R-01");
            const siswa = await seedPengguna("R-07");
            const service = new UserService(getDb(), audit(), buatRegistri([PINJAMAN]));

            await expect(service.updateStatus(buatCtx(admin), siswa, nonaktifkan)).rejects.toMatchObject({
                kode: "VALIDATION_ERROR",
                detail: { rule: "SL-04", kewajiban: [PINJAMAN] },
            });
            expect(await statusPengguna(siswa)).toBe("AKTIF");
        });

        it("pemeriksa hanya berlaku bagi akun SISWA — guru tetap dapat dinonaktifkan", async () => {
            const admin = await seedPengguna("R-01");
            const guru = await seedPengguna("R-05");
            const service = new UserService(getDb(), audit(), buatRegistri([PINJAMAN]));

            await service.updateStatus(buatCtx(admin), guru, nonaktifkan);
            expect(await statusPengguna(guru)).toBe("NONAKTIF");
        });

        it("registri KOSONG tidak memblokir — titik ekstensi tanpa pemeriksa berarti belum ada definisi kewajiban (menunggu PR-05-09)", async () => {
            const admin = await seedPengguna("R-01");
            const siswa = await seedPengguna("R-07");
            const service = new UserService(getDb(), audit(), new StudentObligationRegistry());

            await service.updateStatus(buatCtx(admin), siswa, nonaktifkan);
            expect(await statusPengguna(siswa)).toBe("NONAKTIF");
        });
    });

    describe("POST /class-promotions lewat HTTP", () => {
        const server: { instance: ReturnType<typeof createServer> | undefined } = { instance: undefined };
        afterEach(async () => {
            if (server.instance !== undefined) {
                await new Promise((r) => server.instance?.close(r));
                server.instance = undefined;
            }
        });

        function buatApp(ctx: AuthContext): Express {
            const app = express();
            app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
            app.use((_req, res, next) => {
                setAuthContext(res, ctx);
                next();
            });
            const batasi = (): RequestHandler => (_req, _res, next) => next();
            app.use("/api/v1", usersRouter({ db: getDb(), penerbitPassword: penerbitPalsu, pengelolaDuaFaktor: pengelolaPalsu, auditLogger: audit(), logger: logger() }, batasi, authorize));
            app.use(
                ujungRantai({
                    limiter: { hit: () => Promise.resolve({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) },
                    logger: logger(),
                }),
            );
            return app;
        }

        async function kirim(ctx: AuthContext, body: unknown): Promise<{ status: number; json: unknown }> {
            const app = buatApp(ctx);
            server.instance = createServer(app);
            await new Promise<void>((r) => server.instance?.listen(0, "127.0.0.1", r));
            const url = `http://127.0.0.1:${String((server.instance.address() as AddressInfo).port)}`;
            const res = await fetch(`${url}/api/v1/class-promotions`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            return { status: res.status, json: await res.json() };
        }

        it("200 dengan laporan per siswa; isi tidak sah → 400 INVALID_REQUEST sebelum service", async () => {
            const admin = await seedPengguna("R-01");
            const tahun = await seedTahun(TAHUN_BARU, true);
            const siswa = await seedPengguna("R-07");
            const kelas = await seedUnit("7A");

            const ok = await kirim(buatCtx(admin), {
                academic_year_id: tahun,
                items: [{ user_id: siswa, tindakan: "NAIK", kelas_id: kelas }],
            });
            expect(ok.status).toBe(200);
            expect(ok.json).toMatchObject({
                success: true,
                data: { total: 1, sukses: 1, gagal: 0, baris: [{ user_id: siswa, tindakan: "NAIK", status: "SUKSES", kewajiban: [] }] },
            });

            // NAIK tanpa kelas_id, dan daftar kosong.
            const tanpaKelas = await kirim(buatCtx(admin), { academic_year_id: tahun, items: [{ user_id: siswa, tindakan: "NAIK" }] });
            expect(tanpaKelas.status).toBe(400);
            expect((await kirim(buatCtx(admin), { academic_year_id: tahun, items: [] })).status).toBe(400);
        });
    });
});
