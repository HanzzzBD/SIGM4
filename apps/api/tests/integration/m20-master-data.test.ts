// Acceptance PR-01-18: "Administrator mengisi kalender akademik dan unit kerja
// lewat aplikasi" (FR-20.1, AC-YR-01, AC-YR-02, WU-01…WU-03, SDD-DB-18,
// SDD-05 §4.7b/§4.7c) terhadap PostgreSQL NYATA, lewat HTTP.
//
// Aktivasi tahun ajaran SENGAJA tidak dibuktikan memicu kenaikan kelas: pemicu
// AC-YR-02 berupa pekerjaan `student-graduation` yang menunggu `SystemAuthContext`
// (PR-02-32) — yang diuji justru bahwa aktivasi TIDAK menyentuh akun/kelas siswa.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Express, RequestHandler } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { settingsRouter } from "../../src/modules/m20-settings/index.js";
import { AcademicYearService } from "../../src/modules/m20-settings/services/academic-year.service.js";
import { CalendarService } from "../../src/modules/m20-settings/services/calendar.service.js";
import { WorkUnitService } from "../../src/modules/m20-settings/services/work-unit.service.js";
import { authorize, createAuthContext, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const T1 = new Date("2026-09-19T03:00:00Z");

const emailUnik = () => `master-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
const nipUnik = () => `NIPMASTER${randomUUID().replace(/-/g, "").slice(0, 14)}`;

async function seedPengguna(kodeRole = "R-01", status = "AKTIF"): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Master', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false)
        RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
    return Number(baris.id);
}

function buatCtx(userId: number, izin: readonly string[] = ["setting.view", "setting.manage"]): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map(izin.map((i) => [i, "all"] as const)),
    });
}

const audit = () => new AuditLogger({ clock: new FixedClock(T1) });
const logger = () => new Logger({ clock: new FixedClock(T1), tulis: () => undefined });

interface Balasan {
    readonly status: number;
    readonly json: { success: boolean; data?: unknown; meta?: unknown; error?: { code: string; detail?: unknown } };
}

const semester = (g: [string, string], n: [string, string]) => [
    { nama: "GANJIL", tanggal_mulai: g[0], tanggal_selesai: g[1] },
    { nama: "GENAP", tanggal_mulai: n[0], tanggal_selesai: n[1] },
];
const tahun = (nama: string, mulai: string, selesai: string, sem = semester([mulai, "2026-12-31"], ["2027-01-02", selesai])) => ({
    nama,
    tanggal_mulai: mulai,
    tanggal_selesai: selesai,
    semester: sem,
});
const TAHUN_A = () => tahun("2026/2027", "2026-07-01", "2027-06-30");
const TAHUN_B = () => tahun("2027/2028", "2027-07-01", "2028-06-30", semester(["2027-07-01", "2027-12-31"], ["2028-01-02", "2028-06-30"]));

describe.skipIf(!ADA_DB)("PR-01-18 — endpoint master data Lampiran E (acceptance)", () => {
    const server: { instance: ReturnType<typeof createServer> | undefined } = { instance: undefined };

    beforeAll(() => {
        dbmate("up");
    });
    // Urutan mengikuti FK. users <-> work_units saling merujuk (work_unit_id, created_by): pengguna
    // dilepas dari unitnya dulu, lalu semua tabel yang created_by-nya menunjuk users dihapus sebelum users.
    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM student_enrollments");
        await kueri("UPDATE users SET work_unit_id = NULL");
        await kueri("DELETE FROM holidays");
        await kueri("DELETE FROM academic_terms");
        await kueri("DELETE FROM academic_years");
        await kueri("DELETE FROM work_units");
        await kueri("DELETE FROM users");
        await kueri("UPDATE work_days SET aktif = (hari BETWEEN 1 AND 6)");
    }
    beforeEach(bersihkan);
    afterEach(async () => {
        if (server.instance !== undefined) {
            await new Promise((r) => server.instance?.close(r));
            server.instance = undefined;
        }
        await bersihkan();
    });
    afterAll(bersihkan);

    async function panggil(ctx: AuthContext | undefined, metode: string, path: string, body?: unknown): Promise<Balasan> {
        const app: Express = express();
        app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
        app.use((_req, res, next) => {
            if (ctx !== undefined) setAuthContext(res, ctx);
            next();
        });
        const batasi = (): RequestHandler => (_req, _res, next) => next();
        app.use("/api/v1", settingsRouter({ db: getDb(), auditLogger: audit() }, batasi, authorize));
        app.use(
            ujungRantai({
                limiter: { hit: () => Promise.resolve({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) },
                logger: logger(),
            }),
        );
        const srv = createServer(app);
        server.instance = srv;
        await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
        const url = `http://127.0.0.1:${String((srv.address() as AddressInfo).port)}`;
        const res = await fetch(`${url}/api/v1${path}`, {
            method: metode,
            headers: { "content-type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const hasil = { status: res.status, json: (await res.json()) as Balasan["json"] };
        await new Promise((r) => srv.close(r));
        server.instance = undefined;
        return hasil;
    }

    // activity_logs append-only dan tak dibersihkan: entri dibatasi pada Administrator uji ini (id baru per uji).
    let pelaku = 0;
    async function log(aksi: string): Promise<{ nilai_sebelum: unknown; nilai_sesudah: unknown; user_id: string | null; entitas_id: string | null }[]> {
        return kueri(`SELECT nilai_sebelum, nilai_sesudah, user_id::text, entitas_id::text FROM activity_logs
                       WHERE aksi = '${aksi}' AND user_id = ${pelaku} ORDER BY id`);
    }
    async function jumlahLog(aksi: string): Promise<number> {
        return (await log(aksi)).length;
    }

    async function admin(): Promise<AuthContext> {
        pelaku = await seedPengguna();
        return buatCtx(pelaku);
    }
    async function idAktif(): Promise<string[]> {
        return (await kueri<{ id: string }>("SELECT id::text FROM academic_years WHERE is_active ORDER BY id")).map((r) => r.id);
    }

    describe("tahun ajaran (AC-YR-01, AC-YR-02)", () => {
        it("AC-YR-01: tahun ajaran pertama otomatis aktif, yang kedua tidak; keduanya dengan semester; tercatat ACADEMIC_YEAR_CREATED", async () => {
            const ctx = await admin();
            const pertama = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const kedua = await panggil(ctx, "POST", "/academic-years", TAHUN_B());

            expect(pertama.status).toBe(201);
            expect(pertama.json.data).toMatchObject({ nama: "2026/2027", is_active: true, semester: [{ nama: "GANJIL" }, { nama: "GENAP" }] });
            expect(kedua.json.data).toMatchObject({ nama: "2027/2028", is_active: false });
            const dicatat = await log("ACADEMIC_YEAR_CREATED");
            expect(dicatat).toHaveLength(2);
            expect(dicatat[0]).toMatchObject({ user_id: String(ctx.userId), nilai_sebelum: null });
            expect(dicatat[0]?.nilai_sesudah).toMatchObject({ nama: "2026/2027", is_active: true, semester: [{ nama: "GANJIL" }, { nama: "GENAP" }] });
        });

        it("GET /academic-years: daftar dengan semester, terpaginasi, terbaru lebih dulu", async () => {
            const ctx = await admin();
            await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            await panggil(ctx, "POST", "/academic-years", TAHUN_B());

            const hasil = await panggil(buatCtx(ctx.userId, ["setting.view"]), "GET", "/academic-years?per_page=1");
            expect(hasil.status).toBe(200);
            expect((hasil.json.data as { nama: string; semester: unknown[] }[]).map((t) => [t.nama, t.semester.length])).toEqual([["2027/2028", 2]]);
            expect(hasil.json.meta).toEqual({ page: 1, per_page: 1, total: 2, total_pages: 2 });
        });

        it("validasi: nama ganda 409, rentang beririsan 422, semester di luar tahun / beririsan / mulai >= selesai 422; tidak ada baris tersisa", async () => {
            const ctx = await admin();
            await panggil(ctx, "POST", "/academic-years", TAHUN_A());

            const ganda = await panggil(ctx, "POST", "/academic-years", { ...TAHUN_B(), nama: "2026/2027" });
            expect(ganda.status).toBe(409);
            expect(ganda.json.error).toMatchObject({ code: "DUPLICATE_CODE" });

            const irisan = await panggil(ctx, "POST", "/academic-years", tahun("Tumpang", "2027-06-30", "2028-06-30", semester(["2027-06-30", "2027-12-31"], ["2028-01-02", "2028-06-30"])));
            expect(irisan.status).toBe(422);
            expect(irisan.json.error?.code).toBe("VALIDATION_ERROR");

            const luar = await panggil(ctx, "POST", "/academic-years", tahun("Luar", "2027-07-01", "2028-06-30", semester(["2027-06-01", "2027-12-31"], ["2028-01-02", "2028-06-30"])));
            expect(luar.status).toBe(422);

            const beririsan = await panggil(ctx, "POST", "/academic-years", tahun("Berimpit", "2027-07-01", "2028-06-30", semester(["2027-07-01", "2028-01-10"], ["2028-01-05", "2028-06-30"])));
            expect(beririsan.status).toBe(422);

            const terbalik = await panggil(ctx, "POST", "/academic-years", tahun("Terbalik", "2028-07-01", "2028-06-30", semester(["2028-07-01", "2028-12-31"], ["2029-01-02", "2029-06-30"])));
            expect(terbalik.status).toBe(422);

            const [n] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM academic_years");
            expect(n?.n).toBe("1");
        });

        it("bentuk body: semester harus tepat satu GANJIL dan satu GENAP (dua Ganjil / satu semester → 400)", async () => {
            const ctx = await admin();
            const duaGanjil = { ...TAHUN_A(), semester: [TAHUN_A().semester[0], TAHUN_A().semester[0]] };
            const satu = { ...TAHUN_A(), semester: [TAHUN_A().semester[0]] };
            expect((await panggil(ctx, "POST", "/academic-years", duaGanjil)).status).toBe(400);
            expect((await panggil(ctx, "POST", "/academic-years", satu)).status).toBe(400);
        });

        it("PUT mengganti nama, rentang, dan semester; menukar rentang Ganjil/Genap tidak tersandung constraint per baris; tercatat nilai lama/baru", async () => {
            const ctx = await admin();
            const dibuat = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const id = (dibuat.json.data as { id: string }).id;

            const diubah = await panggil(
                ctx,
                "PUT",
                `/academic-years/${id}`,
                // Ganjil dipindah ke rentang yang tadinya milik Genap dan sebaliknya.
                tahun("2026/2027 rev", "2026-07-01", "2027-06-30", [
                    { nama: "GANJIL", tanggal_mulai: "2027-01-02", tanggal_selesai: "2027-06-30" },
                    { nama: "GENAP", tanggal_mulai: "2026-07-01", tanggal_selesai: "2026-12-31" },
                ]),
            );

            expect(diubah.status).toBe(200);
            expect(diubah.json.data).toMatchObject({ id, nama: "2026/2027 rev", is_active: true });
            const [entri] = await log("ACADEMIC_YEAR_UPDATED");
            expect(entri?.nilai_sebelum).toMatchObject({ nama: "2026/2027" });
            expect(entri?.nilai_sesudah).toMatchObject({ nama: "2026/2027 rev" });
        });

        it("PUT tanpa perubahan tidak menulis log; PUT id tak dikenal → 404; PUT tidak mengubah tahun aktif", async () => {
            const ctx = await admin();
            const a = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const b = await panggil(ctx, "POST", "/academic-years", TAHUN_B());
            const idA = (a.json.data as { id: string }).id;
            const idB = (b.json.data as { id: string }).id;

            expect((await panggil(ctx, "PUT", `/academic-years/${idA}`, TAHUN_A())).status).toBe(200);
            expect(await jumlahLog("ACADEMIC_YEAR_UPDATED")).toBe(0);
            expect((await panggil(ctx, "PUT", "/academic-years/999999", TAHUN_A())).status).toBe(404);

            await panggil(ctx, "PUT", `/academic-years/${idB}`, { ...TAHUN_B(), nama: "2027/2028 rev" });
            expect(await idAktif()).toEqual([idA]);
        });

        it("PUT tidak boleh membuat rentang beririsan dengan tahun ajaran lain (kecuali dirinya sendiri)", async () => {
            const ctx = await admin();
            await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const b = await panggil(ctx, "POST", "/academic-years", TAHUN_B());
            const idB = (b.json.data as { id: string }).id;

            const tumpang = await panggil(ctx, "PUT", `/academic-years/${idB}`, tahun("2027/2028", "2027-06-30", "2028-06-30", semester(["2027-06-30", "2027-12-31"], ["2028-01-02", "2028-06-30"])));
            expect(tumpang.status).toBe(422);
        });

        it("AC-YR-02 / SDD-DB-18: PATCH activate menukar tahun aktif dalam satu transaksi; tepat satu aktif; tercatat sebelum & sesudah", async () => {
            const ctx = await admin();
            const a = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const b = await panggil(ctx, "POST", "/academic-years", TAHUN_B());
            const idA = (a.json.data as { id: string }).id;
            const idB = (b.json.data as { id: string }).id;

            const hasil = await panggil(ctx, "PATCH", `/academic-years/${idB}/activate`);

            expect(hasil.status).toBe(200);
            expect(hasil.json.data).toMatchObject({ id: idB, is_active: true });
            expect(await idAktif()).toEqual([idB]);
            const [entri] = await log("ACADEMIC_YEAR_ACTIVATED");
            expect(entri?.nilai_sebelum).toMatchObject({ id: idA, nama: "2026/2027" });
            expect(entri?.nilai_sesudah).toMatchObject({ id: idB, nama: "2027/2028" });
        });

        it("activate: tahun yang sudah aktif idempoten tanpa log; id tak dikenal → 404; tanpa setting.manage → 403", async () => {
            const ctx = await admin();
            const a = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const idA = (a.json.data as { id: string }).id;

            expect((await panggil(ctx, "PATCH", `/academic-years/${idA}/activate`)).status).toBe(200);
            expect(await jumlahLog("ACADEMIC_YEAR_ACTIVATED")).toBe(0);
            expect((await panggil(ctx, "PATCH", "/academic-years/999999/activate")).status).toBe(404);
            expect((await panggil(buatCtx(ctx.userId, ["setting.view"]), "PATCH", `/academic-years/${idA}/activate`)).status).toBe(403);
            expect(await idAktif()).toEqual([idA]);
        });

        it("aktivasi TIDAK menyentuh akun maupun kelas siswa (pemicu AC-YR-02 bukan bagian PR ini)", async () => {
            const ctx = await admin();
            const a = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const b = await panggil(ctx, "POST", "/academic-years", TAHUN_B());
            const siswa = await seedPengguna("R-07");
            const [unit] = await kueri<{ id: string }>(`INSERT INTO work_units (nama, kode, jenis) VALUES ('X-1', 'X1', 'KELAS') RETURNING id::text`);
            await kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id, lulus) VALUES (${siswa}, ${(a.json.data as { id: string }).id}, ${unit?.id}, true)`);

            await panggil(ctx, "PATCH", `/academic-years/${(b.json.data as { id: string }).id}/activate`);

            const [akun] = await kueri<{ status: string }>(`SELECT status FROM users WHERE id = ${siswa}`);
            const [enrol] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM student_enrollments WHERE lulus");
            expect(akun?.status).toBe("AKTIF");
            expect(enrol?.n).toBe("1");
        });

        it("konkurensi: dua pembuatan bersamaan pada tabel kosong → tepat satu aktif dan keduanya berhasil (kunci kalender)", async () => {
            const ctx = await admin();

            const [x, y] = await Promise.all([
                panggil(ctx, "POST", "/academic-years", TAHUN_A()),
                panggil(ctx, "POST", "/academic-years", TAHUN_B()),
            ]);

            expect([x.status, y.status]).toEqual([201, 201]);
            expect(await idAktif()).toHaveLength(1);
        });

        it("konkurensi: dua aktivasi bersamaan → tepat satu aktif di akhir, tanpa galat", async () => {
            const ctx = await admin();
            const a = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const b = await panggil(ctx, "POST", "/academic-years", TAHUN_B());
            const c = await panggil(ctx, "POST", "/academic-years", tahun("2028/2029", "2028-07-01", "2029-06-30", semester(["2028-07-01", "2028-12-31"], ["2029-01-02", "2029-06-30"])));
            void a;

            const hasil = await Promise.all([
                panggil(ctx, "PATCH", `/academic-years/${(b.json.data as { id: string }).id}/activate`),
                panggil(ctx, "PATCH", `/academic-years/${(c.json.data as { id: string }).id}/activate`),
            ]);

            expect(hasil.map((h) => h.status)).toEqual([200, 200]);
            expect(await idAktif()).toHaveLength(1);
        });
    });

    describe("hari libur (CAL-01)", () => {
        it("CRUD: buat (academic_year_id opsional), sunting, hapus; masing-masing tercatat dengan nilai lama/baru", async () => {
            const ctx = await admin();
            const th = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const idTahun = Number((th.json.data as { id: string }).id);

            const nasional = await panggil(ctx, "POST", "/holidays", { tanggal: "2026-08-17", nama: "HUT RI", jenis: "NASIONAL" });
            const sekolah = await panggil(ctx, "POST", "/holidays", { tanggal: "2026-10-01", nama: "Dies Natalis", jenis: "SEKOLAH", academic_year_id: idTahun });
            expect(nasional.status).toBe(201);
            expect(nasional.json.data).toMatchObject({ academic_year_id: null });
            expect(sekolah.json.data).toMatchObject({ academic_year_id: String(idTahun) });

            const id = (sekolah.json.data as { id: string }).id;
            const diubah = await panggil(ctx, "PUT", `/holidays/${id}`, { tanggal: "2026-10-02", nama: "Dies Natalis (geser)", jenis: "SEKOLAH", academic_year_id: idTahun });
            expect(diubah.json.data).toMatchObject({ tanggal: "2026-10-02", nama: "Dies Natalis (geser)" });
            const [ubah] = await log("HOLIDAY_UPDATED");
            expect(ubah?.nilai_sebelum).toMatchObject({ tanggal: "2026-10-01" });
            expect(ubah?.nilai_sesudah).toMatchObject({ tanggal: "2026-10-02" });

            expect((await panggil(ctx, "DELETE", `/holidays/${id}`)).status).toBe(200);
            const [hapus] = await log("HOLIDAY_DELETED");
            expect(hapus?.nilai_sebelum).toMatchObject({ nama: "Dies Natalis (geser)" });
            expect(await jumlahLog("HOLIDAY_CREATED")).toBe(2);
            const [sisa] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM holidays");
            expect(sisa?.n).toBe("1");
        });

        it("tanggal ganda → 409; tahun ajaran tak dikenal → 422; id tak dikenal → 404 (sunting & hapus)", async () => {
            const ctx = await admin();
            await panggil(ctx, "POST", "/holidays", { tanggal: "2026-08-17", nama: "HUT RI", jenis: "NASIONAL" });

            const ganda = await panggil(ctx, "POST", "/holidays", { tanggal: "2026-08-17", nama: "Lagi", jenis: "SEKOLAH" });
            expect(ganda.status).toBe(409);
            expect(ganda.json.error).toMatchObject({ code: "DUPLICATE_CODE" });
            const tahunGaib = await panggil(ctx, "POST", "/holidays", { tanggal: "2026-08-18", nama: "X", jenis: "SEKOLAH", academic_year_id: 999999 });
            expect(tahunGaib.status).toBe(422);
            expect((await panggil(ctx, "PUT", "/holidays/999999", { tanggal: "2026-08-19", nama: "X", jenis: "SEKOLAH" })).status).toBe(404);
            expect((await panggil(ctx, "DELETE", "/holidays/999999")).status).toBe(404);
            expect(await jumlahLog("HOLIDAY_DELETED")).toBe(0);
        });

        it("menyunting ke tanggal milik hari libur lain → 409; menyimpan tanpa perubahan tidak mengulang log", async () => {
            const ctx = await admin();
            await panggil(ctx, "POST", "/holidays", { tanggal: "2026-08-17", nama: "A", jenis: "NASIONAL" });
            const b = await panggil(ctx, "POST", "/holidays", { tanggal: "2026-08-18", nama: "B", jenis: "NASIONAL" });
            const id = (b.json.data as { id: string }).id;

            expect((await panggil(ctx, "PUT", `/holidays/${id}`, { tanggal: "2026-08-17", nama: "B", jenis: "NASIONAL" })).status).toBe(409);
            expect((await panggil(ctx, "PUT", `/holidays/${id}`, { tanggal: "2026-08-18", nama: "B", jenis: "NASIONAL" })).status).toBe(200);
            expect(await jumlahLog("HOLIDAY_UPDATED")).toBe(0);
        });

        it("GET /holidays: terurut tanggal, difilter filter[academic_year_id], terpaginasi", async () => {
            const ctx = await admin();
            const th = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const idTahun = Number((th.json.data as { id: string }).id);
            await panggil(ctx, "POST", "/holidays", { tanggal: "2026-10-01", nama: "B", jenis: "SEKOLAH", academic_year_id: idTahun });
            await panggil(ctx, "POST", "/holidays", { tanggal: "2026-08-17", nama: "A", jenis: "NASIONAL" });

            const semua = await panggil(buatCtx(ctx.userId, ["setting.view"]), "GET", "/holidays");
            expect((semua.json.data as { nama: string }[]).map((h) => h.nama)).toEqual(["A", "B"]);
            const perTahun = await panggil(buatCtx(ctx.userId, ["setting.view"]), "GET", `/holidays?filter[academic_year_id]=${idTahun}`);
            expect((perTahun.json.data as { nama: string }[]).map((h) => h.nama)).toEqual(["B"]);
            expect(perTahun.json.meta).toMatchObject({ total: 1 });
        });
    });

    describe("hari kerja (CAL-01)", () => {
        const pekan = (aktif: readonly number[]) => ({ hari_kerja: [1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: aktif.includes(hari) })) });

        it("GET membaca bawaan Senin–Sabtu aktif; PUT memperbarui dan mencatat WORK_DAYS_UPDATED dengan nilai lama/baru", async () => {
            const ctx = await admin();
            const awal = await panggil(ctx, "GET", "/work-days");
            expect((awal.json.data as { hari: number; aktif: boolean }[]).filter((h) => h.aktif).map((h) => h.hari)).toEqual([1, 2, 3, 4, 5, 6]);

            const hasil = await panggil(ctx, "PUT", "/work-days", pekan([1, 2, 3, 4, 5]));

            expect(hasil.status).toBe(200);
            expect((hasil.json.data as { hari: number; aktif: boolean }[]).filter((h) => h.aktif).map((h) => h.hari)).toEqual([1, 2, 3, 4, 5]);
            const [entri] = await log("WORK_DAYS_UPDATED");
            expect(JSON.stringify(entri?.nilai_sebelum)).toContain('"hari":6,"aktif":true');
            expect(JSON.stringify(entri?.nilai_sesudah)).toContain('"hari":6,"aktif":false');
        });

        it("semua hari nonaktif → 422 dan tidak ada yang berubah; ketujuh hari wajib tepat sekali (400)", async () => {
            const ctx = await admin();

            const kosong = await panggil(ctx, "PUT", "/work-days", pekan([]));
            expect(kosong.status).toBe(422);
            expect(kosong.json.error).toMatchObject({ code: "VALIDATION_ERROR" });
            const [aktif] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM work_days WHERE aktif");
            expect(aktif?.n).toBe("6");

            const kurang = { hari_kerja: [1, 2, 3].map((hari) => ({ hari, aktif: true })) };
            expect((await panggil(ctx, "PUT", "/work-days", kurang)).status).toBe(400);
            const ganda = { hari_kerja: [1, 1, 1, 1, 1, 1, 1].map((hari) => ({ hari, aktif: true })) };
            expect((await panggil(ctx, "PUT", "/work-days", ganda)).status).toBe(400);
        });

        it("PUT tanpa perubahan tidak mencatat log", async () => {
            const ctx = await admin();
            expect((await panggil(ctx, "PUT", "/work-days", pekan([1, 2, 3, 4, 5, 6]))).status).toBe(200);
            expect(await jumlahLog("WORK_DAYS_UPDATED")).toBe(0);
        });
    });

    describe("unit kerja (WU-01, WU-02)", () => {
        const unit = (o: Record<string, unknown> = {}) => ({ nama: "Tata Usaha", kode: "TU-01", jenis: "TATA_USAHA", ...o });

        it("buat lahir AKTIF; sunting; tercatat WORK_UNIT_CREATED/UPDATED dengan nilai lama/baru", async () => {
            const ctx = await admin();
            const dibuat = await panggil(ctx, "POST", "/work-units", unit());
            expect(dibuat.status).toBe(201);
            expect(dibuat.json.data).toMatchObject({ nama: "Tata Usaha", kode: "TU-01", jenis: "TATA_USAHA", status: "AKTIF", kepala_unit_id: null });
            const id = (dibuat.json.data as { id: string }).id;

            const diubah = await panggil(ctx, "PUT", `/work-units/${id}`, unit({ nama: "Tata Usaha Utama", kepala_unit_id: ctx.userId }));
            expect(diubah.json.data).toMatchObject({ nama: "Tata Usaha Utama", kepala_unit_id: String(ctx.userId) });
            const [entri] = await log("WORK_UNIT_UPDATED");
            expect(entri?.nilai_sebelum).toMatchObject({ nama: "Tata Usaha", kepala_unit_id: null });
            expect(entri?.nilai_sesudah).toMatchObject({ nama: "Tata Usaha Utama" });
            expect(await jumlahLog("WORK_UNIT_CREATED")).toBe(1);
        });

        it("kode dan nama unik TANPA memandang huruf besar-kecil dan spasi tepi → 409; menyunting diri sendiri tetap boleh", async () => {
            const ctx = await admin();
            const a = await panggil(ctx, "POST", "/work-units", unit());
            const idA = (a.json.data as { id: string }).id;

            const kode = await panggil(ctx, "POST", "/work-units", unit({ nama: "Lain", kode: "  tu-01 " }));
            expect(kode.status).toBe(409);
            expect(kode.json.error).toMatchObject({ code: "DUPLICATE_CODE" });
            const nama = await panggil(ctx, "POST", "/work-units", unit({ nama: "TATA USAHA", kode: "TU-99" }));
            expect(nama.status).toBe(409);

            expect((await panggil(ctx, "PUT", `/work-units/${idA}`, unit({ kode: "TU-01", nama: "tata usaha" }))).status).toBe(200);
        });

        it("kepala unit yang tidak ada → 422; id tak dikenal → 404 (sunting dan status)", async () => {
            const ctx = await admin();
            expect((await panggil(ctx, "POST", "/work-units", unit({ kepala_unit_id: 999999 }))).status).toBe(422);
            expect((await panggil(ctx, "PUT", "/work-units/999999", unit())).status).toBe(404);
            expect((await panggil(ctx, "PATCH", "/work-units/999999/status", { status: "NONAKTIF" })).status).toBe(404);
        });

        it("WU-02: PATCH status menonaktifkan/mengaktifkan; tercatat DEACTIVATED/REACTIVATED; status sama tidak mengulang log; tidak ada DELETE", async () => {
            const ctx = await admin();
            const dibuat = await panggil(ctx, "POST", "/work-units", unit());
            const id = (dibuat.json.data as { id: string }).id;

            const mati = await panggil(ctx, "PATCH", `/work-units/${id}/status`, { status: "NONAKTIF" });
            expect(mati.json.data).toMatchObject({ status: "NONAKTIF" });
            await panggil(ctx, "PATCH", `/work-units/${id}/status`, { status: "NONAKTIF" });
            expect(await jumlahLog("WORK_UNIT_DEACTIVATED")).toBe(1);
            const hidup = await panggil(ctx, "PATCH", `/work-units/${id}/status`, { status: "AKTIF" });
            expect(hidup.json.data).toMatchObject({ status: "AKTIF" });
            const [entri] = await log("WORK_UNIT_REACTIVATED");
            expect(entri?.nilai_sebelum).toMatchObject({ status: "NONAKTIF" });

            expect((await panggil(ctx, "DELETE", `/work-units/${id}`)).status).toBe(404);
            const [ada] = await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM work_units WHERE id = ${id}`);
            expect(ada?.n).toBe("1");
        });

        it("WU-02: unit yang masih dipakai pengguna aktif tetap dapat dinonaktifkan, dan penggunanya tidak kehilangan unit", async () => {
            const ctx = await admin();
            const dibuat = await panggil(ctx, "POST", "/work-units", unit());
            const id = (dibuat.json.data as { id: string }).id;
            await kueri(`UPDATE users SET work_unit_id = ${id} WHERE id = ${ctx.userId}`);

            const mati = await panggil(ctx, "PATCH", `/work-units/${id}/status`, { status: "NONAKTIF" });

            expect(mati.status).toBe(200);
            const [pengguna] = await kueri<{ work_unit_id: string }>(`SELECT work_unit_id::text FROM users WHERE id = ${ctx.userId}`);
            expect(pengguna?.work_unit_id).toBe(id);
        });

        it("SDD-05 §4.7d: jenis KELAS tidak dapat diubah selama dipakai student_enrollments; tanpa enrollment boleh; jenis lain bebas", async () => {
            const ctx = await admin();
            const th = await panggil(ctx, "POST", "/academic-years", TAHUN_A());
            const kelas = await panggil(ctx, "POST", "/work-units", unit({ nama: "X-1", kode: "X1", jenis: "KELAS" }));
            const idKelas = (kelas.json.data as { id: string }).id;
            const bebas = await panggil(ctx, "POST", "/work-units", unit({ nama: "X-2", kode: "X2", jenis: "KELAS" }));
            const siswa = await seedPengguna("R-07");
            await kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id) VALUES (${siswa}, ${(th.json.data as { id: string }).id}, ${idKelas})`);

            const ditolak = await panggil(ctx, "PUT", `/work-units/${idKelas}`, unit({ nama: "X-1", kode: "X1", jenis: "MANAJEMEN" }));
            expect(ditolak.status).toBe(422);
            expect((await panggil(ctx, "PUT", `/work-units/${idKelas}`, unit({ nama: "X-1 baru", kode: "X1", jenis: "KELAS" }))).status).toBe(200);
            const diizinkan = await panggil(ctx, "PUT", `/work-units/${(bebas.json.data as { id: string }).id}`, unit({ nama: "X-2", kode: "X2", jenis: "MANAJEMEN" }));
            expect(diizinkan.status).toBe(200);
        });

        it("GET /work-units: terurut nama, difilter filter[jenis] dan filter[status], terpaginasi", async () => {
            const ctx = await admin();
            await panggil(ctx, "POST", "/work-units", unit({ nama: "Bravo", kode: "B", jenis: "KELAS" }));
            const a = await panggil(ctx, "POST", "/work-units", unit({ nama: "Alfa", kode: "A", jenis: "TATA_USAHA" }));
            await panggil(ctx, "PATCH", `/work-units/${(a.json.data as { id: string }).id}/status`, { status: "NONAKTIF" });
            const baca = buatCtx(ctx.userId, ["setting.view"]);

            const semua = await panggil(baca, "GET", "/work-units");
            expect((semua.json.data as { nama: string }[]).map((u) => u.nama)).toEqual(["Alfa", "Bravo"]);
            const kelas = await panggil(baca, "GET", "/work-units?filter[jenis]=KELAS");
            expect((kelas.json.data as { nama: string }[]).map((u) => u.nama)).toEqual(["Bravo"]);
            const mati = await panggil(baca, "GET", "/work-units?filter[status]=NONAKTIF");
            expect((mati.json.data as { nama: string }[]).map((u) => u.nama)).toEqual(["Alfa"]);
            const halaman = await panggil(baca, "GET", "/work-units?per_page=1&page=2");
            expect(halaman.json.meta).toEqual({ page: 2, per_page: 1, total: 2, total_pages: 2 });
        });
    });

    // Galat HTTP hanya membawa `code` (amplop Bab 17.2 tidak memuat `detail`), sehingga aturan yang
    // dibedakan per isian — dan pemeriksaan di service yang tanpanya constraint basis data tetap
    // menghasilkan kode yang sama (23505 -> DUPLICATE_CODE) — dibuktikan langsung pada service.
    describe("aturan per isian (service)", () => {
        const dgn = (kode: string, field: string) => ({ kode, detail: { field } });
        const masukanTahun = (o: { nama?: string; mulai?: string; selesai?: string; sem?: { nama: "GANJIL" | "GENAP"; tanggalMulai: string; tanggalSelesai: string }[] } = {}) => ({
            nama: o.nama ?? "2026/2027",
            tanggalMulai: o.mulai ?? "2026-07-01",
            tanggalSelesai: o.selesai ?? "2027-06-30",
            semester: o.sem ?? [
                { nama: "GANJIL" as const, tanggalMulai: "2026-07-01", tanggalSelesai: "2026-12-31" },
                { nama: "GENAP" as const, tanggalMulai: "2027-01-02", tanggalSelesai: "2027-06-30" },
            ],
        });

        it("tahun ajaran: nama ganda → nama; irisan rentang → tanggal_mulai; semester di luar / beririsan → semester; mulai >= selesai → tanggal_mulai", async () => {
            const ctx = await admin();
            const layanan = new AcademicYearService(getDb(), audit());
            await layanan.create(ctx, masukanTahun());

            await expect(layanan.create(ctx, masukanTahun({ mulai: "2027-07-01", selesai: "2028-06-30" }))).rejects.toMatchObject(dgn("DUPLICATE_CODE", "nama"));
            await expect(layanan.create(ctx, masukanTahun({ nama: "Lain", mulai: "2027-06-30", selesai: "2028-06-30" }))).rejects.toMatchObject(dgn("VALIDATION_ERROR", "tanggal_mulai"));
            await expect(layanan.create(ctx, masukanTahun({ nama: "Terbalik", mulai: "2028-07-01", selesai: "2028-06-30" }))).rejects.toMatchObject(dgn("VALIDATION_ERROR", "tanggal_mulai"));
            const luar = [
                { nama: "GANJIL" as const, tanggalMulai: "2027-06-01", tanggalSelesai: "2027-12-31" },
                { nama: "GENAP" as const, tanggalMulai: "2028-01-02", tanggalSelesai: "2028-06-30" },
            ];
            await expect(layanan.create(ctx, masukanTahun({ nama: "Luar", mulai: "2027-07-01", selesai: "2028-06-30", sem: luar }))).rejects.toMatchObject(dgn("VALIDATION_ERROR", "semester"));
            const tumpang = [
                { nama: "GANJIL" as const, tanggalMulai: "2027-07-01", tanggalSelesai: "2028-01-10" },
                { nama: "GENAP" as const, tanggalMulai: "2028-01-05", tanggalSelesai: "2028-06-30" },
            ];
            await expect(layanan.create(ctx, masukanTahun({ nama: "Tumpang", mulai: "2027-07-01", selesai: "2028-06-30", sem: tumpang }))).rejects.toMatchObject(dgn("VALIDATION_ERROR", "semester"));
        });

        it("hari libur: tanggal ganda → tanggal; tahun ajaran tak ada → academic_year_id; hari kerja semua nonaktif → hari_kerja", async () => {
            const ctx = await admin();
            const layanan = new CalendarService(getDb(), audit());
            await layanan.createHoliday(ctx, { tanggal: "2026-08-17", nama: "HUT RI", jenis: "NASIONAL", academicYearId: null });

            await expect(layanan.createHoliday(ctx, { tanggal: "2026-08-17", nama: "Lagi", jenis: "SEKOLAH", academicYearId: null })).rejects.toMatchObject(dgn("DUPLICATE_CODE", "tanggal"));
            await expect(layanan.createHoliday(ctx, { tanggal: "2026-08-18", nama: "X", jenis: "SEKOLAH", academicYearId: 999999 })).rejects.toMatchObject(dgn("VALIDATION_ERROR", "academic_year_id"));
            await expect(layanan.updateWorkDays(ctx, [1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: false })))).rejects.toMatchObject(dgn("VALIDATION_ERROR", "hari_kerja"));
        });

        it("unit kerja: kode ganda → kode; nama ganda → nama; kepala tak ada → kepala_unit_id; ganti jenis KELAS yang dipakai → jenis", async () => {
            const ctx = await admin();
            const layanan = new WorkUnitService(getDb(), audit());
            const unit = await layanan.create(ctx, { nama: "X-1", kode: "X1", jenis: "KELAS", kepalaUnitId: null });

            await expect(layanan.create(ctx, { nama: "Lain", kode: " x1 ", jenis: "KELAS", kepalaUnitId: null })).rejects.toMatchObject(dgn("DUPLICATE_CODE", "kode"));
            await expect(layanan.create(ctx, { nama: "x-1", kode: "X9", jenis: "KELAS", kepalaUnitId: null })).rejects.toMatchObject(dgn("DUPLICATE_CODE", "nama"));
            await expect(layanan.create(ctx, { nama: "Baru", kode: "B1", jenis: "KELAS", kepalaUnitId: 999999 })).rejects.toMatchObject(dgn("VALIDATION_ERROR", "kepala_unit_id"));

            const th = await new AcademicYearService(getDb(), audit()).create(ctx, masukanTahun());
            const siswa = await seedPengguna("R-07");
            await kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id) VALUES (${siswa}, ${th.tahun.id}, ${unit.id})`);
            await expect(layanan.update(ctx, Number(unit.id), { nama: "X-1", kode: "X1", jenis: "MANAJEMEN", kepalaUnitId: null })).rejects.toMatchObject(dgn("VALIDATION_ERROR", "jenis"));
        });
    });

    describe("otorisasi (PM-01, PM-02, SEC-T-01)", () => {
        const tulis: readonly [string, string, unknown][] = [
            ["POST", "/academic-years", TAHUN_A()],
            ["PUT", "/academic-years/1", TAHUN_A()],
            ["PATCH", "/academic-years/1/activate", undefined],
            ["POST", "/holidays", { tanggal: "2026-08-17", nama: "A", jenis: "NASIONAL" }],
            ["PUT", "/holidays/1", { tanggal: "2026-08-17", nama: "A", jenis: "NASIONAL" }],
            ["DELETE", "/holidays/1", undefined],
            ["PUT", "/work-days", { hari_kerja: [1, 2, 3, 4, 5, 6, 7].map((hari) => ({ hari, aktif: true })) }],
            ["POST", "/work-units", { nama: "A", kode: "A", jenis: "KELAS" }],
            ["PUT", "/work-units/1", { nama: "A", kode: "A", jenis: "KELAS" }],
            ["PATCH", "/work-units/1/status", { status: "NONAKTIF" }],
        ];
        const baca: readonly string[] = ["/academic-years", "/holidays", "/work-days", "/work-units"];

        it("setiap endpoint tulis menolak pemegang setting.view saja dengan 403, dan tanpa AuthContext dengan 401 — tanpa efek samping", async () => {
            const id = await seedPengguna();
            const hanyaBaca = buatCtx(id, ["setting.view"]);
            for (const [metode, path, body] of tulis) {
                expect((await panggil(hanyaBaca, metode, path, body)).status, `${metode} ${path} 403`).toBe(403);
                expect((await panggil(undefined, metode, path, body)).status, `${metode} ${path} 401`).toBe(401);
            }
            const [n] = await kueri<{ n: string }>(
                "SELECT (SELECT count(*) FROM academic_years) + (SELECT count(*) FROM holidays) + (SELECT count(*) FROM work_units) AS n",
            );
            expect(Number(n?.n)).toBe(0);
        });

        it("endpoint baca menolak pengguna tanpa setting.view (403) dan tanpa AuthContext (401)", async () => {
            const id = await seedPengguna();
            for (const path of baca) {
                expect((await panggil(buatCtx(id, []), "GET", path)).status, `GET ${path} 403`).toBe(403);
                expect((await panggil(undefined, "GET", path)).status, `GET ${path} 401`).toBe(401);
                expect((await panggil(buatCtx(id, ["setting.view"]), "GET", path)).status, `GET ${path} 200`).toBe(200);
            }
        });
    });
});
