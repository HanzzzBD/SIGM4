// Kontrak amplop galat lintas modul (PRD Bab 17.2, SDD-06 §4.4, SDD-API-04,
// NFR-R-10, SDD-AUTH-08) terhadap PostgreSQL NYATA, lewat HTTP.
//
// Tiga router modul (M-02, M-03, M-20) dipasang pada satu aplikasi dengan ujung
// rantai yang sama. Yang dibuktikan: `error.message` dan `error.details` (larik
// `{ field, message }`) sampai ke klien dari galat domain yang sengaja dituliskan
// — dan hanya itu. Bentuk amplop tidak berubah dan tidak ada modul yang
// menyimpang.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Express, RequestHandler } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { locationsRouter } from "../../src/modules/m03-locations/index.js";
import { settingsRouter } from "../../src/modules/m20-settings/index.js";
import { usersRouter } from "../../src/modules/m02-users/index.js";
import { authorize, createAuthContext, setAuthContext } from "../../src/shared/auth/index.js";
import { ErrorEnvelopeSchema } from "../../src/shared/errors/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";
import { penerbitPalsu, pengelolaPalsu } from "../helpers/auth.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const T1 = new Date("2026-09-19T03:00:00Z");
const NAMA_SISWA = "Budi Rahasia Pribadi";

