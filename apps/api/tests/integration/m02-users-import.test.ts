// Acceptance PR-01-03: "Impor massal pengguna (CSV/XLSX), sinkron ≤ 200 baris"
// (FR-02.1 A4, IMPT-01, IMPT-02). Terhadap PostgreSQL NYATA — baris gagal tidak
// boleh menggagalkan baris lain hanya dapat dibuktikan lewat basis data
// sungguhan, bukan tiruan.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import type { Express, RequestHandler } from "express";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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

const HEADER = ["nama_lengkap", "email", "nip_nis", "kode_role", "kode_unit_kerja", "telepon"] as const;

/** E.5.2: `kode_unit_kerja` wajib. Baris uji yang tidak menyebutnya memakai unit bawaan; sel kosong dinyatakan dengan `""` eksplisit. */
const UNIT_BAWAAN = "TU-01";
const sel = (b: Record<string, string>, k: (typeof HEADER)[number]): string =>
    k === "kode_unit_kerja" && !(k in b) ? UNIT_BAWAAN : (b[k] ?? "");

function csvBase64(baris: readonly Record<string, string>[]): string {
    const teks = [
        HEADER.join(","),
        ...baris.map((b) => HEADER.map((k) => sel(b, k)).join(",")),
    ].join("\n");
    return Buffer.from(teks, "utf8").toString("base64");
}

