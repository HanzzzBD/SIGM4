// Acceptance PR-02-32: "Pelaku SYSTEM hanya dapat dibentuk dari luar siklus HTTP;
// lulusan dinonaktifkan otomatis setelah tahun ajaran berakhir dan tercatat sebagai
// SYSTEM" (SDD-AUTH-05, AL-06, JOB-01 … JOB-06, SL-03, DP-10) — PostgreSQL NYATA.

import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { publish } from "../../src/shared/events/index.js";
import { registry } from "../../src/worker/index.js";
import { PEKERJAAN_KELULUSAN, jalankanKelulusan } from "../../src/worker/student-graduation.js";
import { AKSI_RINGKASAN, jalankanPekerjaanSistem } from "../../src/worker/system-job.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
// 2026-09-28 03:00 WIB — hari setelah tahun ajaran uji berakhir (27 Sep 2026). Bulan
// berjalan dipakai karena partisi activity_logs hanya ada di sekitar hari ini.
const SESUDAH = new FixedClock(new Date("2026-09-27T20:00:00Z"));
// 2026-09-27 23:00 WIB — hari terakhir tahun ajaran (CAL-03: batas hari WIB, bukan UTC).
const HARI_TERAKHIR = new FixedClock(new Date("2026-09-27T16:00:00Z"));

async function sisip(sql: string): Promise<number> {
    const [baris] = await kueri<{ id: string }>(`${sql} RETURNING id::text`);
    if (baris === undefined) throw new Error("Gagal menyisipkan data uji");
    return Number(baris.id);
}

async function lulusan(): Promise<number> {
    const tahun = await sisip(`INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai, is_active)
                               VALUES ('2025/2026', '2025-10-01', '2026-09-27', true)`);
    const kelas = await sisip(`INSERT INTO work_units (nama, kode, jenis, status) VALUES ('Kelas 12A', '12A', 'KELAS', 'AKTIF')`);
    const siswa = await sisip(`INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password, consent_guardian_at)
                               VALUES ('Lulusan', 'lulus-${randomUUID()}@sekolah.sch.id', 'x', 'NIS${randomUUID().slice(0, 12)}',
                                       (SELECT id FROM roles WHERE kode = 'R-07'), 'AKTIF', false, now())`);
    await kueri(`INSERT INTO student_enrollments (user_id, academic_year_id, kelas_id, lulus) VALUES (${siswa}, ${tahun}, ${kelas}, true)`);
    return siswa;
}

type BarisLog = {
    user_id: string | null;
    user_nama: string | null;
    role: string | null;
    keterangan: string | null;
    hasil: string;
    nilai_sesudah: Record<string, unknown> | null;
};

/** Batas id log saat uji dimulai — activity_logs append-only, tidak dibersihkan antar-uji (AL-03). */
let sejakId = "0";
const log = (aksi: string) =>
    kueri<BarisLog>(
        `SELECT user_id, user_nama, role, keterangan, hasil::text, nilai_sesudah FROM activity_logs
          WHERE aksi = '${aksi}' AND id > ${sejakId} ORDER BY id`,
    );