const emailUnik = () => `kontrak-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
const nipUnik = () => `NIPKONTRAK${randomUUID().replace(/-/g, "").slice(0, 12)}`;

async function seedPengguna(kodeRole: string, opsi: { nama?: string; status?: string } = {}): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('${opsi.nama ?? "Admin Kontrak"}', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${opsi.status ?? "AKTIF"}', false)
        RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
    return Number(baris.id);
}

const IZIN_ADMIN = ["user.view", "user.create", "user.update", "role.view", "role.update", "location.view", "location.manage", "setting.view", "setting.manage"];

function buatCtx(userId: number, izin: readonly string[] = IZIN_ADMIN): AuthContext {
    return createAuthContext({ userId, roleCode: "ADMIN", scopes: new Map(izin.map((i) => [i, "all"] as const)) });
}

const audit = () => new AuditLogger({ clock: new FixedClock(T1) });
const logger = () => new Logger({ clock: new FixedClock(T1), tulis: () => undefined });

interface Galat {
    readonly status: number;
    readonly teks: string;
    readonly body: { success: boolean; error: { code: string; message: string; details?: { field: string; message: string }[] }; request_id: string };
    readonly requestId: string | null;
}

describe.skipIf(!ADA_DB)("Kontrak amplop galat lintas modul (Bab 17.2) — PostgreSQL nyata", () => {
    const server: { instance: ReturnType<typeof createServer> | undefined } = { instance: undefined };

    beforeAll(() => {
        dbmate("up");
    });
    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM user_import_jobs");
        await kueri("UPDATE users SET work_unit_id = NULL");
        await kueri("DELETE FROM rooms");
        await kueri("DELETE FROM areas");
        await kueri("DELETE FROM buildings");
        await kueri("DELETE FROM work_units");
        await kueri("DELETE FROM users");
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

    async function panggil(ctx: AuthContext | undefined, metode: string, path: string, body?: unknown): Promise<Galat> {
        const app: Express = express();
        app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
        app.use((_req, res, next) => {
            if (ctx !== undefined) setAuthContext(res, ctx);
            next();
        });
        const batasi = (): RequestHandler => (_req, _res, next) => next();
        const deps = { db: getDb(), auditLogger: audit() };
        app.use("/api/v1", usersRouter({ ...deps, penerbitPassword: penerbitPalsu, pengelolaDuaFaktor: pengelolaPalsu, logger: logger(), clock: new FixedClock(T1) }, batasi, authorize));
        app.use("/api/v1", locationsRouter(deps, batasi, authorize));
        app.use("/api/v1", settingsRouter(deps, batasi, authorize));
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
        const teks = await res.text();
        const hasil: Galat = { status: res.status, teks, body: JSON.parse(teks), requestId: res.headers.get("x-request-id") };
        await new Promise((r) => srv.close(r));
        server.instance = undefined;
        return hasil;
    }

    /** Bentuk amplop yang berlaku untuk SETIAP galat: tidak ada field di luar Bab 17.2. */
    function harusAmplopBab172(hasil: Galat): void {
        // Skema `strict` yang sama dengan yang diterbitkan OpenAPI: field di luar Bab 17.2 gagal di sini.
        expect(ErrorEnvelopeSchema.safeParse(hasil.body).success).toBe(true);
        expect(hasil.body.request_id).toBe(hasil.requestId);
        expect(hasil.teks).not.toMatch(/\bat \w+.*\(|node_modules|stack|postgres:\/\/|password_hash/);
    }

    async function admin(): Promise<AuthContext> {
        return buatCtx(await seedPengguna("R-01"));
    }
    const idRole = async (kode: string) => Number((await kueri<{ id: string }>(`SELECT id::text FROM roles WHERE kode = '${kode}'`))[0]?.id);

    it("M-02 — email duplikat: 409 DUPLICATE_CODE, pesan tertulis, details[{field:'email'}]", async () => {
        const ctx = await admin();
        const email = emailUnik();
        const badan = { nama: "Guru", email, nip_nis: nipUnik(), role_id: await idRole("R-05") };
        await panggil(ctx, "POST", "/users", badan);

        const hasil = await panggil(ctx, "POST", "/users", { ...badan, nip_nis: nipUnik() });

        expect(hasil.status).toBe(409);
        harusAmplopBab172(hasil);
        expect(hasil.body.error).toEqual({
            code: "DUPLICATE_CODE",
            message: "Email sudah digunakan.",
            details: [{ field: "email", message: "Email sudah digunakan." }],
        });
    });

    it("M-02 — siswa tanpa persetujuan wali: 422, pesan + details[{field:'consent_wali'}]; kunci rule tidak bocor", async () => {
        const ctx = await admin();

        const hasil = await panggil(ctx, "POST", "/users", { nama: NAMA_SISWA, email: emailUnik(), nip_nis: nipUnik(), role_id: await idRole("R-07") });

        expect(hasil.status).toBe(422);
        harusAmplopBab172(hasil);
        expect(hasil.body.error).toEqual({
            code: "VALIDATION_ERROR",
            message: "Akun siswa tidak dapat dibuat: persetujuan wali belum terekam (DP-02).",
            details: [{ field: "consent_wali", message: "Akun siswa tidak dapat dibuat: persetujuan wali belum terekam (DP-02).", }],
        });
        expect(hasil.teks).not.toContain('"rule"');
        expect(hasil.teks).not.toContain(NAMA_SISWA);
    });

    it("M-02 — mengaktifkan siswa tanpa persetujuan: nama siswa TIDAK ada di pesan (data pribadi tidak masuk respons galat)", async () => {
        const ctx = await admin();
        const siswa = await seedPengguna("R-07", { nama: NAMA_SISWA, status: "NONAKTIF" });

        const hasil = await panggil(ctx, "PATCH", `/users/${siswa}/status`, { status: "AKTIF" });

        expect(hasil.status).toBe(422);
        harusAmplopBab172(hasil);
        expect(hasil.body.error.message).toBe("Akun siswa tidak dapat diaktifkan: persetujuan wali belum terekam (DP-02).");
        expect(hasil.teks).not.toContain("Budi");
    });

    it("M-02 — tidak ditemukan: 404 NOT_FOUND dengan pesan tertulis, tanpa details", async () => {
        const hasil = await panggil(await admin(), "GET", "/users/999999");

        expect(hasil.status).toBe(404);
        harusAmplopBab172(hasil);
        expect(hasil.body.error).toEqual({ code: "NOT_FOUND", message: "Pengguna tidak ditemukan." });
    });

    it("M-02 — CORE_PERMISSION_LOCKED (403 aturan bisnis): pesan tertulis sampai, daftar `permissions` internal tidak", async () => {
        const ctx = await admin();

        const hasil = await panggil(ctx, "PUT", `/roles/${await idRole("R-01")}/permissions`, { permissions: [] });

        expect(hasil.status).toBe(403);
        harusAmplopBab172(hasil);
        expect(hasil.body.error.code).toBe("CORE_PERMISSION_LOCKED");
        expect(hasil.body.error.message).toMatch(/^Permission inti tidak dapat dicabut dari Administrator: /);
        expect(hasil.body.error.details).toBeUndefined();
    });

    it("M-02 — impor: header tanpa kolom wajib → 400 INVALID_REQUEST dengan pesan tertulis", async () => {
        const csv = Buffer.from("nama_lengkap,nip_nis\nX,123\n", "utf8").toString("base64");

        const hasil = await panggil(await admin(), "POST", "/users/import", { filename: "pengguna.csv", content_base64: csv });

        expect(hasil.status).toBe(400);
        harusAmplopBab172(hasil);
        expect(hasil.body.error.code).toBe("INVALID_REQUEST");
        expect(hasil.body.error.message).toMatch(/^Kolom wajib hilang pada header: /);
    });

    it("M-03 — kode gedung ganda: 409, details[{field:'kode'}]", async () => {
        const ctx = await admin();
        const badan = { nama: "Gedung A", kode: `GA-${randomUUID().slice(0, 6)}` };
        await panggil(ctx, "POST", "/buildings", badan);

        const hasil = await panggil(ctx, "POST", "/buildings", { ...badan, nama: "Gedung A2" });

        expect(hasil.status).toBe(409);
        harusAmplopBab172(hasil);
        expect(hasil.body.error).toEqual({
            code: "DUPLICATE_CODE",
            message: "Kode lokasi sudah digunakan.",
            details: [{ field: "kode", message: "Kode lokasi sudah digunakan." }],
        });
    });

    it("M-20 — parameter di luar rentang: 422, details satu butir per parameter (FR-20.1 A1: penjelasan batas sampai ke UI)", async () => {
        const hasil = await panggil(await admin(), "PUT", "/settings", {
            settings: { "reservasi.horizon_hari": 100, "reservasi.ttl_tentative_jam": 9999, "tidak.ada": 1 },
        });

        expect(hasil.status).toBe(422);
        harusAmplopBab172(hasil);
        expect(hasil.body.error.message).toBe("Satu atau lebih parameter tidak sah.");
        expect(hasil.body.error.details).toEqual(
            expect.arrayContaining([
                { field: "reservasi.ttl_tentative_jam", message: "Nilai harus antara 1 dan 168." },
                { field: "tidak.ada", message: "Parameter tidak dikenal." },
            ]),
        );
        expect(hasil.body.error.details).toHaveLength(2);
    });

    it("M-20 — tahun ajaran beririsan: 422 dengan alasan yang menyebut tahun yang bentrok", async () => {
        const ctx = await admin();
        const tahun = (nama: string, mulai: string, selesai: string, g: string, n: string) => ({
            nama,
            tanggal_mulai: mulai,
            tanggal_selesai: selesai,
            semester: [
                { nama: "GANJIL", tanggal_mulai: mulai, tanggal_selesai: g },
                { nama: "GENAP", tanggal_mulai: n, tanggal_selesai: selesai },
            ],
        });
        await panggil(ctx, "POST", "/academic-years", tahun("2026/2027", "2026-07-01", "2027-06-30", "2026-12-31", "2027-01-02"));

        const hasil = await panggil(ctx, "POST", "/academic-years", tahun("Tumpang", "2027-06-30", "2028-06-30", "2027-12-31", "2028-01-02"));

        expect(hasil.status).toBe(422);
        harusAmplopBab172(hasil);
        expect(hasil.body.error.details).toEqual([{ field: "tanggal_mulai", message: "Rentang tanggal beririsan dengan tahun ajaran 2026/2027." }]);
        await kueri("DELETE FROM academic_terms");
        await kueri("DELETE FROM academic_years");
    });

    it("otorisasi seragam (SDD-AUTH-08): tanpa AuthContext 401 dan tanpa permission 403 — pesan generik, tanpa details", async () => {
        const id = await seedPengguna("R-01");
        const tanpaKonteks = await panggil(undefined, "GET", "/users/1");
        const tanpaIzin = await panggil(buatCtx(id, []), "GET", "/users/1");

        for (const [hasil, status, kode] of [
            [tanpaKonteks, 401, "UNAUTHENTICATED"],
            [tanpaIzin, 403, "INSUFFICIENT_PERMISSION"],
        ] as const) {
            expect(hasil.status).toBe(status);
            harusAmplopBab172(hasil);
            expect(hasil.body.error).toEqual({ code: kode, message: "Permintaan tidak dapat diproses." });
        }
    });

    it("galat skema (Zod) di modul mana pun: 400 INVALID_REQUEST generik, tanpa details dan tanpa teks Inggris/nilai masukan", async () => {
        const ctx = await admin();
        const kasus: [string, string, unknown][] = [
            ["POST", "/users", { nama: "X", email: "bukan-email-rahasia", nip_nis: "1", role_id: 1 }],
            ["POST", "/buildings", { nama: 5 }],
            ["PUT", "/work-days", { hari_kerja: [{ hari: 9, aktif: "ya" }] }],
        ];
        for (const [metode, path, body] of kasus) {
            const hasil = await panggil(ctx, metode, path, body);
            expect(hasil.status, `${metode} ${path}`).toBe(400);
            harusAmplopBab172(hasil);
            expect(hasil.body.error).toEqual({ code: "INVALID_REQUEST", message: "Permintaan tidak valid." });
            expect(hasil.teks).not.toMatch(/rahasia|Invalid|expected/);
        }
    });
});
