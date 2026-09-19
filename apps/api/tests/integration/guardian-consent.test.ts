// Acceptance PR-01-14: "Gerbang persetujuan wali (`consent_guardian_at`)" —
// "Akun siswa tanpa penanda tidak dapat diaktifkan" (DP-02, SL-06, SDD-DB-21,
// SDD-05 §4.7e) terhadap PostgreSQL NYATA.
//
// NT-48 (notifikasi ke Administrator) SENGAJA tidak diuji: pengirimannya
// ditunda ke M-17 Phase 02 (keputusan 32 log phase-01) — penolakan dikembalikan
// langsung kepada pemanggil dan dicatat.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Express, RequestHandler } from "express";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { awalRantai, ujungRantai } from "../../src/api/chain.js";
import { usersRouter } from "../../src/modules/m02-users/index.js";
import { StudentObligationRegistry } from "../../src/modules/m02-users/services/student-obligation-registry.js";
import { UserImportService } from "../../src/modules/m02-users/services/user-import.service.js";
import { UserService } from "../../src/modules/m02-users/services/user.service.js";
import { authorize, createAuthContext, setAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { dbmate, kueri } from "../helpers/db.js";
import { penerbitPalsu } from "../helpers/auth.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const T1 = new Date("2026-09-19T03:00:00Z");
const T2 = new Date("2026-10-01T03:00:00Z");

let urut = 0;
const emailUnik = () => `wali-${(urut += 1)}-${randomUUID().slice(0, 8)}@sekolah.sch.id`;
const nipUnik = () => `NIPWALI${randomUUID().replace(/-/g, "").slice(0, 16)}`;

async function idRole(kode: string): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`SELECT id::text FROM roles WHERE kode = '${kode}'`);
    return Number(baris?.id);
}

async function seedPengguna(kodeRole: string, status = "AKTIF", konsen: Date | null = null): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password, consent_guardian_at)
        VALUES ('Uji Wali', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = '${kodeRole}'), '${status}', false,
                ${konsen === null ? "NULL" : `'${konsen.toISOString()}'`})
        RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan pengguna uji");
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

const audit = () => new AuditLogger({ clock: new FixedClock(T1) });
const logger = () => new Logger({ clock: new FixedClock(T1), tulis: () => undefined });
const layanan = (waktu = T1) => new UserService(getDb(), audit(), new StudentObligationRegistry(), new FixedClock(waktu));

async function konsen(userId: number): Promise<Date | null> {
    const [baris] = await kueri<{ consent_guardian_at: Date | null }>(`SELECT consent_guardian_at FROM users WHERE id = ${userId}`);
    return baris?.consent_guardian_at ?? null;
}

