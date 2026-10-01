// JOB-05 / AL-06 untuk pekerjaan infrastruktur activity log (keputusan 72, utang §10 log
// phase-02): `activity-log-partition` dan `activity-log-verify` berpelaku SYSTEM dan
// meninggalkan ringkasan SCHEDULED_JOB_EXECUTED — berhasil maupun gagal (AL-07).

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { getDb, withTransaction } from "../../src/shared/db/index.js";
import { PEKERJAAN_PARTISI_LOG, PEKERJAAN_VERIFIKASI_LOG, jalankanPartisiLog, jalankanVerifikasiLog } from "../../src/worker/activity-log-jobs.js";
import { registry } from "../../src/worker/index.js";
import { AKSI_RINGKASAN } from "../../src/worker/system-job.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
/** Bulan di dalam jendela partisi uji yang tidak dipakai berkas lain — aman dirusak & dibersihkan. */
const clock = new FixedClock(new Date("2027-10-15T03:00:00Z"));
const BULAN = "waktu >= '2027-10-01' AND waktu < '2027-11-01'";

type Ringkasan = { user_id: string | null; hasil: string; nilai_sesudah: { pekerjaan: string; diproses: number; galat: number; pesan_galat?: string } };
const ringkasan = (pekerjaan: string) =>
    kueri<Ringkasan>(`SELECT user_id::text, hasil::text, nilai_sesudah FROM activity_logs WHERE aksi = '${AKSI_RINGKASAN}' AND nilai_sesudah->>'pekerjaan' = '${pekerjaan}' AND ${BULAN} ORDER BY id`);

describe.skipIf(!ADA_DB)("pekerjaan activity log berpelaku SYSTEM (JOB-05)", () => {
    beforeAll(() => {
        dbmate("up");
    });
    afterEach(async () => {
        await kueri(`DELETE FROM activity_logs WHERE ${BULAN}`);
    });

    it("terdaftar di worker dengan nama Bab 26", () => {
        expect(registry.get(PEKERJAAN_PARTISI_LOG)).toBeDefined();
        expect(registry.get(PEKERJAAN_VERIFIKASI_LOG)).toBeDefined();
    });

    it("partisi: ringkasan SUKSES pelaku SYSTEM, diproses = 4 partisi (bulan berjalan + 3)", async () => {
        const hasil = await jalankanPartisiLog(getDb(), clock);
        expect(hasil.diproses).toBe(4);
        expect(await ringkasan(PEKERJAAN_PARTISI_LOG)).toEqual([{ user_id: null, hasil: "SUKSES", nilai_sesudah: expect.objectContaining({ diproses: 4, galat: 0 }) as unknown }]);
    });

    it("verifikasi: rantai utuh → SUKSES; rantai disunting langsung → GAGAL tercatat DAN galat dilempar (alarm, JOB-06)", async () => {
        const audit = new AuditLogger({ clock });
        const ctx = createAuthContext({ userId: 1, roleCode: "R-01", scopes: new Map() });
        await withTransaction(ctx, async (scope) => {
            for (let i = 0; i < 3; i += 1) await audit.write(scope, { modul: "INVENTARIS", aksi: "ASSET_CONDITION_CHANGED", entitas: "assets", entitasId: i });
        }, getDb());

        expect((await jalankanVerifikasiLog(getDb(), clock)).diproses).toBe(3);
        await kueri(`UPDATE activity_logs SET keterangan = 'disunting diam-diam' WHERE id = (SELECT min(id) FROM activity_logs WHERE ${BULAN})`);
        await expect(jalankanVerifikasiLog(getDb(), clock)).rejects.toThrow("AL-03a");

        const r = await ringkasan(PEKERJAAN_VERIFIKASI_LOG);
        expect(r.map((x) => x.hasil)).toEqual(["SUKSES", "GAGAL"]);
        expect(r[1]?.nilai_sesudah.pesan_galat).toContain("Rantai activity log rusak");
    });
});
