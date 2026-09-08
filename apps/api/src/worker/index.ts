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
import { JobRegistry, createQueue, createWorker, scheduleAll } from './scheduler.js';

/** Registri pekerjaan milik proses ini. Sampai Phase 02, ia sengaja kosong. */
export const registry = new JobRegistry();

/**
 * Menyalakan worker: memasang seluruh jadwal lalu mulai memungut pekerjaan.
 * Aman dijalankan beberapa instance sekaligus (`JOB-02`).
 */
export async function bootstrap(): Promise<void> {
  const connection = getRedis();
  const queue = createQueue(connection);
  await scheduleAll(queue, registry);
  createWorker(connection, registry);
}