describe.skipIf(!ADA_DB)("PR-02-32 — student-graduation berpelaku SYSTEM", () => {
    beforeAll(() => {
        dbmate("up");
    });
    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM student_enrollments");
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
        await kueri("DELETE FROM academic_terms");
        await kueri("DELETE FROM academic_years");
        await kueri("DELETE FROM event_outbox");
    }
    beforeEach(async () => {
        await bersihkan();
        const [b] = await kueri<{ id: string }>("SELECT coalesce(max(id), 0)::text AS id FROM activity_logs");
        sejakId = b?.id ?? "0";
    });
    afterEach(bersihkan);

    it("terdaftar di worker pada 00:10 WIB = 17:10 UTC (Bab 12.4, JOB-04)", () => {
        expect(registry.get(PEKERJAAN_KELULUSAN)?.cron).toBe("10 17 * * *");
    });

    it("SL-03: lulusan dinonaktifkan tanpa permintaan HTTP, tercatat SYSTEM + nama pekerjaan (AL-06)", async () => {
        const siswa = await lulusan();

        const hasil = await jalankanKelulusan(getDb(), SESUDAH);

        expect(hasil).toMatchObject({ diproses: 1, galat: 0, rincian: { dinonaktifkan: 1, terblokir: 0 } });
        const [akun] = await kueri<{ status: string; updated_by: string | null }>(`SELECT status::text, updated_by FROM users WHERE id = ${siswa}`);
        // Pelaku SYSTEM tidak punya baris users → updated_by NULL, bukan id palsu.
        expect(akun).toEqual({ status: "NONAKTIF", updated_by: null });

        const [nonaktif] = await log("STUDENT_GRADUATION_DEACTIVATED");
        expect(nonaktif).toMatchObject({ user_id: null, user_nama: "SYSTEM", role: "SYSTEM" });
        expect(nonaktif?.keterangan).toContain(PEKERJAAN_KELULUSAN);
    });

    it("JOB-05: setiap eksekusi meninggalkan satu ringkasan SCHEDULED_JOB_EXECUTED; JOB-03: jalan ulang tidak menghasilkan apa pun", async () => {
        await lulusan();
        await jalankanKelulusan(getDb(), SESUDAH);
        const ulang = await jalankanKelulusan(getDb(), SESUDAH);

        expect(ulang).toMatchObject({ diproses: 0, rincian: { dinonaktifkan: 0 } });
        expect(await log("STUDENT_GRADUATION_DEACTIVATED")).toHaveLength(1);
        const ringkasan = await log(AKSI_RINGKASAN);
        expect(ringkasan).toHaveLength(2);
        expect(ringkasan[0]).toMatchObject({ user_id: null, role: "SYSTEM", hasil: "SUKSES" });
        expect(ringkasan[0]?.nilai_sesudah).toMatchObject({ pekerjaan: PEKERJAAN_KELULUSAN, diproses: 1, galat: 0, dinonaktifkan: 1 });
        expect(ringkasan[0]?.nilai_sesudah).toHaveProperty("mulai");
        expect(ringkasan[0]?.nilai_sesudah).toHaveProperty("selesai");
        expect(ringkasan[1]?.nilai_sesudah).toMatchObject({ diproses: 0 });
    });

    it("hari terakhir tahun ajaran (WIB) belum menonaktifkan", async () => {
        const siswa = await lulusan();
        expect(await jalankanKelulusan(getDb(), HARI_TERAKHIR)).toMatchObject({ diproses: 0 });
        const [akun] = await kueri<{ status: string }>(`SELECT status::text FROM users WHERE id = ${siswa}`);
        expect(akun?.status).toBe("AKTIF");
    });

    it("AL-07/JOB-06: pekerjaan yang gagal tetap diringkas GAGAL, lalu galatnya dilempar ulang untuk dicoba lagi", async () => {
        const audit = new AuditLogger({ clock: SESUDAH });
        await expect(
            jalankanPekerjaanSistem({ nama: "uji-gagal", db: getDb(), audit, clock: SESUDAH }, () => Promise.reject(new Error("basis data padam"))),
        ).rejects.toThrow("basis data padam");

        const [ringkasan] = await log(AKSI_RINGKASAN);
        expect(ringkasan).toMatchObject({ hasil: "GAGAL", role: "SYSTEM" });
        expect(ringkasan?.nilai_sesudah).toMatchObject({ pekerjaan: "uji-gagal", pesan_galat: "basis data padam" });
    });

    it("event outbox yang terbit dari transaksi SYSTEM ber-actor_id NULL", async () => {
        const audit = new AuditLogger({ clock: SESUDAH });
        await jalankanPekerjaanSistem({ nama: "uji-event", db: getDb(), audit, clock: SESUDAH }, async (ctx) => {
            await withTransaction(
                ctx,
                (scope) => publish(scope, { name: "UjiTerjadi", aggregateType: "uji", aggregateId: 1, payload: {} }),
                getDb(),
            );
            return { diproses: 1, galat: 0 };
        });
        const [baris] = await kueri<{ actor_id: string | null }>(`SELECT actor_id FROM event_outbox WHERE event_name = 'UjiTerjadi'`);
        expect(baris).toEqual({ actor_id: null });
    });
});
