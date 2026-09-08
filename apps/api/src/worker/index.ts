// Entrypoint job & queue consumer sigm4-worker (SDD-SYS-08).
//
// Worker berbagi basis kode dengan API namun berjalan sebagai proses terpisah
// (`JOB-01`). Ia tidak membuka port HTTP kecuali `/health` (`SDD-SYS-08`).
//
// Pekerjaan yang sesungguhnya lahir mulai Phase 02 — `slot-activation`,
// `tentative-slot-expiry`, `loan-overdue`, `reservation-expiry` (`SDD-01 §4.6`).
// Yang dibangun PR-00-11 adalah kerangkanya: antrean, kunci terdistribusi, dan
// penjadwal.

import { getRedis } from '../shared/cache/index.js';
import { ensurePartitions, verifyChain } from '../shared/audit/index.js';
import { SystemClock } from '../shared/clock/index.js';
import { getDb } from '../shared/db/index.js';
import { EventHandlerRegistry, OutboxDispatcher } from '../shared/events/index.js';
import { JobRegistry, createQueue, createWorker, scheduleAll, wibCronToUtc } from './scheduler.js';
import { startOutboxPoller } from './outbox-poller.js';

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
    name: 'activity-log-partition',
    cron: wibCronToUtc(20, 0),
    handler: async () => {
      await ensurePartitions(getDb(), new SystemClock());
    },
  },
  {
    name: 'activity-log-verify',
    cron: wibCronToUtc(40, 0),
    handler: async () => {
      const clock = new SystemClock();
      const sekarang = clock.now();
      // Hanya bulan berjalan: rantai diperiksa maju setiap hari, dan bulan lama
      // sudah diperiksa pada harinya. Rentang penuh adalah pekerjaan runbook
      // (`SDD-OBS-07`), bukan job harian.
      const dari = new Date(Date.UTC(sekarang.getUTCFullYear(), sekarang.getUTCMonth(), 1));
      const sampai = new Date(Date.UTC(sekarang.getUTCFullYear(), sekarang.getUTCMonth() + 1, 1));
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
export async function bootstrap(): Promise<void> {
  const connection = getRedis();
  const queue = createQueue(connection);
  await scheduleAll(queue, registry);
  createWorker(connection, registry);
  // Dispatcher outbox berjalan di proses yang sama, tetapi bukan sebagai job —
  // alasannya di `outbox-poller.ts`.
  startOutboxPoller(
    new OutboxDispatcher({ registry: eventHandlers, clock: new SystemClock() }),
  );
}
