// Acceptance PR-01-02: "CRUD pengguna + soft delete + aturan Administrator
// terakhir" (FR-02.1, BR-067, BR-068 + BR-070a via SDD-05 §4.3). Terhadap
// PostgreSQL NYATA — SELECT ... FOR UPDATE dan activity log tidak dapat
// dibuktikan lewat tiruan.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Express, RequestHandler } from "express";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { usersRouter } from "../../src/modules/m02-users/index.js";
import { UserService } from "../../src/modules/m02-users/services/user.service.js";
import {
    authorize,
    createAuthContext,
    setAuthContext,
} from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { checkPasswordPolicy } from "../../src/shared/security/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";
import { penerbitPalsu, pengelolaPalsu } from "../helpers/auth.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

let urut = 0;
function emailUnik(awalan = "uji"): string {
    urut += 1;
    return `${awalan}${urut}@sekolah.sch.id`;
}
function nipUnik(): string {
    urut += 1;
    return `NIPUJI${String(urut).padStart(6, "0")}`;
}

async function idRole(kode: string): Promise<number> {
    const [baris] = await kueri<{ id: string }>(
        `SELECT id::text FROM roles WHERE kode = '${kode}'`,
    );
    if (baris === undefined) throw new Error(`Role ${kode} tidak ditemukan`);
    return Number(baris.id);
}

/** Admin ber-status AKTIF, dibuat langsung lewat SQL — pelaku (`created_by`) bagi operasi lain. */
async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji', '${emailUnik("admin")}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan admin uji");
    return Number(baris.id);
}

/** Unit kerja uji (Lampiran E.3) lewat SQL — fixture langsung ke tabel; endpoint master ada sejak `PR-01-18`. */
async function seedUnit(kode: string, status: "AKTIF" | "NONAKTIF" = "AKTIF"): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO work_units (nama, kode, jenis, status)
        VALUES ('Unit ${kode}', '${kode}', 'MANAJEMEN', '${status}')
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan unit kerja uji");
    return Number(baris.id);
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map([
            ["user.view", "all"],
            ["user.create", "all"],
            ["user.update", "all"],
        ]),
    });
}

function buatAuditLogger(): AuditLogger {
    return new AuditLogger({ clock: new FixedClock(new Date("2026-09-16T00:00:00Z")) });
}

function buatLogger(): Logger {
    return new Logger({
        clock: new FixedClock(new Date("2026-09-16T00:00:00Z")),
        tulis: () => undefined,
    });
}

function buatService(): UserService {
    return new UserService(getDb(), buatAuditLogger());
}

async function aksiTerakhir(
    entitasId: string,
): Promise<{ aksi: string; hasil: string; keterangan: string | null } | undefined> {
    const [baris] = await kueri<{
        aksi: string;
        hasil: string;
        keterangan: string | null;
    }>(
        `SELECT aksi, hasil, keterangan FROM activity_logs
          WHERE entitas = 'users' AND entitas_id = '${entitasId}'
          ORDER BY id DESC LIMIT 1`,
    );
    return baris;
}

