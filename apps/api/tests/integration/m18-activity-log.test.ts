// Acceptance PR-01-08: "Penelusuran activity log + filter + detail
// sebelum/sesudah" (FR-18.2) — terhadap PostgreSQL NYATA. `activity_logs`
// adalah riwayat BERSAMA seluruh berkas uji dan tidak pernah dibersihkan di
// sini (append-only, AL-03b) — setiap uji mengisolasi diri lewat penanda unik
// (`modul`/`entitas_id`/`user_id`), bukan lewat tabel kosong.

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { registry } from "../../src/api/index.js";
import { ActivityLogService } from "../../src/modules/m18-activity-log/services/activity-log.service.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import type { AuthContext } from "../../src/shared/auth/index.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

/**
 * UUID, bukan penghitung: `activity_logs` TIDAK pernah dibersihkan (append-only,
 * AL-03b), jadi proses uji terpisah (mis. jalan ulang setelah kegagalan) tidak
 * boleh pernah menghasilkan penanda yang sama dengan baris yang sudah ada.
 */
function kodeUnik(awalan: string): string {
    return `${awalan}-${randomUUID()}`;
}
function emailUnik(): string {
    return `activity-log-uji-${randomUUID()}@sekolah.sch.id`;
}
function nipUnik(): string {
    return `NIPACTIVITYLOGUJI${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function seedAdmin(): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
        VALUES ('Admin Uji Activity Log', '${emailUnik()}', 'x', '${nipUnik()}',
                (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false)
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan admin uji");
    return Number(baris.id);
}

interface SeedLogInput {
    readonly waktu: Date;
    readonly userId?: number;
    readonly role?: string;
    readonly modul: string;
    readonly aksi: string;
    readonly entitas?: string;
    readonly entitasId?: number;
}

/** Menyisipkan baris `activity_logs` LANGSUNG — `row_hash` dummy karena rantai hash bukan yang diuji di sini. */
async function seedLog(input: SeedLogInput): Promise<string> {
    const [baris] = await kueri<{ id: string }>(`
        INSERT INTO activity_logs (waktu, user_id, user_nama, role, modul, aksi, entitas, entitas_id, hasil, row_hash)
        VALUES (
            '${input.waktu.toISOString()}',
            ${input.userId === undefined ? "NULL" : input.userId},
            'Pelaku Uji',
            ${input.role === undefined ? "NULL" : `'${input.role}'`},
            '${input.modul}',
            '${input.aksi}',
            ${input.entitas === undefined ? "NULL" : `'${input.entitas}'`},
            ${input.entitasId === undefined ? "NULL" : input.entitasId},
            'SUKSES',
            decode('00', 'hex')
        )
        RETURNING id::text
    `);
    if (baris === undefined) throw new Error("Gagal menyisipkan activity log uji");
    return baris.id;
}

function buatCtx(userId: number): AuthContext {
    return createAuthContext({
        userId,
        roleCode: "ADMIN",
        scopes: new Map([["activity_log.view", "all"]]),
    });
}

function buatService(): ActivityLogService {
    return new ActivityLogService(
        getDb(),
        new AuditLogger({ clock: new FixedClock(new Date("2026-09-18T00:00:00Z")) }),
    );
}

describe.skipIf(!ADA_DB)("PR-01-08 — penelusuran activity log (acceptance)", () => {
    beforeAll(() => {
        dbmate("up");
    });

    it("katalog endpoint: GET /activity-logs berpermission activity_log.view", () => {
        const route = registry.all().find((r) => r.path === "/activity-logs");
        expect(route).toMatchObject({ method: "GET", permission: "activity_log.view" });
    });

    it("list(): filter kombinasi modul+aksi mengembalikan HANYA baris yang cocok, terurut terbaru (FR-18.2 langkah 2-3)", async () => {
        const adminId = await seedAdmin();
        const modul = kodeUnik("m-uji");
        const aksi = kodeUnik("AKSI_UJI");
        const sekarang = new Date("2026-09-10T12:00:00Z");
        const lama = await seedLog({
            waktu: new Date(sekarang.getTime() - 3600_000),
            modul,
            aksi,
        });
        const baru = await seedLog({ waktu: sekarang, modul, aksi });

        const hasil = await buatService().list(buatCtx(adminId), {
            page: 1,
            perPage: 25,
            modul,
            aksi,
        });

        expect(hasil.total).toBe(2);
        expect(hasil.rows.map((r) => r.id)).toEqual([baru, lama]);
    });

    it("list(): filter berdasarkan pengguna (user_id)", async () => {
        const adminId = await seedAdmin();
        const pelaku = await seedAdmin();
        const modul = kodeUnik("m-uji");
        const id = await seedLog({
            waktu: new Date("2026-09-11T00:00:00Z"),
            userId: pelaku,
            modul,
            aksi: "AKSI",
        });

        const hasil = await buatService().list(buatCtx(adminId), {
            page: 1,
            perPage: 25,
            userId: pelaku,
        });

        expect(hasil.total).toBe(1);
        expect(hasil.rows[0]?.id).toBe(id);
        expect(hasil.rows[0]?.user_id).toBe(String(pelaku));
    });

    it("list(): filter berdasarkan entitas + entitas_id", async () => {
        const adminId = await seedAdmin();
        const entitas = kodeUnik("m18-entitas");
        const entitasId = 42;
        const id = await seedLog({
            waktu: new Date("2026-09-12T00:00:00Z"),
            modul: kodeUnik("m-uji"),
            aksi: "AKSI",
            entitas,
            entitasId,
        });

        const hasil = await buatService().list(buatCtx(adminId), {
            page: 1,
            perPage: 25,
            entitas,
            entitasId,
        });

        expect(hasil.total).toBe(1);
        expect(hasil.rows[0]?.id).toBe(id);
    });

    it("list(): filter rentang tanggal (dari/sampai) mengecualikan baris di luar rentang", async () => {
        const adminId = await seedAdmin();
        const modul = kodeUnik("m-uji");
        const aksi = kodeUnik("AKSI_UJI");
        // Relatif terhadap SEKARANG (bukan tanggal tetap): migration `0008` hanya
        // membuat partisi bulan berjalan + 3 ke depan dari saat migrasi
        // dijalankan — tanggal tetap dapat jatuh di bulan tanpa partisi.
        const t0 = new Date();
        await seedLog({ waktu: new Date(t0.getTime() - 3600_000 * 5), modul, aksi });
        const tengah = await seedLog({ waktu: new Date(t0.getTime() - 3600_000 * 3), modul, aksi });
        const dalam = await seedLog({ waktu: new Date(t0.getTime() - 3600_000), modul, aksi });

        const hasil = await buatService().list(buatCtx(adminId), {
            page: 1,
            perPage: 25,
            modul,
            aksi,
            dari: new Date(t0.getTime() - 3600_000 * 4),
            sampai: new Date(t0.getTime() - 3600_000 * 0.5),
        });

        expect(hasil.total).toBe(2);
        expect(hasil.rows.map((r) => r.id).sort()).toEqual([dalam, tengah].sort());
    });

    it("list(): paginasi (page/per_page) dan total_pages benar", async () => {
        const adminId = await seedAdmin();
        const modul = kodeUnik("m-uji");
        const aksi = kodeUnik("AKSI_UJI");
        for (let i = 0; i < 5; i += 1) {
            await seedLog({
                waktu: new Date(Date.now() - i * 1000),
                modul,
                aksi,
            });
        }

        const halaman1 = await buatService().list(buatCtx(adminId), {
            page: 1,
            perPage: 2,
            modul,
            aksi,
        });
        expect(halaman1.rows).toHaveLength(2);
        expect(halaman1.total).toBe(5);
        expect(halaman1.totalPages).toBe(3);

        const halaman3 = await buatService().list(buatCtx(adminId), {
            page: 3,
            perPage: 2,
            modul,
            aksi,
        });
        expect(halaman3.rows).toHaveLength(1);
    });

    it("list(): akses terhadap log itu sendiri tercatat sebagai ACTIVITY_LOG_VIEWED (m18-activity-log.md §11, AL-01)", async () => {
        const adminId = await seedAdmin();
        const modul = kodeUnik("m-uji-tanda");

        await buatService().list(buatCtx(adminId), { page: 1, perPage: 5, modul });

        const [log] = await kueri<{ aksi: string; hasil: string; nilai_sesudah: unknown }>(`
            SELECT aksi, hasil, nilai_sesudah FROM activity_logs
             WHERE modul = 'm18-activity-log' AND aksi = 'ACTIVITY_LOG_VIEWED'
             ORDER BY id DESC LIMIT 1
        `);
        expect(log).toMatchObject({ aksi: "ACTIVITY_LOG_VIEWED", hasil: "SUKSES" });
        expect(log?.nilai_sesudah).toMatchObject({
            filter: { modul },
            halaman: 1,
        });
    });
});
