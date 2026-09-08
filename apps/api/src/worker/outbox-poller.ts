// Pemungut outbox pada entrypoint worker (SDD-EVT-03, SDD-EVT-04).
//
// Bukan pekerjaan terjadwal: katalog `SDD-01 §4.6` tidak memuatnya, dan ia
// memang bukan cron melainkan consumer yang berjalan terus. Mendaftarkannya
// sebagai job BullMQ juga akan menumpuk dua mekanisme percobaan ulang —
// `JOB-06` (3 kali) di atas backoff outbox sendiri (5 kali, `SDD-07 §4.2`).

import type { OutboxDispatcher } from '../shared/events/index.js';

/** Jeda antar putaran saat outbox kosong. Belum dikalibrasi (Phase 07–08). */
export const POLL_INTERVAL_MS = 1_000;

export interface Poller {
  /** Menghentikan pemungutan; putaran yang sedang berjalan tetap diselesaikan. */
  stop(): Promise<void>;
}

/**
 * Menjalankan dispatcher berulang sampai dihentikan.
 *
 * Saat sebuah putaran menghasilkan pekerjaan, putaran berikutnya dijalankan
 * segera — antrean yang menumpuk tidak perlu menunggu jeda. Jeda hanya berlaku
 * ketika tidak ada apa pun yang dapat dikerjakan sekarang.
 */
export function startOutboxPoller(
  dispatcher: OutboxDispatcher,
  jedaMs: number = POLL_INTERVAL_MS,
): Poller {
  let berjalan = true;
  let tidur: NodeJS.Timeout | undefined;
  let bangunkan: (() => void) | undefined;

  const putaran = (async () => {
    while (berjalan) {
      const hasil = await dispatcher.tick();
      if (hasil.processed > 0 || hasil.failed > 0) continue;
      await new Promise<void>((selesai) => {
        bangunkan = selesai;
        tidur = setTimeout(selesai, jedaMs);
      });
    }
  })();

  return {
    async stop() {
      berjalan = false;
      // Membatalkan timer saja akan menggantung `putaran` selamanya: promise
      // tidurnya tidak pernah selesai, dan `stop()` menunggunya.
      if (tidur !== undefined) clearTimeout(tidur);
      bangunkan?.();
      await putaran;
    },
  };
}
