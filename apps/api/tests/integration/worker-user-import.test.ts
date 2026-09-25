// Acceptance PR-01-17 (ujung ke ujung): "Berkas > 200 baris diproses BullMQ"
// (IMPT-04, JOB-01, SDD-EVT-04). Terhadap Redis DAN PostgreSQL NYATA:
// submit -> event outbox -> dispatcher -> antrean BullMQ -> worker produksi
// (`registry` dari worker/index) -> pekerjaan SELESAI di basis data.
//
// Tidak ada bagian yang ditiru: yang diuji adalah PEMASANGANNYA — handler event
// yang memasukkan ke antrean, registri yang menjalankan `UserImportRunner`, dan
// pembangunan ulang AuthContext pengunggah dari role nyata (`PermissionCache`).

import { randomUUID } from "node:crypto";
import type { Queue, Worker } from "bullmq";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StudentObligationRegistry } from "../../src/modules/m02-users/services/student-obligation-registry.js";
import { UserImportService } from "../../src/modules/m02-users/services/user-import.service.js";
import { UserService } from "../../src/modules/m02-users/services/user.service.js";
import { AuditLogger } from "../../src/shared/audit/index.js";
import { closeRedis, createRedis, getRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { createAuthContext } from "../../src/shared/auth/index.js";
import { SystemClock } from "../../src/shared/clock/index.js";
import { getDb } from "../../src/shared/db/index.js";
import { EventHandlerRegistry, OutboxDispatcher } from "../../src/shared/events/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { registry, pasangHandlerAntrean } from "../../src/worker/index.js";
import { createQueue, createWorker } from "../../src/worker/scheduler.js";
import { dbmate, kueri } from "../helpers/db.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;
const ADA_REDIS = process.env["REDIS_URL"] !== undefined;

async function tunggu(cek: () => Promise<boolean>, batasMs = 20_000): Promise<boolean> {
    const habis = Date.now() + batasMs;
    while (Date.now() < habis) {
        if (await cek()) return true;
        await new Promise((r) => setTimeout(r, 100));
    }
    return false;
}

describe.skipIf(!ADA_DB || !ADA_REDIS)("PR-01-17 — impor asinkron ujung ke ujung (Redis + PostgreSQL nyata)", () => {
    const koneksi: ReturnType<typeof createRedis>[] = [];
    let antrean: Queue;
    let pekerja: Worker | undefined;

    async function bersihkan(): Promise<void> {
        await kueri("DELETE FROM user_import_jobs");
        await kueri("DELETE FROM users");
        await kueri("DELETE FROM work_units");
        await kueri("DELETE FROM event_outbox");
    }

    beforeAll(async () => {
        dbmate("up");
        const r = createRedis(readRedisConfig());
        koneksi.push(r);
        antrean = createQueue(r);
        // Seperti `bootstrap()` di produksi: klien bersama (dipakai `PermissionCache` di dalam
        // pekerjaan) sudah tersambung sebelum job pertama — `enableOfflineQueue: false`
        // membuat perintah pada koneksi yang belum siap gagal seketika.
        const bersama = getRedis();
        const siap = await tunggu(async () => {
            try {
                return (await bersama.ping()) === "PONG";
            } catch {
                return false;
            }
        }, 5_000);
        expect(siap).toBe(true);
    });
    beforeEach(async () => {
        await antrean.obliterate({ force: true });
        await bersihkan();
    });
    afterEach(async () => {
        await pekerja?.close();
        pekerja = undefined;
        await antrean.obliterate({ force: true });
        await bersihkan();
    });
    afterAll(async () => {
        await antrean.close();
        await Promise.all(koneksi.map((r) => r.quit().catch(() => undefined)));
        await closeRedis();
    });

    it("201 baris: outbox → antrean → worker → SELESAI dengan laporan, atas nama pengunggah (role R-01 nyata)", async () => {
        const [admin] = await kueri<{ id: string }>(`
            INSERT INTO users (nama, email, password_hash, nip_nis, role_id, status, must_change_password)
            VALUES ('Admin E2E', 'e2e-${randomUUID().slice(0, 8)}@sekolah.sch.id', 'x', 'NIPE2E${randomUUID().replace(/-/g, "").slice(0, 12)}',
                    (SELECT id FROM roles WHERE kode = 'R-01'), 'AKTIF', false)
            RETURNING id::text`);
        const adminId = Number(admin?.id);
        // E.5.2: kode_unit_kerja wajib dan harus ada pada master (WU-01).
        await kueri("INSERT INTO work_units (nama, kode, jenis) VALUES ('Tata Usaha', 'TU-01', 'TATA_USAHA')");
        // Konteks pemanggil HTTP: hanya perlu userId (permission dibaca ulang worker dari basis data).
        const ctx = createAuthContext({ userId: adminId, roleCode: "R-01", scopes: new Map([["user.create", "all"]]) });

        const jam = new SystemClock();
        const audit = new AuditLogger({ clock: jam });
        const logger = new Logger({ clock: jam, tulis: () => undefined });
        const layanan = new UserImportService(
            getDb(),
            new UserService(getDb(), audit, new StudentObligationRegistry(), jam),
            audit,
            logger,
            jam,
        );
        const baris = ["nama_lengkap,email,nip_nis,kode_role,kode_unit_kerja"];
        const valid = [1, 2, 3].map(() => `e2e-${randomUUID().slice(0, 8)}@sekolah.sch.id`);
        for (const e of valid) baris.push(`Peserta,${e},NIPP${randomUUID().replace(/-/g, "").slice(0, 12)},R-05,TU-01`);
        for (let i = 0; i < 200; i += 1) baris.push(`Rusak,bukan-email-${String(i)},NIPX${String(i)},R-05,TU-01`);
        const { job } = await layanan.submit(ctx, {
            filename: "besar.csv",
            contentBase64: Buffer.from(baris.join("\n"), "utf8").toString("base64"),
        });
        expect(job.status).toBe("MENUNGGU");

        // Tanpa dispatcher belum ada yang masuk antrean: event baru berupa baris outbox.
        expect(await antrean.getJobCounts("waiting", "active", "completed")).toMatchObject({ waiting: 0, active: 0, completed: 0 });

        const handlers = new EventHandlerRegistry();
        pasangHandlerAntrean(handlers, antrean);
        const dispatcher = new OutboxDispatcher({ registry: handlers, clock: jam });
        const hasil = await dispatcher.drain();
        expect(hasil).toEqual({ processed: 1, failed: 0 });
        expect(await antrean.getJob(`user-import-${job.id}`)).toBeDefined();

        const wr = createRedis(readRedisConfig());
        koneksi.push(wr);
        pekerja = createWorker(wr, registry);

        const selesai = await tunggu(async () => {
            const [b] = await kueri<{ status: string }>(`SELECT status FROM user_import_jobs WHERE id = ${job.id}`);
            return b?.status === "SELESAI";
        });
        expect(selesai).toBe(true);

        const akhir = await layanan.get(ctx, Number(job.id));
        expect(akhir).toMatchObject({ status: "SELESAI", total_baris: 203, sukses: 3, gagal: 200 });
        for (const e of valid) expect(await kueri(`SELECT 1 FROM users WHERE email = '${e}'`)).toHaveLength(1);
        const [selesaiEvent] = await kueri<{ n: string }>("SELECT count(*)::text AS n FROM event_outbox WHERE event_name = 'UserImportCompleted'");
        expect(selesaiEvent?.n).toBe("1");
    });
});
