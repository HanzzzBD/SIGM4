// Entrypoint job & queue consumer sigm4-worker (SDD-SYS-08).
//
// Worker berbagi basis kode dengan API namun berjalan sebagai proses terpisah
// (`JOB-01`). Ia tidak membuka port HTTP kecuali `/health` (`SDD-SYS-08`).
//
// Pekerjaan yang sesungguhnya lahir mulai Phase 02 — `slot-activation` dan
// `tentative-slot-expiry` (PR-02-37), `loan-overdue`, `reservation-expiry` (`SDD-01 §4.6`).
// Yang dibangun PR-00-11 adalah kerangkanya: antrean, kunci terdistribusi, dan
// penjadwal.

import { pathToFileURL } from "node:url";
import { getRedis } from "../shared/cache/index.js";
import { AuditLogger } from "../shared/audit/index.js";
import { PermissionCache } from "../shared/auth/index.js";
import { SystemClock } from "../shared/clock/index.js";
import { readWorkerConfig, zonaProses } from "../shared/config/index.js";
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
    RETRY_OPTIONS,
    createQueue,
    createWorker,
    scheduleAll,
    wibCronToUtc,
} from "./scheduler.js";
import {
    EVENT_IMPOR_DIMINTA,
    NAMA_PEKERJAAN_IMPOR,
    UserImportRunner,
    UserImportService,
    UserService,
    idJobAntreanImpor,
} from "../modules/m02-users/index.js";
import { EVENT_BERKAS_TERUNGGAH, FileScanService, KlienClamd, NAMA_PEKERJAAN_PINDAI, idJobPindai } from "../modules/m06-documents/index.js";
import { PenyimpananS3 } from "../shared/storage/index.js";
import type { KonfigurasiAntivirus, KonfigurasiPenyimpanan } from "../shared/config/index.js";
import { PenyiarNotifikasi, buatPengirimPush, fcmCheck, kirimPushNotifikasi, pasangKonsumenNotifikasi } from "../modules/m17-notifications/index.js";
import type { PengirimPush } from "../modules/m17-notifications/index.js";
import { createSystemAuthContext } from "../shared/auth/system-context.js";
import type { Queue } from "bullmq";
import { createHealthServer } from "./health-server.js";
import { PEKERJAAN_PARTISI_LOG, PEKERJAAN_VERIFIKASI_LOG, jalankanPartisiLog, jalankanVerifikasiLog } from "./activity-log-jobs.js";
import { CRON_SLA, PEKERJAAN_SLA, jalankanPemeriksaanSla } from "./approval-sla-check.js";
import { PEKERJAAN_ARSIP_NOTIFIKASI, jalankanArsipNotifikasi } from "./notification-archive.js";
import { startOutboxPoller } from "./outbox-poller.js";
import { CRON_AKTIVASI_SLOT, CRON_KEDALUWARSA_SLOT, PEKERJAAN_AKTIVASI_SLOT, PEKERJAAN_KEDALUWARSA_SLOT, jalankanAktivasiSlot, jalankanKedaluwarsaSlot } from "./slot-jobs.js";
import { PEKERJAAN_KELULUSAN, jalankanKelulusan } from "./student-graduation.js";
import { BATAS_DRAIN_WORKER_MS, langkahHentiWorker } from "./shutdown.js";

/** Port container — `EXPOSE 3000` pada image bersama (SDD-16 §4.1, SDD-INF-01). */
const HEALTH_PORT = 3000;

