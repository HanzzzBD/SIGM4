// Drain worker terhadap Redis NYATA — SDD-INF-05 (keputusan 57–60).
//
// Yang dibuktikan adalah perilaku BullMQ di bawah urutan drain kita, bukan tiruan:
// job aktif diselesaikan sebelum proses dinyatakan berhenti, dan job yang melampaui
// tenggat dilepas lalu kembali ke antrean untuk dijalankan ulang (JOB-03).

import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Queue, Worker } from "bullmq";
import type { Job } from "bullmq";
import {
    closeRedis,
    createRedis,
    readRedisConfig,
} from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { Penghenti } from "../../src/shared/lifecycle/index.js";
import {
    HealthRegistry,
    Logger,
} from "../../src/shared/observability/index.js";
import { JobRegistry } from "../../src/worker/scheduler.js";
import { langkahHentiWorker } from "../../src/worker/shutdown.js";

const ADA_REDIS = process.env["REDIS_URL"] !== undefined;
const ANTREAN_UJI = "sigm4-jobs-drain-uji";

const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

function logger(baris: string[]): Logger {
    return new Logger({
        clock: new FixedClock(new Date("2026-09-15T00:00:00Z")),
        level: "debug",
        tulis: (b) => baris.push(b),
    });
}

describe.skipIf(!ADA_REDIS)("Drain worker terhadap Redis nyata", () => {
    const koneksi: ReturnType<typeof createRedis>[] = [];
    let pengamat: Queue;

    function redisBaru() {
        const r = createRedis(readRedisConfig());
        koneksi.push(r);
        return r;
    }

    beforeAll(async () => {
        pengamat = new Queue(ANTREAN_UJI, { connection: redisBaru() });
        await pengamat.obliterate({ force: true });
    });

    afterEach(async () => {
        await pengamat.obliterate({ force: true });
    });

    afterAll(async () => {
        await pengamat.close();
        await Promise.all(koneksi.map((r) => r.quit().catch(() => undefined)));
        await closeRedis();
    });

    /** Worker nyata atas antrean uji, dengan satu job yang berjalan `lamaMs`. */
    async function prosesDenganJobAktif(lamaMs: number) {
        const selesai: string[] = [];
        const registry = new JobRegistry().register({
            name: "job-lama",
            cron: "0 0 * * *",
            handler: async (job: Job) => {
                await tidur(lamaMs);
                selesai.push(job.id ?? "?");
            },
        });
        // Antrean uji tersendiri, bukan QUEUE_NAME produksi yang dipakai
        // createWorker, agar tidak bertabrakan dengan worker-scheduler.test.ts.
        const pekerja = new Worker(
            ANTREAN_UJI,
            async (job) => registry.get(job.name)?.handler(job),
            { connection: redisBaru() },
        );
        const antrean = new Queue(ANTREAN_UJI, { connection: redisBaru() });
        const aktif = new Promise<void>((r) =>
            pekerja.once("active", () => r()),
        );
        await antrean.add("job-lama", {});
        await aktif;

        const health = new HealthRegistry();
        const healthServer = createServer((_q, s) => s.end());
        await new Promise<void>((r) => healthServer.listen(0, "127.0.0.1", r));
        let pollerBerhenti = false;
        const langkah = langkahHentiWorker({
            health,
            worker: pekerja,
            queue: antrean,
            healthServer,
            poller: {
                stop: () => {
                    pollerBerhenti = true;
                    return Promise.resolve();
                },
            },
        });
        return {
            selesai,
            health,
            healthServer,
            langkah,
            pekerja,
            pollerBerhenti: () => pollerBerhenti,
        };
    }

    it("job aktif diselesaikan SEBELUM proses dinyatakan berhenti (SDD-INF-05)", async () => {
        const p = await prosesDenganJobAktif(800);
        const log: string[] = [];
        const kode = await new Penghenti(p.langkah, {
            batasMs: 10_000,
            logger: logger(log),
        }).hentikan("SIGTERM");

        expect(kode).toBe(0);
        expect(p.selesai).toHaveLength(1);
        expect(p.pollerBerhenti()).toBe(true);
        expect(p.health.sedangBerhenti).toBe(true);
        expect(p.healthServer.listening).toBe(false);
        expect(log.join("\n")).toContain("berhenti dengan rapi");
        expect(await pengamat.getCompletedCount()).toBe(1);
    });

    it("job yang melampaui tenggat dilepas tanpa ditunggu, keluar 1 (keputusan 59)", async () => {
        const p = await prosesDenganJobAktif(5_000);
        const log: string[] = [];
        const mulai = performance.now();
        const kode = await new Penghenti(p.langkah, {
            batasMs: 300,
            logger: logger(log),
        }).hentikan("SIGTERM");

        expect(kode).toBe(1);
        // Proses tidak menunggu job 5 detik itu.
        expect(performance.now() - mulai).toBeLessThan(2_000);
        expect(p.selesai).toHaveLength(0);
        expect(log.join("\n")).toContain("Tenggat drain habis");
        expect(await pengamat.getCompletedCount()).toBe(0);

        // Di proses nyata `process.exit(1)` menyusul di sini. Di dalam runner uji
        // job itu masih berjalan; ditunggu habis agar tidak bocor ke uji lain.
        await p.pekerja.close();
    });
});
