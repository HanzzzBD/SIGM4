// Acceptance PR-01-10: "system_settings + seed parameter bawaan + endpoint
// baca/tulis + validasi rentang" (FR-20.1, SDD-DB-10, SDD-DB-17) — terhadap
// PostgreSQL NYATA. Uji yang mengubah nilai memulihkan SEMUA baris ke
// `nilai_bawaan` dan `updated_by` ke NULL: baris terakhir yang masih merujuk
// akun uji akan menggagalkan berkas uji lain yang membersihkan `users`.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { SettingService } from "../../src/modules/m20-settings/services/setting.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { AKAR } from "../helpers/bab113.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Setting', 'setting-uji-${randomUUID()}@sekolah.sch.id', 'x',
                'NIPSETTINGUJI${randomUUID().replace(/-/g, "").slice(0, 16)}',
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
        scopes: new Map([["setting.manage", "all"]]),
    });
}

function buatService(): SettingService {
    return new SettingService(
        getDb(),
        new AuditLogger({ clock: new FixedClock(new Date("2026-09-19T00:00:00Z")) }),
    );
}

async function pulihkan(): Promise<void> {
    await kueri("UPDATE system_settings SET value = nilai_bawaan, updated_by = NULL");
}

async function nilai(key: string): Promise<unknown> {
    const [baris] = await kueri<{ value: unknown }>(`SELECT value FROM system_settings WHERE key = '${key}'`);
    return baris?.value;
}

async function jumlahLog(key: string): Promise<number> {
    const [baris] = await kueri<{ n: string }>(`
        SELECT count(*)::text AS n FROM activity_logs
         WHERE modul = 'm20-settings' AND aksi = 'SETTING_UPDATED'
           AND nilai_sesudah ? '${key}'
    `);
    return Number(baris?.n ?? 0);
}