/** Job push per notifikasi (FR-17.2, SDD-08 §4.4a, keputusan 80c). */
export const NAMA_PEKERJAAN_PUSH = "notification-push";
/** `jobId` tetap per notifikasi — event yang diulang tidak menggandakan push. */
export const idJobPush = (notifikasiId: number): string => `push-${String(notifikasiId)}`;

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
        name: PEKERJAAN_PARTISI_LOG,
        cron: wibCronToUtc(20, 0),
        handler: async () => {
            await jalankanPartisiLog(getDb(), new SystemClock());
        },
    },
    {
        name: PEKERJAAN_VERIFIKASI_LOG,
        cron: wibCronToUtc(40, 0),
        handler: async () => {
            await jalankanVerifikasiLog(getDb(), new SystemClock());
        },
    },
    {
        // Bab 12.4: setiap hari 00:10 WIB (SL-03, DP-10). Pelaku SYSTEM (AL-06).
        name: PEKERJAAN_KELULUSAN,
        cron: wibCronToUtc(10, 0),
        handler: async () => {
            await jalankanKelulusan(getDb(), new SystemClock());
        },
    },
    {
        name: PEKERJAAN_AKTIVASI_SLOT,
        cron: CRON_AKTIVASI_SLOT,
        handler: async () => {
            await jalankanAktivasiSlot(getDb(), new SystemClock());
        },
    },
    {
        name: PEKERJAAN_KEDALUWARSA_SLOT,
        cron: CRON_KEDALUWARSA_SLOT,
        handler: async () => {
            await jalankanKedaluwarsaSlot(getDb(), new SystemClock());
        },
    },
    {
        // SDD-02 §4.5: SLA, pengingat, eskalasi persetujuan. Pelaku SYSTEM (AL-06).
        name: PEKERJAAN_SLA,
        cron: CRON_SLA,
        handler: async () => {
            await jalankanPemeriksaanSla(getDb(), new SystemClock());
        },
    },
    {
        // Bab 26: setiap hari 01:30 WIB (FR-17.1 A2, keputusan 79d). Pelaku SYSTEM (AL-06).
        name: PEKERJAAN_ARSIP_NOTIFIKASI,
        cron: wibCronToUtc(30, 1),
        handler: async () => {
            await jalankanArsipNotifikasi(getDb(), new SystemClock());
        },
    },
    {
        // Tanpa cron: dijadwalkan konsumen notifikasi setelah commit (FR-17.2, keputusan 80c).
        name: NAMA_PEKERJAAN_PUSH,
        handler: async (job) => {
            const percobaan = job.attemptsMade + 1;
            await kirimPushNotifikasi(
                { db: getDb(), clock: new SystemClock(), ctx: pelakuNotifikasi, pengirim: pengirimPush ?? buatPengirimPush(null) },
                Number((job.data as { notification_id: number }).notification_id),
                percobaan,
                percobaan >= (job.opts.attempts ?? 1),
            );
        },
    },
    {
        // Tanpa cron: dijadwalkan handler `FileUploaded` (SDD-FS-04, PR-03-05). Pelaku SYSTEM (AL-06).
        name: NAMA_PEKERJAAN_PINDAI,
        handler: async (job) => {
            if (pemindaian === undefined) throw new Error("Pemindai berkas belum dipasang bootstrap.");
            const clock = new SystemClock();
            const logger = new Logger({ clock, modulBawaan: NAMA_PEKERJAAN_PINDAI });
            const service = new FileScanService(getDb(), new PenyimpananS3(pemindaian.penyimpanan, clock), new KlienClamd(pemindaian.antivirus), new AuditLogger({ clock, logger }), logger, clock);
            // Maks. 3 percobaan (RETRY_OPTIONS, SDD-09 §4.2); yang terakhir menutup berkas FAILED.
            const akhir = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
            await service.pindai(pelakuPindai, String((job.data as { file_id: string | number }).file_id), akhir);
        },
    },
    {
        // Tanpa cron: dimasukkan ke antrean oleh handler `UserImportRequested` (IMPT-04).
        name: NAMA_PEKERJAAN_IMPOR,
        handler: async (job) => {
            const clock = new SystemClock();
            const db = getDb();
            const logger = new Logger({ clock, modulBawaan: "user-import" });
            const audit = new AuditLogger({ clock, logger });
            const service = new UserImportService(
                db,
                new UserService(db, audit, undefined, clock),
                audit,
                logger,
                clock,
            );
            const runner = new UserImportRunner(
                db,
                new PermissionCache(db, getRedis()),
                service,
                logger,
            );
            // JOB-06: percobaan terakhir menutup pekerjaan sebagai GAGAL bila masih galat.
            const akhir = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
            await runner.run(job.data, akhir);
        },
    },
);

/**
 * Memasang handler event yang meneruskan ke antrean. Dipanggil `bootstrap` sekali,
 * setelah antrean ada — antrean tidak dapat dibuat pada saat modul dimuat.
 */
