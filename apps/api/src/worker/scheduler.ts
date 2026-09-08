// Penjadwal pekerjaan (JOB-01, JOB-02, JOB-04, JOB-06, SDD-AVL-10).
//
// Kunci terdistribusi diperoleh dari BullMQ itu sendiri, bukan dari `SET NX`
// manual (`SDD-AVL-10`). Ia bekerja pada dua tingkat sekaligus:
//
//   penjadwalan  `upsertJobScheduler` berkunci pada nama pekerjaan — instance
//                kedua yang menyalakan diri MEMPERBARUI jadwal yang sama, bukan
//                menambah jadwal kedua
//   eksekusi     BullMQ menyerahkan tiap job yang lahir dari jadwal itu ke tepat
//                SATU consumer, berapa pun jumlah worker yang mendengarkan
//
// `SDD-AVL-10 §3` menyebut alasan menolak lock buatan sendiri: menulisnya berarti
// menulis ulang komponen yang sudah teruji, termasuk kasus tepi lock kedaluwarsa
// saat job masih berjalan.

import { Queue, Worker } from 'bullmq';
import type { Job, JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';

/** Nama antrean tunggal. `JOB-01` menyebutnya antrean **terpusat**. */
export const QUEUE_NAME = 'sigm4-jobs';

/** `JOB-06`: percobaan ulang maksimum 3 kali dengan *exponential backoff*. */
export const RETRY_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
};

export interface JobDefinition {
  /** Nama pekerjaan, mis. `tentative-slot-expiry`. Menjadi nama job BullMQ. */
  readonly name: string;
  /**
   * Cron dalam **UTC** (`JOB-04`). Jam pada Bab 12.4 ditulis WIB dan wajib
   * dikonversi — pakai `wibCronToUtc` agar konversinya tidak dikerjakan tangan.
   */
  readonly cron: string;
  readonly handler: (job: Job) => Promise<void>;
}

export class JobRegistrationError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = 'JobRegistrationError';
  }
}

/**
 * Mengubah jadwal WIB menjadi cron UTC (`JOB-04`).
 *
 * Contoh yang `JOB-04` sebut sendiri: `00:05` WIB → `17:05` UTC hari sebelumnya.
 * Konversi tangan pada jadwal seperti itu mudah keliru satu hari, dan kelirunya
 * baru terlihat saat denda terbit pada hari yang salah.
 */
export function wibCronToUtc(menit: number, jamWib: number): string {
  if (!Number.isInteger(menit) || menit < 0 || menit > 59) {
    throw new JobRegistrationError(`Menit tidak sah: ${menit}`);
  }
  if (!Number.isInteger(jamWib) || jamWib < 0 || jamWib > 23) {
    throw new JobRegistrationError(`Jam WIB tidak sah: ${jamWib}`);
  }
  // WIB = UTC+7, tanpa DST. Pengurangan modulo 24 menangani pergantian hari.
  const jamUtc = (jamWib - 7 + 24) % 24;
  return `${menit} ${jamUtc} * * *`;
}

/** Registri pekerjaan. Satu nama dimiliki tepat satu definisi. */
export class JobRegistry {
  private readonly jobs = new Map<string, JobDefinition>();

  register(...definitions: readonly JobDefinition[]): this {
    for (const job of definitions) {
      if (job.name.trim() === '') {
        throw new JobRegistrationError('Nama pekerjaan tidak boleh kosong.');
      }
      if (this.jobs.has(job.name)) {
        throw new JobRegistrationError(
          `Pekerjaan ${job.name} didaftarkan dua kali — satu nama milik tepat satu definisi.`,
        );
      }
      this.jobs.set(job.name, job);
    }
    return this;
  }

  all(): readonly JobDefinition[] {
    return [...this.jobs.values()];
  }

  get(name: string): JobDefinition | undefined {
    return this.jobs.get(name);
  }
}

/**
 * Memasang seluruh jadwal berulang pada antrean.
 *
 * Aman dijalankan oleh **setiap** instance worker saat menyala — lihat catatan
 * kunci terdistribusi di kepala berkas ini.
 */
export async function scheduleAll(queue: Queue, registry: JobRegistry): Promise<void> {
  for (const job of registry.all()) {
    // `upsertJobScheduler` berkunci pada `job.name`: memanggilnya dari instance
    // kedua MEMPERBARUI jadwal yang sama, bukan menambah jadwal kedua. Di sinilah
    // kunci terdistribusi `JOB-02` berada — pada identitas penjadwalnya, bukan
    // pada `SET NX` yang harus dijaga masa berlakunya sendiri.
    await queue.upsertJobScheduler(
      job.name,
      { pattern: job.cron, tz: 'UTC' },
      { name: job.name, data: {}, opts: RETRY_OPTIONS },
    );
  }
}

/** Membuat antrean di atas koneksi Redis bersama (`SDD-SYS-13`). */
export function createQueue(connection: Redis): Queue {
  return new Queue(QUEUE_NAME, { connection });
}

/**
 * Menjalankan consumer. Beberapa instance boleh berjalan bersamaan — BullMQ
 * menyerahkan tiap job ke tepat satu di antaranya (`JOB-02`).
 */
export function createWorker(
  connection: Redis,
  registry: JobRegistry,
  onError?: (name: string, galat: unknown) => void,
): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const definition = registry.get(job.name);
      if (definition === undefined) {
        // Gagal keras: job tanpa definisi berarti antrean memuat sisa dari versi
        // kode lain, dan menelannya diam-diam menyembunyikan deploy yang keliru.
        throw new JobRegistrationError(`Pekerjaan tidak dikenal: ${job.name}`);
      }
      await definition.handler(job);
    },
    { connection },
  );
  if (onError !== undefined) {
    worker.on('failed', (job, galat) => onError(job?.name ?? '(tidak diketahui)', galat));
  }
  return worker;
}