describe.skipIf(!ADA_DB)("PR-01-10 — parameter sistem (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    afterEach(pulihkan);

    it("katalog endpoint: GET /settings (setting.view) dan PUT /settings (setting.manage)", () => {
        const rute = registry.all().filter((r) => r.path === "/settings");
        expect(rute.map((r) => [r.method, r.permission])).toEqual([
            ["GET", "setting.view"],
            ["PUT", "setting.manage"],
        ]);
    });

    it("seed sama persis dengan katalog SDD-05 §4.7a — bukan salinan yang ditulis di uji ini", async () => {
        const sdd = readFileSync(new URL("docs/SDD/05-database-design.md", AKAR), "utf8");
        const bagian = sdd.slice(sdd.indexOf("### 4.7a"), sdd.indexOf("### 4.8"));
        const katalog = [...bagian.matchAll(/^\| `([a-z_]+\.[a-z0-9_]+)` \| `(\w+)` \| `(\w+)` \| (\d+) \| (\d+) – (\d+) \|/gm)].map(
            (m) => ({ key: m[1], kelompok: m[2], tipe: m[3], bawaan: Number(m[4]), min: Number(m[5]), maks: Number(m[6]) }),
        );
        expect(katalog.length).toBeGreaterThan(0);

        const rows = await kueri<{ key: string; kelompok: string; tipe: string; nilai_bawaan: number; nilai_min: string; nilai_maks: string }>(
            "SELECT key, kelompok::text, tipe::text, nilai_bawaan, nilai_min::text, nilai_maks::text FROM system_settings ORDER BY key",
        );
        expect(
            rows.map((r) => ({
                key: r.key,
                kelompok: r.kelompok,
                tipe: r.tipe,
                bawaan: r.nilai_bawaan,
                min: Number(r.nilai_min),
                maks: Number(r.nilai_maks),
            })),
        ).toEqual([...katalog].sort((a, b) => (a.key! < b.key! ? -1 : 1)));
    });

    it("list(): setiap parameter membawa penjelasan dan nilai bawaan (AC 2)", async () => {
        const adminId = await seedAdmin();
        const hasil = await buatService().list(buatCtx(adminId), { page: 1, perPage: 100 });
        expect(hasil.total).toBeGreaterThanOrEqual(6);
        for (const s of hasil.rows) {
            expect(s.deskripsi.length).toBeGreaterThan(0);
            expect(s.nilai_bawaan).toBeDefined();
        }
        expect(hasil.rows.find((s) => s.key === "denda.cap_persen")).toMatchObject({ value: 30, nilai_bawaan: 30 });
    });

    it("list(): terpaginasi dan dapat disaring per kelompok (SDD-PERF-04, P-70)", async () => {
        const adminId = await seedAdmin();
        const reservasi = await buatService().list(buatCtx(adminId), { page: 1, perPage: 100, kelompok: "RESERVASI" });
        expect(reservasi.total).toBe(4);
        expect(reservasi.rows.every((s) => s.kelompok === "RESERVASI")).toBe(true);

        const halaman2 = await buatService().list(buatCtx(adminId), { page: 2, perPage: 3, kelompok: "RESERVASI" });
        expect(halaman2.rows).toHaveLength(1);
        expect(halaman2.totalPages).toBe(2);
    });

    it("update(): nilai sah tersimpan dan terbaca pada permintaan berikutnya tanpa restart (AC 1)", async () => {
        const adminId = await seedAdmin();
        const hasil = await buatService().update(buatCtx(adminId), { "reservasi.horizon_hari": 120 });

        // PUT mengembalikan HANYA parameter yang diminta, bukan seluruh katalog.
        expect(hasil.map((s) => s.key)).toEqual(["reservasi.horizon_hari"]);
        expect(hasil[0]?.value).toBe(120);
        expect(await nilai("reservasi.horizon_hari")).toBe(120);
        const [baris] = await kueri<{ updated_by: string }>(
            "SELECT updated_by::text FROM system_settings WHERE key = 'reservasi.horizon_hari'",
        );
        expect(baris?.updated_by).toBe(String(adminId));
    });

    it("update(): perubahan tercatat SETTING_UPDATED lengkap dengan nilai lama dan baru (AC 3)", async () => {
        const adminId = await seedAdmin();
        await buatService().update(buatCtx(adminId), { "reservasi.ttl_tentative_jam": 24, "denda.cap_persen": 25.5 });

        const [log] = await kueri<{ nilai_sebelum: unknown; nilai_sesudah: unknown; hasil: string }>(`
            SELECT nilai_sebelum, nilai_sesudah, hasil FROM activity_logs
             WHERE modul = 'm20-settings' AND aksi = 'SETTING_UPDATED'
               AND nilai_sesudah ? 'reservasi.ttl_tentative_jam'
             ORDER BY id DESC LIMIT 1
        `);
        expect(log).toMatchObject({
            hasil: "SUKSES",
            nilai_sebelum: { "reservasi.ttl_tentative_jam": 48, "denda.cap_persen": 30 },
            nilai_sesudah: { "reservasi.ttl_tentative_jam": 24, "denda.cap_persen": 25.5 },
        });
    });

    it("update(): nilai di luar rentang ditolak dengan penjelasan batasnya, dan TIDAK mengubah apa pun (FR-20.1 A1)", async () => {
        const adminId = await seedAdmin();
        const logSebelum = await jumlahLog("reservasi.horizon_hari");
        // Satu nilai sah + satu tidak sah: permintaan ditolak UTUH.
        await expect(
            buatService().update(buatCtx(adminId), { "reservasi.horizon_hari": 100, "reservasi.ttl_tentative_jam": 9999 }),
        ).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            detail: {
                errors: [{ field: "reservasi.ttl_tentative_jam", message: "Nilai harus antara 1 dan 168." }],
            },
        });

        expect(await nilai("reservasi.horizon_hari")).toBe(90);
        expect(await nilai("reservasi.ttl_tentative_jam")).toBe(48);
        expect(await jumlahLog("reservasi.horizon_hari")).toBe(logSebelum);
    });

    it("update(): ditolak tanpa entri log — tidak ada perubahan yang tercatat", async () => {
        const adminId = await seedAdmin();
        const sebelum = await jumlahLog("denda.cap_persen");
        await expect(buatService().update(buatCtx(adminId), { "denda.cap_persen": 101 })).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
        });
        expect(await jumlahLog("denda.cap_persen")).toBe(sebelum);
    });

    it("update(): kunci tidak dikenal, tipe salah, dan pecahan pada BILANGAN_BULAT ditolak bersamaan", async () => {
        const adminId = await seedAdmin();
        await expect(
            buatService().update(buatCtx(adminId), {
                "tidak.ada": 1,
                "reservasi.horizon_hari": "90",
                "peminjaman.batas_perpanjangan": 1.5,
            }),
        ).rejects.toMatchObject({
            kode: "VALIDATION_ERROR",
            detail: {
                errors: expect.arrayContaining([
                    { field: "tidak.ada", message: "Parameter tidak dikenal." },
                    { field: "reservasi.horizon_hari", message: "Nilai harus berupa angka." },
                    { field: "peminjaman.batas_perpanjangan", message: "Nilai harus berupa bilangan bulat." },
                ]),
            },
        });
    });

    it("update(): nilai yang tidak berubah tidak ditulis dan tidak dicatat", async () => {
        const adminId = await seedAdmin();
        const sebelum = await jumlahLog("reservasi.kuota_tertunda_siswa_osis");
        await buatService().update(buatCtx(adminId), { "reservasi.kuota_tertunda_siswa_osis": 2 });
        expect(await jumlahLog("reservasi.kuota_tertunda_siswa_osis")).toBe(sebelum);
        const [baris] = await kueri<{ updated_by: string | null }>(
            "SELECT updated_by::text FROM system_settings WHERE key = 'reservasi.kuota_tertunda_siswa_osis'",
        );
        expect(baris?.updated_by).toBeNull();
    });

    it("skema menolak baris salah bentuk meski validasi service terlewat (CHECK tipe/rentang)", async () => {
        await expect(
            kueri(`INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, deskripsi)
                   VALUES ('probe.salah_bentuk', 'DENDA', 'BILANGAN_BULAT', '"teks"', '1', 'probe')`),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
            kueri(`INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, nilai_min, nilai_maks, deskripsi)
                   VALUES ('probe.rentang_terbalik', 'DENDA', 'BILANGAN_BULAT', '5', '5', 10, 1, 'probe')`),
        ).rejects.toMatchObject({ code: "23514" });
    });

    it("seed idempoten: menjalankan ulang tidak menimpa nilai yang sudah diubah Administrator (SDD-DB-10)", async () => {
        const adminId = await seedAdmin();
        await buatService().update(buatCtx(adminId), { "denda.cap_persen": 20 });
        await kueri(`
            INSERT INTO system_settings (key, kelompok, tipe, value, nilai_bawaan, nilai_min, nilai_maks, deskripsi)
            VALUES ('denda.cap_persen', 'DENDA', 'DESIMAL', '30', '30', 1, 100, 'x')
            ON CONFLICT (key) DO NOTHING
        `);
        expect(await nilai("denda.cap_persen")).toBe(20);
    });
});