async function xlsxBase64(baris: readonly Record<string, string>[]): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pengguna");
    sheet.addRow([...HEADER]);
    for (const b of baris) sheet.addRow(HEADER.map((k) => sel(b, k)));
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

    // Pekerjaan impor merujuk users (created_by): dihapus lebih dulu.
    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM user_import_jobs");
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
    }
    beforeEach(async () => {
        await bersihkan();
        // E.5.2: `kode_unit_kerja` wajib dan harus ada pada master (WU-01).
        await kueri("INSERT INTO work_units (nama, kode, jenis) VALUES ('Tata Usaha', 'TU-01', 'TATA_USAHA')");
    });
    afterAll(bersihkan);

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
                    laporan_gagal: { baris: number; pesan: string }[];
                };
            }
        ).data;
        expect(data).toMatchObject({ total: 2, sukses: 1, gagal: 1 });
        // IMPT-02: hanya baris gagal yang dilaporkan, dengan nomor baris berkas.
        expect(data.laporan_gagal).toHaveLength(1);
        expect(data.laporan_gagal[0]).toMatchObject({ baris: 3 });

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
            body as { data: { laporan_gagal: { pesan: string }[] } }
        ).data;
        expect(data.laporan_gagal[0]?.pesan).toMatch(/R-99/);
    });

    it("kode_unit_kerja di-resolve ke master (tanpa membedakan huruf/spasi); kode tak dikenal atau nonaktif → baris gagal (E.5.2, WU-01)", async () => {
        const adminId = await seedAdmin();
        await kueri("DELETE FROM work_units");
        const [unit] = await kueri<{ id: string }>(`
            INSERT INTO work_units (nama, kode, jenis) VALUES ('Tata Usaha', 'TU-01', 'TATA_USAHA') RETURNING id::text`);
        await kueri(`INSERT INTO work_units (nama, kode, jenis, status) VALUES ('Lama', 'LAMA', 'KELAS', 'NONAKTIF')`);
        const baris = (kode: string) => ({
            nama_lengkap: "Peserta",
            email: emailUnik(),
            nip_nis: nipUnik(),
            kode_role: "R-05",
            kode_unit_kerja: kode,
        });
        const csv = csvBase64([baris("tu-01"), baris("TIDAK-ADA"), baris("LAMA")]);

        const { body } = await impor(buatCtx(adminId), "pengguna.csv", csv);
        const data = (
            body as { data: { sukses: number; gagal: number; laporan_gagal: { pesan: string }[] } }
        ).data;

        expect(data).toMatchObject({ sukses: 1, gagal: 2 });
        expect(data.laporan_gagal[0]?.pesan).toBe("Kode unit kerja tidak dikenal: TIDAK-ADA");
        expect(data.laporan_gagal[1]?.pesan).toBe("Unit kerja tidak aktif.");

        const [pengguna] = await kueri<{ work_unit_id: string }>(
            "SELECT work_unit_id::text FROM users WHERE work_unit_id IS NOT NULL",
        );
        expect(pengguna?.work_unit_id).toBe(unit?.id);
        await kueri("DELETE FROM user_import_jobs");
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
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

    it("E.5.2: kode_unit_kerja kosong pada sebuah baris → baris itu gagal dengan alasan tertulis; baris lain tetap masuk (IMPT-01, IMPT-02)", async () => {
        const adminId = await seedAdmin();
        const sah = emailUnik("sah");
        const csv = csvBase64([
            { nama_lengkap: "Sah", email: sah, nip_nis: nipUnik(), kode_role: "R-05" },
            { nama_lengkap: "Tanpa Unit", email: emailUnik("kosong"), nip_nis: nipUnik(), kode_role: "R-05", kode_unit_kerja: "" },
            { nama_lengkap: "Spasi Saja", email: emailUnik("spasi"), nip_nis: nipUnik(), kode_role: "R-05", kode_unit_kerja: "   " },
        ]);

        const { status, body } = await impor(buatCtx(adminId), "pengguna.csv", csv);

        expect(status).toBe(200);
        const data = (body as { data: { sukses: number; gagal: number; laporan_gagal: { baris: number; pesan: string }[] } }).data;
        expect(data).toMatchObject({ sukses: 1, gagal: 2 });
        expect(data.laporan_gagal).toEqual([
            expect.objectContaining({ baris: 3, pesan: "Kode unit kerja wajib diisi (E.5.2)." }),
            expect.objectContaining({ baris: 4, pesan: "Kode unit kerja wajib diisi (E.5.2)." }),
        ]);
        expect(await aksiUntukEmail(sah)).toMatchObject({ aksi: "USER_CREATED" });
        const [n] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM users WHERE email LIKE 'kosong%' OR email LIKE 'spasi%'");
        expect(n?.n).toBe("0");
    });

    it("CSV dibaca sebagai teks: NIP/NIS ber-angka nol di depan dan NIP 18 digit tersimpan persis, tidak dikonversi menjadi angka", async () => {
        const adminId = await seedAdmin();
        const nipPanjang = "198001012005011001";
        const nipNol = "0012345";
        const csv = csvBase64([
            { nama_lengkap: "Panjang", email: emailUnik("nip1"), nip_nis: nipPanjang, kode_role: "R-05" },
            { nama_lengkap: "Nol", email: emailUnik("nip2"), nip_nis: nipNol, kode_role: "R-05" },
        ]);

        const { body } = await impor(buatCtx(adminId), "pengguna.csv", csv);

        expect((body as { data: { sukses: number } }).data.sukses).toBe(2);
        const tersimpan = await kueri<{ nip_nis: string }>("SELECT nip_nis FROM users WHERE email LIKE 'nip%' ORDER BY nip_nis");
        expect(tersimpan.map((u) => u.nip_nis)).toEqual([nipNol, nipPanjang]);
    });

    it("E.5.2: kode_unit_kerja tanpa pengecualian role — baris Siswa/OSIS (R-07) tanpa kode unit juga gagal, dengan kode unit dan consent_wali berhasil", async () => {
        const adminId = await seedAdmin();
        const kolom = ["nama_lengkap", "email", "nip_nis", "kode_role", "kode_unit_kerja", "consent_wali"];
        const baris = (unit: string) => ["Siswa", emailUnik("siswa"), nipUnik(), "R-07", unit, "true"].join(",");
        const csv = Buffer.from([kolom.join(","), baris(""), baris("TU-01")].join("\n"), "utf8").toString("base64");

        const { body } = await impor(buatCtx(adminId), "siswa.csv", csv);

        const data = (body as { data: { sukses: number; gagal: number; laporan_gagal: { pesan: string }[] } }).data;
        expect(data).toMatchObject({ sukses: 1, gagal: 1 });
        expect(data.laporan_gagal[0]?.pesan).toBe("Kode unit kerja wajib diisi (E.5.2).");
    });

    it("E.5.2: kolom kode_unit_kerja tidak ada di header → 400 INVALID_REQUEST, berkas ditolak utuh dan tidak ada pekerjaan tercatat", async () => {
        const adminId = await seedAdmin();
        const csv = Buffer.from(`nama_lengkap,email,nip_nis,kode_role\nX,${emailUnik("x")},${nipUnik()},R-05\n`, "utf8").toString("base64");

        const { status, body } = await impor(buatCtx(adminId), "pengguna.csv", csv);

        expect(status).toBe(400);
        expect(body).toMatchObject({ error: { code: "INVALID_REQUEST", message: "Kolom wajib hilang pada header: kode_unit_kerja" } });
        const [jobs] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM user_import_jobs");
        const [pengguna] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM users WHERE email LIKE 'x%'");
        expect([jobs?.n, pengguna?.n]).toEqual(["0", "0"]);
    });

    it("berkas > 200 baris → 202 MENUNGGU, dijadwalkan lewat outbox dan BELUM diproses (IMPT-04)", async () => {
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
        expect(status).toBe(202);
        expect(body).toMatchObject({
            data: { status: "MENUNGGU", total: 201, terproses: 0 },
            meta: { idempotent_replay: false },
        });

        const [jumlah] = await kueri<{ n: string }>(
            "SELECT count(*)::text AS n FROM users WHERE email LIKE 'banyak%'",
        );
        expect(jumlah?.n).toBe("0");
        const [event] = await kueri<{ event_name: string }>(
            "SELECT event_name FROM event_outbox WHERE event_name = 'UserImportRequested' ORDER BY id DESC LIMIT 1",
        );
        expect(event?.event_name).toBe("UserImportRequested");
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
