// Urutan drain sigm4-worker — SDD-INF-05 (keputusan 57–60).
//
// "Berhenti mengambil pekerjaan baru, selesaikan yang berjalan, baru diganti."
// Urutannya disengaja: pengambilan dihentikan lebih dulu, koneksi ditutup paling
// akhir — menutup Redis atau pool DB selagi job masih berjalan justru membuat
// job itu gagal di tengah jalan, persis yang drain hendak hindari.

import type { Server } from "node:http";
import type { Queue, Worker } from "bullmq";
import { closeRedis } from "../shared/cache/index.js";
import { closeDb } from "../shared/db/index.js";
import { tutupServer } from "../shared/lifecycle/index.js";
import type { LangkahHenti } from "../shared/lifecycle/index.js";
import type { HealthRegistry } from "../shared/observability/index.js";
import type { Poller } from "./outbox-poller.js";

/**
 * Tenggat drain worker. `stop_grace_period` worker pada deploy/staging adalah 60 s;
 * 10 s sisanya milik pemaksaan dan penulisan log sebelum SIGKILL datang.
 */
export const BATAS_DRAIN_WORKER_MS = 50_000;

export interface ProsesWorker {
    readonly health: HealthRegistry;
    readonly worker: Worker;
    readonly poller: Poller;
    readonly queue: Queue;
    readonly healthServer: Server;
}

export function langkahHentiWorker(p: ProsesWorker): LangkahHenti[] {
    return [
        {
            nama: "tandai-berhenti",
            jalankan: () => {
                // Readiness menjawab tidak siap sejak detik pertama drain.
                p.health.tandaiBerhenti();
                return Promise.resolve();
            },
        },
        {
            nama: "hentikan-pengambilan",
            // `Worker.close()` berhenti mengambil job baru dan MENUNGGU job aktif
            // selesai; poller outbox menuntaskan putarannya lalu berhenti.
            jalankan: async () => {
                await Promise.all([p.worker.close(), p.poller.stop()]);
            },
            // Keputusan 59: lewat tenggat, job aktif dilepas tanpa ditunggu. Ia
            // kembali ke antrean lewat pemeriksa stalled dan dijalankan ulang —
            // aman karena setiap job idempoten (JOB-03).
            //
            // Catatan BullMQ: `close()` tanpa paksa sudah berjalan dan menunggu job
            // aktif, dan panggilan berikutnya mengembalikan promise penutupan yang
            // SAMA — `close(true)` di sini tetap menunggu job itu. Yang mencegahnya
            // menahan proses adalah batas `BATAS_PAKSA_MS` pada `Penghenti`, satu
            // penegak untuk setiap langkah paksa.
            paksa: () => p.worker.close(true),
        },
        { nama: "antrean", jalankan: () => p.queue.close() },
        { nama: "health-server", jalankan: () => tutupServer(p.healthServer) },
        {
            nama: "koneksi",
            jalankan: async () => {
                await closeRedis();
                await closeDb();
            },
        },
    ];
}