export function pasangHandlerAntrean(handlers: EventHandlerRegistry, queue: Queue): void {
    handlers.on(EVENT_BERKAS_TERUNGGAH, async (event) => {
        const fileId = String((event.payload as { file_id: string | number }).file_id);
        await queue.add(NAMA_PEKERJAAN_PINDAI, { file_id: fileId }, { ...RETRY_OPTIONS, jobId: idJobPindai(fileId) });
    });
    handlers.on(EVENT_IMPOR_DIMINTA, async (event) => {
        const payload = event.payload as { job_id: string | number; oleh: number };
        // `jobId` tetap: event outbox at-least-once (SDD-EVT-07) tidak melipatgandakan pekerjaan.
        await queue.add(
            NAMA_PEKERJAAN_IMPOR,
            { job_id: payload.job_id, oleh: payload.oleh },
            { ...RETRY_OPTIONS, jobId: idJobAntreanImpor(payload.job_id) },
        );
    });
}

/**
 * Handler event asinkron. Kosong sampai konsumen pertamanya lahir — katalog
 * `SDD-07 §4.3` menempatkan hampir seluruhnya pada notifikasi (Phase 02+).
 */
export const eventHandlers = new EventHandlerRegistry();

// SDD-08 §4.2a (keputusan 78): konsumen penerbit notifikasi, pelaku SYSTEM (SDD-03 §5).
// Dipasang saat modul dimuat — koneksi basis data baru dibuka saat event diproses.
const pelakuNotifikasi = createSystemAuthContext("outbox-notifikasi");
let penyiarNotifikasi: PenyiarNotifikasi | undefined;
/** Antrean & pengirim push dipasang `bootstrap` (keputusan 80c); sebelum itu push tidak dijadwalkan. */
let antreanPush: Queue | undefined;
let pengirimPush: PengirimPush | undefined;
/** Pemindai AV (SDD-FS-04): alamat storage & clamd dari konfigurasi tervalidasi, dipasang `bootstrap`. */
const pelakuPindai = createSystemAuthContext(NAMA_PEKERJAAN_PINDAI);
let pemindaian: { readonly penyimpanan: KonfigurasiPenyimpanan; readonly antivirus: KonfigurasiAntivirus } | undefined;
/** Uji worker memasang alamat tanpa `bootstrap` penuh. */
export function pasangPemindaian(penyimpanan: KonfigurasiPenyimpanan, antivirus: KonfigurasiAntivirus): void {
    pemindaian = { penyimpanan, antivirus };
}
pasangKonsumenNotifikasi(eventHandlers, {
    db: getDb,
    clock: new SystemClock(),
    ctx: () => pelakuNotifikasi,
    jadwalkanPush: async (ids) => {
        if (antreanPush === undefined) return;
        for (const id of ids) await antreanPush.add(NAMA_PEKERJAAN_PUSH, { notification_id: id }, { ...RETRY_OPTIONS, jobId: idJobPush(id) });
    },
    // SDD-08 §4.3a: siaran ke `ntf:user:{id}` setelah commit — dibuat saat pertama dipakai.
    penyiar: () => (penyiarNotifikasi ??= new PenyiarNotifikasi(getRedis(), new Logger({ clock: new SystemClock(), modulBawaan: "notifikasi" }))),
});

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
    // `TOTP_ENCRYPTION_KEY` divalidasi juga (`readWorkerConfig`, PR-02-08) meski worker
    // belum memakainya: operator sudah menyediakannya di berkas env yang sama dengan API.
    const config = readWorkerConfig(env, zona);
    // Sesi basis data dipaksa UTC oleh createDb; pemeriksaan ini membuktikannya (SDD-INF-09).
    await assertDatabaseTimeZoneUtc(getDb());
    const connection = getRedis();
    const health = new HealthRegistry().register(
        databaseCheck(getDb()),
        redisCheck(connection),
        // OBS-06: dilaporkan, tidak menentukan `ready` (keputusan 80a).
        fcmCheck(config.fcm),
    );
    const healthServer = createHealthServer(health).listen(HEALTH_PORT);
    const queue = createQueue(connection);
    pasangHandlerAntrean(eventHandlers, queue);
    antreanPush = queue;
    pasangPemindaian(config.objectStorage, config.antivirus);
    pengirimPush = buatPengirimPush(config.fcm);
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