describe.skipIf(!ADA_DB)("PR-01-14 — gerbang persetujuan wali (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    // Pekerjaan impor merujuk users (created_by): dihapus lebih dulu.
    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM user_import_jobs");
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
    }
    beforeEach(bersihkan);
    afterEach(bersihkan);

    async function dasar(kodeRole: string) {
        return {
            nama: "Peserta Didik",
            email: emailUnik(),
            nipNis: nipUnik(),
            roleId: await idRole(kodeRole),
            workUnitId: null,
            telepon: null,
        };
    }

    it("DP-02: membuat akun siswa tanpa persetujuan wali ditolak dan TIDAK membuat baris", async () => {
        const admin = await seedPengguna("R-01");
        const masukan = await dasar("R-07");

        await expect(layanan().create(buatCtx(admin), masukan)).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            detail: { rule: "DP-02", field: "consent_wali" },
        });
        await expect(layanan().create(buatCtx(admin), { ...masukan, consentWali: false })).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
        });
        expect(await kueri(`SELECT 1 FROM users WHERE email = '${masukan.email}'`)).toHaveLength(0);
    });

    it("dengan consent_wali: akun siswa lahir AKTIF, penanda = cap waktu Clock (bukan dari klien), tercatat di log", async () => {
        const admin = await seedPengguna("R-01");
        const hasil = await layanan(T1).create(buatCtx(admin), { ...(await dasar("R-07")), consentWali: true });

        expect(hasil.user.status).toBe("AKTIF");
        expect(hasil.user.consent_guardian_at).toEqual(T1);
        expect(await konsen(Number(hasil.user.id))).toEqual(T1);
        const [log] = await kueri<{ nilai_sesudah: { consent_guardian_at: string } }>(`
            SELECT nilai_sesudah FROM activity_logs
             WHERE aksi = 'USER_CREATED' AND entitas_id = '${hasil.user.id}' ORDER BY id DESC LIMIT 1`);
        expect(log?.nilai_sesudah.consent_guardian_at).toBe(T1.toISOString());
    });

    it("minimisasi data (DP-03): akun non-siswa tidak diberi penanda meski consent_wali true", async () => {
        const admin = await seedPengguna("R-01");
        const hasil = await layanan().create(buatCtx(admin), { ...(await dasar("R-05")), consentWali: true });
        expect(hasil.user.consent_guardian_at).toBeNull();
    });

    it("SL-06: mengaktifkan kembali siswa tanpa penanda ditolak; sesudah persetujuan direkam (PUT) berhasil", async () => {
        const admin = await seedPengguna("R-01");
        const siswa = await seedPengguna("R-07", "NONAKTIF");
        const ctx = buatCtx(admin);

        await expect(layanan().updateStatus(ctx, siswa, { status: "AKTIF", alasan: undefined })).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            message: "Akun siswa tidak dapat diaktifkan: persetujuan wali belum terekam (DP-02).",
            detail: { rule: "DP-02" },
        });
        expect(await konsen(siswa)).toBeNull();

        const [baris] = await kueri<{ email: string; nip_nis: string; role_id: string }>(
            `SELECT email, nip_nis, role_id::text FROM users WHERE id = ${siswa}`,
        );
        await layanan(T1).update(ctx, siswa, {
            nama: "Uji Wali",
            email: baris!.email,
            nipNis: baris!.nip_nis,
            roleId: Number(baris!.role_id),
            workUnitId: null,
            telepon: null,
            consentWali: true,
        });
        expect(await konsen(siswa)).toEqual(T1);

        const aktif = await layanan().updateStatus(ctx, siswa, { status: "AKTIF", alasan: undefined });
        expect(aktif.status).toBe("AKTIF");
    });

    it("penanda direkam SEKALI dan tidak pernah dicabut atau ditimpa oleh penyimpanan berikutnya", async () => {
        const admin = await seedPengguna("R-01");
        const siswa = await seedPengguna("R-07", "AKTIF", T1);
        const [baris] = await kueri<{ email: string; nip_nis: string; role_id: string }>(
            `SELECT email, nip_nis, role_id::text FROM users WHERE id = ${siswa}`,
        );
        const masukan = {
            nama: "Nama Baru",
            email: baris!.email,
            nipNis: baris!.nip_nis,
            roleId: Number(baris!.role_id),
            workUnitId: null,
            telepon: null,
        };

        await layanan(T2).update(buatCtx(admin), siswa, { ...masukan, consentWali: true });
        expect(await konsen(siswa)).toEqual(T1); // tidak ditimpa
        await layanan(T2).update(buatCtx(admin), siswa, { ...masukan, consentWali: false });
        await layanan(T2).update(buatCtx(admin), siswa, masukan);
        expect(await konsen(siswa)).toEqual(T1); // tidak dicabut
    });

    it("mengganti role menjadi Siswa tanpa penanda ditolak; dengan consent_wali diterima; menyunting siswa lama tanpa ganti role tidak diblokir", async () => {
        const admin = await seedPengguna("R-01");
        const guru = await seedPengguna("R-05");
        const [baris] = await kueri<{ email: string; nip_nis: string }>(`SELECT email, nip_nis FROM users WHERE id = ${guru}`);
        const jadiSiswa = {
            nama: "Uji Wali",
            email: baris!.email,
            nipNis: baris!.nip_nis,
            roleId: await idRole("R-07"),
            workUnitId: null,
            telepon: null,
        };

        await expect(layanan().update(buatCtx(admin), guru, jadiSiswa)).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            detail: { rule: "DP-02" },
        });
        expect((await kueri<{ role_id: string }>(`SELECT role_id::text FROM users WHERE id = ${guru}`))[0]?.role_id).toBe(
            String(await idRole("R-05")),
        );

        const ok = await layanan(T1).update(buatCtx(admin), guru, { ...jadiSiswa, consentWali: true });
        expect(ok.consent_guardian_at).toEqual(T1);

        // Siswa lama (dibuat sebelum gerbang, tanpa penanda) tetap dapat disunting selama role tidak berubah.
        const lama = await seedPengguna("R-07");
        const [b2] = await kueri<{ email: string; nip_nis: string }>(`SELECT email, nip_nis FROM users WHERE id = ${lama}`);
        const disunting = await layanan().update(buatCtx(admin), lama, {
            ...jadiSiswa,
            email: b2!.email,
            nipNis: b2!.nip_nis,
            nama: "Nama Baru",
        });
        expect(disunting.nama).toBe("Nama Baru");
        expect(disunting.consent_guardian_at).toBeNull();
    });

    it("gerbang hanya untuk siswa: guru nonaktif tanpa penanda tetap dapat diaktifkan kembali", async () => {
        const admin = await seedPengguna("R-01");
        const guru = await seedPengguna("R-05", "NONAKTIF");
        const hasil = await layanan().updateStatus(buatCtx(admin), guru, { status: "AKTIF", alasan: undefined });
        expect(hasil.status).toBe("AKTIF");
    });

    it("E.5.2 impor: consent_wali wajib true untuk Siswa/OSIS — baris tanpa/false gagal per baris, baris lain tetap masuk", async () => {
        const admin = await seedPengguna("R-01");
        // E.5.2: kode_unit_kerja wajib dan harus ada pada master (WU-01).
        await kueri("INSERT INTO work_units (nama, kode, jenis) VALUES ('Tata Usaha', 'TU-01', 'TATA_USAHA')");
        const service = new UserImportService(getDb(), layanan(T1), audit(), logger());
        const csv = [
            "nama_lengkap,email,nip_nis,kode_role,kode_unit_kerja,consent_wali",
            `Siswa Ya,${emailUnik()},${nipUnik()},R-07,TU-01,true`,
            `Siswa Besar,${emailUnik()},${nipUnik()},R-07,TU-01,TRUE`,
            `Siswa Tanpa,${emailUnik()},${nipUnik()},R-07,TU-01,`,
            `Siswa Tidak,${emailUnik()},${nipUnik()},R-07,TU-01,false`,
            `Guru Biasa,${emailUnik()},${nipUnik()},R-05,TU-01,`,
        ].join("\n");

        const { job: hasil } = await service.submit(buatCtx(admin), {
            filename: "pengguna.csv",
            contentBase64: Buffer.from(csv, "utf8").toString("base64"),
        });

        expect(hasil).toMatchObject({ status: "SELESAI", total_baris: 5, sukses: 3, gagal: 2 });
        expect(hasil.laporan_gagal.map((b) => b.baris)).toEqual([4, 5]);
        expect(hasil.laporan_gagal[0]?.pesan).toBe("Akun siswa tidak dapat dibuat: persetujuan wali belum terekam (DP-02).");
        const [n] = await kueri<{ n: string }>(
            `SELECT count(*)::text AS n FROM users u JOIN roles r ON r.id = u.role_id
              WHERE r.kode = 'R-07' AND u.consent_guardian_at IS NOT NULL`,
        );
        expect(n?.n).toBe("2");
    });

    describe("lewat HTTP", () => {
        const server: { instance: ReturnType<typeof createServer> | undefined } = { instance: undefined };
        afterEach(async () => {
            if (server.instance !== undefined) {
                await new Promise((r) => server.instance?.close(r));
                server.instance = undefined;
            }
        });

        async function kirim(ctx: AuthContext, body: unknown): Promise<{ status: number; json: unknown }> {
            const app: Express = express();
            app.use(awalRantai({ security: { objectStorageOrigin: "http://minio:9000" } }));
            app.use((_req, res, next) => {
                setAuthContext(res, ctx);
                next();
            });
            const batasi = (): RequestHandler => (_req, _res, next) => next();
            app.use(
                "/api/v1",
                usersRouter({ db: getDb(), penerbitPassword: penerbitPalsu, auditLogger: audit(), logger: logger(), clock: new FixedClock(T1) }, batasi, authorize),
            );
            app.use(
                ujungRantai({
                    limiter: { hit: () => Promise.resolve({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) },
                    logger: logger(),
                }),
            );
            server.instance = createServer(app);
            await new Promise<void>((r) => server.instance?.listen(0, "127.0.0.1", r));
            const url = `http://127.0.0.1:${String((server.instance.address() as AddressInfo).port)}`;
            const res = await fetch(`${url}/api/v1/users`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            return { status: res.status, json: await res.json() };
        }

        it("POST /users siswa: tanpa consent_wali → 422 (DP-02); dengan consent_wali → 201 dan consent_guardian_at terisi", async () => {
            const admin = await seedPengguna("R-01");
            const badan = {
                nama: "Siswa HTTP",
                email: emailUnik(),
                nip_nis: nipUnik(),
                role_id: await idRole("R-07"),
            };

            const ditolak = await kirim(buatCtx(admin), badan);
            expect(ditolak.status).toBe(422);
            expect(ditolak.json).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });

            const ok = await kirim(buatCtx(admin), { ...badan, consent_wali: true });
            expect(ok.status).toBe(201);
            expect(ok.json).toMatchObject({ success: true, data: { status: "AKTIF", consent_guardian_at: T1.toISOString() } });
        });
    });
});
