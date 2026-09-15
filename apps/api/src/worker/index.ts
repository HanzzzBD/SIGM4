// Entrypoint job & queue consumer sigm4-worker (SDD-SYS-08).
//
// Worker berbagi basis kode dengan API namun berjalan sebagai proses terpisah
// (`JOB-01`). Ia tidak membuka port HTTP kecuali `/health` (`SDD-SYS-08`).
//
// Pekerjaan yang sesungguhnya lahir mulai Phase 02 — `slot-activation`,
// `tentative-slot-expiry`, `loan-overdue`, `reservation-expiry` (`SDD-01 §4.6`).
// Yang dibangun PR-00-11 adalah kerangkanya: antrean, kunci terdistribusi, dan
// penjadwal.

import { pathToFileURL } from "node:url";
import { getRedis } from "../shared/cache/index.js";
import { ensurePartitions, verifyChain } from "../shared/audit/index.js";
import { SystemClock } from "../shared/clock/index.js";
import { readProcessConfig, zonaProses } from "../shared/config/index.js";
import { assertDatabaseTimeZoneUtc, getDb } from "../shared/db/index.js";
import { Penghenti } from "../shared/lifecycle/index.js";
import {
    EventHandlerRegistry,
    OutboxDispatcher,
} from "../shared/events/index.js";
import {
    HealthRegistry,
    Logger,
    databaseCheck,
    redisCheck,
} from "../shared/observability/index.js";
import {
    JobRegistry,
    createQueue,
    createWorker,
    scheduleAll,
    wibCronToUtc,
} from "./scheduler.js";
import { createHealthServer } from "./health-server.js";
import { startOutboxPoller } from "./outbox-poller.js";
import { BATAS_DRAIN_WORKER_MS, langkahHentiWorker } from "./shutdown.js";

/** Port container — `EXPOSE 3000` pada image bersama (SDD-16 §4.1, SDD-INF-01). */
const HEALTH_PORT = 3000;

/**
 * Registri pekerjaan milik proses ini (`SDD-01 §4.6`).
 *
 * Dua pekerjaan activity log lahir di sini karena keduanya menjaga infrastruktur,
 * bukan domain: tanpa partisi bulan berikutnya, penulisan log berhenti total di
 * hari pertama bulan itu (`SDD-05 §4.4`); tanpa verifikasi harian, penyuntingan
 * langsung di basis data tidak pernah ketahuan (`NFR-S-03d`). Pekerjaan domain
 * menyusul Phase 02.
 */
export const registry = new JobRegistry().register(
    {
        name: "activity-log-partition",
        cron: wibCronToUtc(20, 0),
        handler: async () => {
            await ensurePartitions(getDb(), new SystemClock());
        },
    },
    {
        name: "activity-log-verify",
        cron: wibCronToUtc(40, 0),
        handler: async () => {
            const clock = new SystemClock();
            const sekarang = clock.now();
            // Hanya bulan berjalan: rantai diperiksa maju setiap hari, dan bulan lama
            // sudah diperiksa pada harinya. Rentang penuh adalah pekerjaan runbook
            // (`SDD-OBS-07`), bukan job harian.
            const dari = new Date(
                Date.UTC(sekarang.getUTCFullYear(), sekarang.getUTCMonth(), 1),
            );
            const sampai = new Date(
                Date.UTC(
                    sekarang.getUTCFullYear(),
                    sekarang.getUTCMonth() + 1,
                    1,
                ),
            );
            const hasil = await verifyChain(getDb(), dari, sampai);
            if (hasil.kerusakan.length > 0) {
                // Alarm OBS-05. Rantai TIDAK diperbaiki: memperbaikinya berarti menulis
                // ulang hash atas isi yang sudah berubah — menghapus buktinya.
                throw new Error(
                    `Rantai activity log rusak pada ${String(hasil.kerusakan.length)} entri (AL-03a).`,
                );
            }
        },
    },
);

/**
 * Handler event asinkron. Kosong sampai konsumen pertamanya lahir — katalog
 * `SDD-07 §4.3` menempatkan hampir seluruhnya pada notifikasi (Phase 02+).
 */
export const eventHandlers = new EventHandlerRegistry();

/**
 * Menyalakan worker: memasang seluruh jadwal lalu mulai memungut pekerjaan.
 * Aman dijalankan beberapa instance sekaligus (`JOB-02`).
 */
export async function bootstrap(
    env: NodeJS.ProcessEnv = process.env,
    zona: string = zonaProses(),
): Promise<Penghenti> {
    // Konfigurasi divalidasi sebelum koneksi apa pun dibuka: proses menolak menyala
    // dengan konfigurasi tidak valid atau zona waktu bukan UTC (SDD-INF-08/09).
    const config = readProcessConfig(env, zona);
    // Sesi basis data dipaksa UTC oleh createDb; pemeriksaan ini membuktikannya (SDD-INF-09).
    await assertDatabaseTimeZoneUtc(getDb());
    const connection = getRedis();
    const health = new HealthRegistry().register(
        databaseCheck(getDb()),
        redisCheck(connection),
    );
    const healthServer = createHealthServer(health).listen(HEALTH_PORT);
    const queue = createQueue(connection);
    await scheduleAll(queue, registry);
    const worker = createWorker(connection, registry);
    // Dispatcher outbox berjalan di proses yang sama, tetapi bukan sebagai job —
    // alasannya di `outbox-poller.ts`.
    const poller = startOutboxPoller(
        new OutboxDispatcher({
            registry: eventHandlers,
            clock: new SystemClock(),
        }),
    );
    // Setiap bagian yang menyala di atas punya pasangan penutupnya (SDD-INF-05).
    return new Penghenti(
        langkahHentiWorker({ health, worker, poller, queue, healthServer }),
        {
            batasMs: BATAS_DRAIN_WORKER_MS,
            logger: new Logger({
                clock: new SystemClock(),
                modulBawaan: "worker",
                level: config.logLevel,
            }),
        },
    );
}

// Hanya bila berkas ini dijalankan sebagai proses (command worker pada compose
// staging), bukan saat diimpor uji. Tanpa penjaga ini `bootstrap()` tidak pernah
// dipanggil siapa pun dan worker tidak menyala sebagai proses — butir blocking
// keputusan 24, ditutup PR-00-18 (SDD-SYS-08).
if (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    // SIGTERM/SIGINT hanya ditangkap di sini, saat berjalan sebagai proses: tanpa
    // penangkap, `node` sebagai PID 1 container mengabaikan SIGTERM (SDD-INF-05).
    bootstrap()
        .then((penghenti) => penghenti.pasang())
        .catch((galat: unknown) => {
            // Level eksplisit: LOG_LEVEL yang tidak valid bisa jadi penyebab kegagalannya.
            new Logger({
                clock: new SystemClock(),
                modulBawaan: "worker",
                level: "error",
            }).error("Proses gagal menyala", galat);
            process.exit(1);
        });
}
