// Acceptance PR-01-03: "Impor massal pengguna (CSV/XLSX), sinkron ≤ 200 baris"
// (FR-02.1 A4, IMPT-01, IMPT-02). Terhadap PostgreSQL NYATA — baris gagal tidak
// boleh menggagalkan baris lain hanya dapat dibuktikan lewat basis data
// sungguhan, bukan tiruan.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Express, RequestHandler } from "express";
import ExcelJS from "exceljs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { usersRouter } from "../../src/modules/m02-users/index.js";
import {
    authorize,
    createAuthContext,
    setAuthContext,
} from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";

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

const HEADER = ["nama_lengkap", "email", "nip_nis", "kode_role", "telepon"] as const;

function csvBase64(baris: readonly Record<string, string>[]): string {
    const teks = [
        HEADER.join(","),
        ...baris.map((b) => HEADER.map((k) => b[k] ?? "").join(",")),
    ].join("\n");
    return Buffer.from(teks, "utf8").toString("base64");
}

async function xlsxBase64(baris: readonly Record<string, string>[]): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pengguna");
    sheet.addRow([...HEADER]);
    for (const b of baris) sheet.addRow(HEADER.map((k) => b[k] ?? ""));
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer).toString("base64");
}

async function aksiUntukEmail(
    email: string,
): Promise<{ aksi: string; hasil: string } | undefined> {
    const [baris] = await kueri<{ aksi: string; hasil: string }>(`
        SELECT al.aksi, al.hasil FROM activity_logs al
         JOIN users u ON u.id = al.entitas_id::bigint AND al.entitas = 'users'
         WHERE u.email = lower('${email}')
         ORDER BY al.id DESC LIMIT 1`);
    return baris;
}