describe.skipIf(!ADA_DB)("PR-01-02 — CRUD pengguna (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
    });

    it("katalog endpoint: tidak ada DELETE /users — soft delete saja (BR-067)", () => {
        const metode = registry
            .all()
            .filter((r) => r.path.startsWith("/users"))
            .map((r) => r.method);
        expect(metode).not.toContain("DELETE");
        expect(metode).toContain("PATCH");
    });

    it("membuat pengguna: AKTIF, must_change_password, password lolos kebijakan, USER_CREATED tercatat (FR-02.1, AL-01)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const email = emailUnik("citra");
        const nipNis = nipUnik();

        const hasil = await service.create(buatCtx(adminId), {
            nama: "Citra Uji",
            email,
            nipNis,
            roleId: await idRole("R-02"),
            workUnitId: await seedUnit("SARPRAS"),
            telepon: null,
        });

        expect(hasil.user.status).toBe("AKTIF");
        expect(hasil.user.work_unit_id).not.toBeNull();
        expect(hasil.user.must_change_password).toBe(true);
        expect(hasil.user.email).toBe(email);
        expect(
            checkPasswordPolicy(hasil.passwordSementara, {
                nama: "Citra Uji",
                email,
                nipNis,
            }),
        ).toEqual([]);

        const log = await aksiTerakhir(hasil.user.id);
        expect(log).toMatchObject({ aksi: "USER_CREATED", hasil: "SUKSES" });
    });

    it("email sudah digunakan (tanpa membedakan huruf besar) → DUPLICATE_CODE (FR-02.1 A1)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const email = emailUnik("dupe");
        await service.create(buatCtx(adminId), {
            nama: "A",
            email,
            nipNis: nipUnik(),
            roleId: await idRole("R-02"),
            workUnitId: null,
            telepon: null,
        });

        await expect(
            service.create(buatCtx(adminId), {
                nama: "B",
                email: email.toUpperCase(),
                nipNis: nipUnik(),
                roleId: await idRole("R-02"),
                workUnitId: null,
                telepon: null,
            }),
        ).rejects.toMatchObject({ kode: "DUPLICATE_CODE", detail: { field: "email" } });
    });

    it("nip_nis sudah digunakan → DUPLICATE_CODE", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const nipNis = nipUnik();
        await service.create(buatCtx(adminId), {
            nama: "A",
            email: emailUnik(),
            nipNis,
            roleId: await idRole("R-02"),
            workUnitId: null,
            telepon: null,
        });

        await expect(
            service.create(buatCtx(adminId), {
                nama: "B",
                email: emailUnik(),
                nipNis,
                roleId: await idRole("R-02"),
                workUnitId: null,
                telepon: null,
            }),
        ).rejects.toMatchObject({ kode: "DUPLICATE_CODE", detail: { field: "nip_nis" } });
    });

    it("getById pengguna tidak ada → NotFoundError", async () => {
        const service = buatService();
        await expect(service.getById(buatCtx(await seedAdmin()), 999_999_999)).rejects.toThrow(
            /tidak ditemukan/,
        );
    });

    it("update: menyunting data mencatat USER_UPDATED dengan nilai sebelum/sesudah (AL-01)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const dibuat = await service.create(ctx, {
            nama: "Sebelum",
            email: emailUnik(),
            nipNis: nipUnik(),
            roleId: await idRole("R-02"),
            workUnitId: null,
            telepon: null,
        });

        const unitBaru = await seedUnit("UNIT-BARU");
        const sesudah = await service.update(ctx, Number(dibuat.user.id), {
            nama: "Sesudah",
            email: dibuat.user.email,
            nipNis: dibuat.user.nip_nis,
            roleId: Number(dibuat.user.role_id),
            workUnitId: unitBaru,
            telepon: "081200000000",
        });

        expect(sesudah.nama).toBe("Sesudah");
        expect(sesudah.work_unit_id).toBe(String(unitBaru));

        const log = await aksiTerakhir(dibuat.user.id);
        expect(log).toMatchObject({ aksi: "USER_UPDATED", hasil: "SUKSES" });
    });

    it("update tidak menganggap email/nip_nis milik sendiri sebagai duplikat", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const dibuat = await service.create(ctx, {
            nama: "X",
            email: emailUnik(),
            nipNis: nipUnik(),
            roleId: await idRole("R-02"),
            workUnitId: null,
            telepon: null,
        });

        await expect(
            service.update(ctx, Number(dibuat.user.id), {
                nama: "X Diubah",
                email: dibuat.user.email,
                nipNis: dibuat.user.nip_nis,
                roleId: Number(dibuat.user.role_id),
                workUnitId: null,
                telepon: null,
            }),
        ).resolves.toMatchObject({ nama: "X Diubah" });
    });

    it("menonaktifkan pengguna non-admin: berhasil, USER_DEACTIVATED tercatat beserta alasan", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const dibuat = await service.create(ctx, {
            nama: "Guru",
            email: emailUnik(),
            nipNis: nipUnik(),
            roleId: await idRole("R-05"),
            workUnitId: null,
            telepon: null,
        });

        const hasil = await service.updateStatus(ctx, Number(dibuat.user.id), {
            status: "NONAKTIF",
            alasan: "Mengundurkan diri",
        });
        expect(hasil.status).toBe("NONAKTIF");

        const log = await aksiTerakhir(dibuat.user.id);
        expect(log).toMatchObject({
            aksi: "USER_DEACTIVATED",
            keterangan: "Mengundurkan diri",
        });
    });

    it("mengaktifkan kembali: USER_REACTIVATED, tidak terkena guard admin", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const dibuat = await service.create(ctx, {
            nama: "Guru",
            email: emailUnik(),
            nipNis: nipUnik(),
            roleId: await idRole("R-05"),
            workUnitId: null,
            telepon: null,
        });
        await service.updateStatus(ctx, Number(dibuat.user.id), {
            status: "NONAKTIF",
            alasan: "sementara",
        });

        const hasil = await service.updateStatus(ctx, Number(dibuat.user.id), {
            status: "AKTIF",
            alasan: undefined,
        });
        expect(hasil.status).toBe("AKTIF");
        const log = await aksiTerakhir(dibuat.user.id);
        expect(log?.aksi).toBe("USER_REACTIVATED");
    });

    it("menonaktifkan admin saat masih tersisa 3 aktif → berhasil, menyisakan 2", async () => {
        const service = buatService();
        const a = await seedAdmin();
        const b = await seedAdmin();
        const c = await seedAdmin();
        const ctx = buatCtx(a);

        await expect(
            service.updateStatus(ctx, c, { status: "NONAKTIF", alasan: "rotasi" }),
        ).resolves.toMatchObject({ status: "NONAKTIF" });

        const [sisa] = await kueri<{ n: string }>(
            "SELECT count(*)::text AS n FROM users WHERE status = 'AKTIF'",
        );
        expect(sisa?.n).toBe("2");
        void b;
    });

    it("menonaktifkan admin saat hanya tersisa 2 aktif → ditolak (BR-068 + BR-070a, SDD-05 §4.3)", async () => {
        const service = buatService();
        const a = await seedAdmin();
        const b = await seedAdmin();
        const ctx = buatCtx(a);

        await expect(
            service.updateStatus(ctx, b, { status: "NONAKTIF", alasan: "rotasi" }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });

        const [sisa] = await kueri<{ n: string }>(
            "SELECT count(*)::text AS n FROM users WHERE status = 'AKTIF'",
        );
        expect(sisa?.n).toBe("2");
    });

    it("list: paginasi dan filter status/role_id/work_unit_id", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const roleGuru = await idRole("R-05");
        const unitKurikulum = await seedUnit("KURIKULUM");
        for (let i = 0; i < 3; i += 1) {
            await service.create(ctx, {
                nama: `Guru ${String(i)}`,
                email: emailUnik("guru"),
                nipNis: nipUnik(),
                roleId: roleGuru,
                workUnitId: unitKurikulum,
                telepon: null,
            });
        }

        const hasil = await service.list(ctx, {
            page: 1,
            perPage: 2,
            roleId: roleGuru,
            workUnitId: unitKurikulum,
        });
        expect(hasil.total).toBe(3);
        expect(hasil.rows).toHaveLength(2);
    });

    it("work_unit_id harus unit kerja yang ADA dan AKTIF; unit nonaktif tetap sah bagi yang sudah memakainya (WU-01, WU-02)", async () => {
        const adminId = await seedAdmin();
        const service = buatService();
        const ctx = buatCtx(adminId);
        const dasar = {
            nama: "Unit Uji",
            roleId: await idRole("R-05"),
            telepon: null,
        };

        await expect(
            service.create(ctx, { ...dasar, email: emailUnik(), nipNis: nipUnik(), workUnitId: 999999999 }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", detail: { field: "work_unit_id" } });

        const nonaktif = await seedUnit("NONAKTIF-1", "NONAKTIF");
        await expect(
            service.create(ctx, { ...dasar, email: emailUnik(), nipNis: nipUnik(), workUnitId: nonaktif }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR", message: "Unit kerja tidak aktif." });

        // Pengguna yang sudah berada di unit lalu unit itu dinonaktifkan: menyimpan
        // ulang tanpa mengubah unitnya tidak boleh gagal (WU-02).
        const aktif = await seedUnit("AKTIF-1");
        const dibuat = await service.create(ctx, { ...dasar, email: emailUnik(), nipNis: nipUnik(), workUnitId: aktif });
        await kueri(`UPDATE work_units SET status = 'NONAKTIF' WHERE id = ${aktif}`);
        const masukan = {
            nama: "Nama Baru",
            email: dibuat.user.email,
            nipNis: dibuat.user.nip_nis,
            roleId: Number(dibuat.user.role_id),
            telepon: null,
        };
        const tetap = await service.update(ctx, Number(dibuat.user.id), { ...masukan, workUnitId: aktif });
        expect(tetap.work_unit_id).toBe(String(aktif));

        // Memindahkan ke unit nonaktif ditolak.
        await expect(
            service.update(ctx, Number(dibuat.user.id), { ...masukan, workUnitId: nonaktif }),
        ).rejects.toMatchObject({ kode: "VALIDATION_ERROR" });
    });

    describe("lewat HTTP penuh (routing, JSON, envelope)", () => {
        const server: { instance: ReturnType<typeof createServer> | undefined } = {
            instance: undefined,
        };

        afterEach(async () => {
            if (server.instance !== undefined) {
                await new Promise((r) => server.instance?.close(r));
                server.instance = undefined;
            }
        });

        function buatApp(ctx: AuthContext): Express {
            const app = express();
            app.use(
                awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }),
            );
            app.use((_req, res, next) => {
                setAuthContext(res, ctx);
                next();
            });
            const batasi = (): RequestHandler => (_req, _res, next) => next();
            app.use(
                "/api/v1",
                usersRouter({ db: getDb(), penerbitPassword: penerbitPalsu, pengelolaDuaFaktor: pengelolaPalsu, auditLogger: buatAuditLogger(), logger: buatLogger() }, batasi, authorize),
            );
            app.use(
                ujungRantai({
                    limiter: {
                        hit: () =>
                            Promise.resolve({
                                lolos: true,
                                batas: 100,
                                sisa: 99,
                                resetDetik: 60,
                            }),
                    },
                    logger: new Logger({
                        clock: new FixedClock(new Date("2026-09-16T00:00:00Z")),
                        tulis: () => undefined,
                    }),
                }),
            );
            return app;
        }

        async function buka(app: Express): Promise<string> {
            const s = createServer(app);
            server.instance = s;
            await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
            return `http://127.0.0.1:${String((s.address() as AddressInfo).port)}`;
        }

        it("POST /users → 201, amplop sukses, password_sementara tampil satu kali", async () => {
            const adminId = await seedAdmin();
            const url = await buka(buatApp(buatCtx(adminId)));
            const res = await fetch(`${url}/api/v1/users`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    nama: "Dedi Uji",
                    email: emailUnik("dedi"),
                    nip_nis: nipUnik(),
                    role_id: await idRole("R-05"),
                }),
            });
            expect(res.status).toBe(201);
            const body = (await res.json()) as {
                success: boolean;
                data: { status: string; password_sementara: string };
            };
            expect(body.success).toBe(true);
            expect(body.data.status).toBe("AKTIF");
            expect(body.data.password_sementara.length).toBeGreaterThanOrEqual(12);
        });

        it("GET /users → 200, amplop terpaginasi", async () => {
            const adminId = await seedAdmin();
            const url = await buka(buatApp(buatCtx(adminId)));
            const res = await fetch(`${url}/api/v1/users?page=1&per_page=10`);
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({
                success: true,
                data: expect.any(Array),
                meta: { page: 1, per_page: 10 },
            });
        });

        it("GET /users/{id} → 200 pengguna ditemukan, 404 saat tidak", async () => {
            const adminId = await seedAdmin();
            const service = buatService();
            const dibuat = await service.create(buatCtx(adminId), {
                nama: "Z",
                email: emailUnik(),
                nipNis: nipUnik(),
                roleId: await idRole("R-05"),
                workUnitId: null,
                telepon: null,
            });
            const url = await buka(buatApp(buatCtx(adminId)));

            const ok = await fetch(`${url}/api/v1/users/${dibuat.user.id}`);
            expect(ok.status).toBe(200);
            expect(await ok.json()).toMatchObject({
                success: true,
                data: { id: dibuat.user.id },
            });

            const tidakAda = await fetch(`${url}/api/v1/users/999999999`);
            expect(tidakAda.status).toBe(404);
        });

        it("PUT /users/{id} → 200, data tersunting", async () => {
            const adminId = await seedAdmin();
            const service = buatService();
            const dibuat = await service.create(buatCtx(adminId), {
                nama: "W",
                email: emailUnik(),
                nipNis: nipUnik(),
                roleId: await idRole("R-05"),
                workUnitId: null,
                telepon: null,
            });
            const unitBaru = await seedUnit("UNIT-HTTP");
            const url = await buka(buatApp(buatCtx(adminId)));
            const res = await fetch(`${url}/api/v1/users/${dibuat.user.id}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    nama: "W Diubah",
                    email: dibuat.user.email,
                    nip_nis: dibuat.user.nip_nis,
                    role_id: Number(dibuat.user.role_id),
                    work_unit_id: unitBaru,
                }),
            });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({
                success: true,
                data: { nama: "W Diubah", work_unit_id: String(unitBaru) },
            });

            // Unit tak dikenal → 422 VALIDATION_ERROR (bukan 500 dari FK).
            const ditolak = await fetch(`${url}/api/v1/users/${dibuat.user.id}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    nama: "W Diubah",
                    email: dibuat.user.email,
                    nip_nis: dibuat.user.nip_nis,
                    role_id: Number(dibuat.user.role_id),
                    work_unit_id: 999999999,
                }),
            });
            expect(ditolak.status).toBe(422);
            expect(await ditolak.json()).toMatchObject({
                success: false,
                error: { code: "VALIDATION_ERROR" },
            });
        });

        it("PATCH .../status mengaktifkan kembali → 200", async () => {
            const adminId = await seedAdmin();
            const service = buatService();
            const dibuat = await service.create(buatCtx(adminId), {
                nama: "V",
                email: emailUnik(),
                nipNis: nipUnik(),
                roleId: await idRole("R-05"),
                workUnitId: null,
                telepon: null,
            });
            await service.updateStatus(buatCtx(adminId), Number(dibuat.user.id), {
                status: "NONAKTIF",
                alasan: "sementara",
            });
            const url = await buka(buatApp(buatCtx(adminId)));
            const res = await fetch(`${url}/api/v1/users/${dibuat.user.id}/status`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "AKTIF" }),
            });
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({
                success: true,
                data: { status: "AKTIF" },
            });
        });

        it("PATCH .../status menonaktifkan TANPA alasan → 400 INVALID_REQUEST (skema)", async () => {
            const adminId = await seedAdmin();
            const service = buatService();
            const dibuat = await service.create(buatCtx(adminId), {
                nama: "Y",
                email: emailUnik(),
                nipNis: nipUnik(),
                roleId: await idRole("R-05"),
                workUnitId: null,
                telepon: null,
            });
            const url = await buka(buatApp(buatCtx(adminId)));
            const res = await fetch(`${url}/api/v1/users/${dibuat.user.id}/status`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "NONAKTIF" }),
            });
            expect(res.status).toBe(400);
            expect(await res.json()).toMatchObject({
                success: false,
                error: { code: "INVALID_REQUEST" },
            });
        });

        it("PATCH .../status menonaktifkan admin terakhir → 422 VALIDATION_ERROR", async () => {
            const a = await seedAdmin();
            const b = await seedAdmin();
            const url = await buka(buatApp(buatCtx(a)));
            const res = await fetch(`${url}/api/v1/users/${String(b)}/status`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ status: "NONAKTIF", alasan: "rotasi" }),
            });
            expect(res.status).toBe(422);
            expect(await res.json()).toMatchObject({
                success: false,
                error: { code: "VALIDATION_ERROR" },
            });
        });

        it("GET /users tanpa AuthContext → 401 (PM-02, dipasang authorize())", async () => {
            const app = express();
            app.use(
                awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }),
            );
            const batasi = (): RequestHandler => (_req, _res, next) => next();
            app.use(
                "/api/v1",
                usersRouter(
                    { db: getDb(), penerbitPassword: penerbitPalsu, pengelolaDuaFaktor: pengelolaPalsu, auditLogger: buatAuditLogger(), logger: buatLogger() },
                    batasi,
                    authorize,
                ),
            );
            app.use(
                ujungRantai({
                    limiter: {
                        hit: () =>
                            Promise.resolve({
                                lolos: true,
                                batas: 100,
                                sisa: 99,
                                resetDetik: 60,
                            }),
                    },
                    logger: new Logger({
                        clock: new FixedClock(new Date("2026-09-16T00:00:00Z")),
                        tulis: () => undefined,
                    }),
                }),
            );
            const url = await buka(app);
            const res = await fetch(`${url}/api/v1/users`);
            expect(res.status).toBe(401);
        });
    });
});