describe.skipIf(!ADA_DB)("PR-01-03 — impor massal pengguna (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    beforeEach(async () => {
        await kueri("DELETE FROM users");
    });

    function buatApp(ctx: AuthContext): Express {
        const app = express();
        app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
        app.use((_req, res, next) => {
            setAuthContext(res, ctx);
            next();
        });
        const batasi = (): RequestHandler => (_req, _res, next) => next();
        app.use(
            "/api/v1",
            usersRouter(
                {
                    db: getDb(),
                    auditLogger: new AuditLogger({
                        clock: new FixedClock(new Date("2026-09-16T00:00:00Z")),
                    }),
                    logger: new Logger({
                        clock: new FixedClock(new Date("2026-09-16T00:00:00Z")),
                        tulis: () => undefined,
                    }),
                },
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
        return app;
    }

    async function buka(app: Express): Promise<{ url: string; tutup: () => Promise<void> }> {
        const server = createServer(app);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
        return { url, tutup: () => new Promise((r) => server.close(() => r())) };
    }

    async function impor(
        ctx: AuthContext,
        filename: string,
        content_base64: string,
    ): Promise<{ status: number; body: unknown }> {
        const { url, tutup } = await buka(buatApp(ctx));
        try {
            const res = await fetch(`${url}/api/v1/users/import`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ filename, content_base64 }),
            });
            return { status: res.status, body: await res.json() };
        } finally {
            await tutup();
        }
    }

    it("CSV valid: seluruh baris sukses, USER_CREATED + USER_IMPORTED tercatat (IMPT-01, IMPT-02, AL-01)", async () => {
        const adminId = await seedAdmin();
        const e1 = emailUnik("a");
        const e2 = emailUnik("b");
        const csv = csvBase64([
            {
                nama_lengkap: "Satu",
                email: e1,
                nip_nis: nipUnik(),
                kode_role: "R-05",
            },
            {
                nama_lengkap: "Dua",
                email: e2,
                nip_nis: nipUnik(),
                kode_role: "R-05",
            },
        ]);

        const { status, body } = await impor(buatCtx(adminId), "pengguna.csv", csv);
        expect(status).toBe(200);
        expect(body).toMatchObject({
            success: true,
            data: { total: 2, sukses: 2, gagal: 0 },
        });

        const log1 = await aksiUntukEmail(e1);
        expect(log1).toMatchObject({ aksi: "USER_CREATED", hasil: "SUKSES" });

        const [ringkasan] = await kueri<{ aksi: string; keterangan: string | null }>(`
            SELECT aksi, keterangan FROM activity_logs
             WHERE aksi = 'USER_IMPORTED' ORDER BY id DESC LIMIT 1`);
        expect(ringkasan?.aksi).toBe("USER_IMPORTED");
    });

    it("baris gagal (email tidak sah) tidak menggagalkan baris lain (IMPT-01)", async () => {
        const adminId = await seedAdmin();
        const eSah = emailUnik("sah");
        const csv = csvBase64([
            {
                nama_lengkap: "Sah",
                email: eSah,
                nip_nis: nipUnik(),
                kode_role: "R-05",
            },
            {
                nama_lengkap: "Tidak Sah",
                email: "bukan-email",
                nip_nis: nipUnik(),
                kode_role: "R-05",
            },
        ]);

        const { status, body } = await impor(buatCtx(adminId), "pengguna.csv", csv);
        expect(status).toBe(200);
        const data = (
            body as {
                data: {
                    total: number;
                    sukses: number;
                    gagal: number;
                    baris: { baris: number; status: string; pesan: string | null }[];
                };
            }
        ).data;
        expect(data).toMatchObject({ total: 2, sukses: 1, gagal: 1 });
        expect(data.baris[1]).toMatchObject({ baris: 3, status: "GAGAL" });

        const log = await aksiUntukEmail(eSah);
        expect(log).toMatchObject({ aksi: "USER_CREATED", hasil: "SUKSES" });
    });

    it("email duplikat DI DALAM berkas: baris pertama sukses, baris kedua gagal DUPLICATE_CODE", async () => {
        const adminId = await seedAdmin();
        const emailSama = emailUnik("dup");
        const csv = csvBase64([
            {
                nama_lengkap: "Pertama",
                email: emailSama,
                nip_nis: nipUnik(),
                kode_role: "R-05",
            },
            {
                nama_lengkap: "Kedua",
                email: emailSama,
                nip_nis: nipUnik(),
                kode_role: "R-05",
            },
        ]);

        const { body } = await impor(buatCtx(adminId), "pengguna.csv", csv);
        const data = (body as { data: { sukses: number; gagal: number } }).data;
        expect(data).toMatchObject({ sukses: 1, gagal: 1 });
    });

    it("kode_role tidak dikenal → baris gagal dengan pesan jelas", async () => {
        const adminId = await seedAdmin();
        const csv = csvBase64([
            {
                nama_lengkap: "X",
                email: emailUnik(),
                nip_nis: nipUnik(),
                kode_role: "R-99",
            },
        ]);
        const { body } = await impor(buatCtx(adminId), "pengguna.csv", csv);
        const data = (
            body as { data: { baris: { status: string; pesan: string | null }[] } }
        ).data;
        expect(data.baris[0]?.status).toBe("GAGAL");
        expect(data.baris[0]?.pesan).toMatch(/R-99/);
    });

    it("XLSX valid diproses sama seperti CSV (exceljs menulis lalu membaca kembali)", async () => {
        const adminId = await seedAdmin();
        const email = emailUnik("xlsx");
        const xlsx = await xlsxBase64([
            {
                nama_lengkap: "Excel",
                email,
                nip_nis: nipUnik(),
                kode_role: "R-05",
            },
        ]);
        const { status, body } = await impor(buatCtx(adminId), "pengguna.xlsx", xlsx);
        expect(status).toBe(200);
        expect(body).toMatchObject({ data: { total: 1, sukses: 1, gagal: 0 } });
    });

    it("kolom opsional (telepon) dikosongkan XLSX tidak ditolak — sel kosong bukan string kosong", async () => {
        const adminId = await seedAdmin();
        const email = emailUnik("kosong");
        const xlsx = await xlsxBase64([
            {
                nama_lengkap: "Tanpa Telepon",
                email,
                nip_nis: nipUnik(),
                kode_role: "R-05",
                // `telepon` sengaja tidak diisi — regresi: sel kosong XLSX
                // sempat ditafsirkan string kosong dan ditolak `min(1)`.
            },
        ]);
        const { status, body } = await impor(buatCtx(adminId), "pengguna.xlsx", xlsx);
        expect(status).toBe(200);
        expect(body).toMatchObject({ data: { total: 1, sukses: 1, gagal: 0 } });
    });

    it("header tanpa kolom wajib → 400 INVALID_REQUEST, tidak ada baris diproses", async () => {
        const adminId = await seedAdmin();
        const csvRusak = Buffer.from("nama_lengkap,nip_nis\nX,123\n", "utf8").toString(
            "base64",
        );
        const { status, body } = await impor(buatCtx(adminId), "pengguna.csv", csvRusak);
        expect(status).toBe(400);
        expect(body).toMatchObject({ error: { code: "INVALID_REQUEST" } });
    });

    it("berkas > 200 baris → 422 VALIDATION_ERROR, ditolak SEBELUM diproses (IMPT-04, PR-01-17)", async () => {
        const adminId = await seedAdmin();
        const banyak = Array.from({ length: 201 }, (_, i) => ({
            nama_lengkap: `Baris ${String(i)}`,
            email: `banyak${String(i)}@sekolah.sch.id`,
            nip_nis: `NIPBANYAK${String(i).padStart(4, "0")}`,
            kode_role: "R-05",
        }));
        const { status, body } = await impor(
            buatCtx(adminId),
            "pengguna.csv",
            csvBase64(banyak),
        );
        expect(status).toBe(422);
        expect(body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

        const [jumlah] = await kueri<{ n: string }>(
            "SELECT count(*)::text AS n FROM users WHERE email LIKE 'banyak%'",
        );
        expect(jumlah?.n).toBe("0");
    });

    it("tanpa AuthContext → 401 sebelum controller (PM-02)", async () => {
        const app = express();
        app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
        const batasi = (): RequestHandler => (_req, _res, next) => next();
        app.use(
            "/api/v1",
            usersRouter(
                {
                    db: getDb(),
                    auditLogger: new AuditLogger({
                        clock: new FixedClock(new Date("2026-09-16T00:00:00Z")),
                    }),
                    logger: new Logger({
                        clock: new FixedClock(new Date("2026-09-16T00:00:00Z")),
                        tulis: () => undefined,
                    }),
                },
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
        const { url, tutup } = await buka(app);
        try {
            const res = await fetch(`${url}/api/v1/users/import`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    filename: "pengguna.csv",
                    content_base64: csvBase64([]),
                }),
            });
            expect(res.status).toBe(401);
        } finally {
            await tutup();
        }
    });
});
