// Acceptance PR-00-11: "Dua instance worker → job dieksekusi tepat sekali"
// (JOB-01, JOB-02, SDD-AVL-10).
//
// Terhadap Redis NYATA. Jaminannya berasal dari BullMQ dan Redis, bukan dari kode
// kita — menirunya berarti menguji tiruan. Uji ini menuntut REDIS_URL.

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Queue, Worker } from 'bullmq';
import { closeRedis, createRedis, readRedisConfig } from '../../src/shared/cache/index.js';
import {
  JobRegistrationError,
  JobRegistry,
  QUEUE_NAME,
  createQueue,
  createWorker,
  scheduleAll,
} from '../../src/worker/scheduler.js';

const ADA_REDIS = process.env['REDIS_URL'] !== undefined;

/** Menunggu sampai `cek()` benar, atau menyerah setelah `batas` ms. */
async function tunggu(cek: () => boolean, batas = 8000): Promise<void> {
  const habis = Date.now() + batas;
  while (Date.now() < habis) {
    if (cek()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe.skipIf(!ADA_REDIS)('Worker skeleton terhadap Redis nyata', () => {
  const koneksi: ReturnType<typeof createRedis>[] = [];
  const pekerja: Worker[] = [];
  let antrean: Queue;

  function redisBaru() {
    const r = createRedis(readRedisConfig());
    koneksi.push(r);
    return r;
  }

  beforeAll(async () => {
    antrean = createQueue(redisBaru());
    await antrean.obliterate({ force: true });
  });

  afterEach(async () => {
    await Promise.all(pekerja.splice(0).map((w) => w.close()));
    await antrean.obliterate({ force: true });
  });

  afterAll(async () => {
    await antrean.close();
    await Promise.all(koneksi.map((r) => r.quit().catch(() => undefined)));
    await closeRedis();
  });

  it('memakai satu antrean terpusat (JOB-01)', () => {
    expect(QUEUE_NAME).toBe('sigm4-jobs');
  });

  it(
    'DUA instance worker → job dieksekusi TEPAT SEKALI (JOB-02)',
    async () => {
      const dijalankan: string[] = [];
      const registry = new JobRegistry().register({
        name: 'probe-sekali',
        cron: '*/1 * * * *',
        handler: async () => {
          dijalankan.push('x');
        },
      });

      // Dua consumer mendengarkan antrean yang sama, seperti dua instance worker
      // di produksi (SDD-INF-10 mengganti instance satu per satu).
      pekerja.push(createWorker(redisBaru(), registry), createWorker(redisBaru(), registry));

      await antrean.add('probe-sekali', {}, { jobId: 'sekali' });
      await tunggu(() => dijalankan.length > 0);
      // Beri jeda tambahan: bila consumer kedua ikut mengambilnya, ia akan
      // muncul di sini.
      await new Promise((r) => setTimeout(r, 700));

      expect(dijalankan).toHaveLength(1);
    },
    30_000,
  );

  it(
    'penjadwalan dari DUA instance tidak menghasilkan dua jadwal (JOB-02)',
    async () => {
      const registry = new JobRegistry().register(
        { name: 'probe-jadwal', cron: '5 17 * * *', handler: async () => undefined },
        { name: 'probe-jadwal-2', cron: '0 16 * * *', handler: async () => undefined },
      );

      // Dijalankan dua kali, seperti dua worker yang menyala bersamaan.
      await scheduleAll(antrean, registry);
      await scheduleAll(antrean, registry);

      const penjadwal = await antrean.getJobSchedulers();
      expect(penjadwal.map((p) => p.key).sort()).toEqual(['probe-jadwal', 'probe-jadwal-2']);
    },
    30_000,
  );

  it(
    'jadwal tersimpan dalam UTC (JOB-04)',
    async () => {
      const registry = new JobRegistry().register({
        name: 'probe-utc',
        cron: '5 17 * * *',
        handler: async () => undefined,
      });
      await scheduleAll(antrean, registry);

      const penjadwal = await antrean.getJobSchedulers();
      const probe = penjadwal.find((p) => p.key === 'probe-utc');
      expect(probe?.pattern).toBe('5 17 * * *');
      expect(probe?.tz).toBe('UTC');
    },
    30_000,
  );

  it(
    'job yang gagal dicoba ulang, tidak ditelan diam-diam (JOB-06)',
    async () => {
      let percobaan = 0;
      const registry = new JobRegistry().register({
        name: 'probe-gagal',
        cron: '*/1 * * * *',
        handler: async () => {
          percobaan += 1;
          throw new Error('sengaja gagal');
        },
      });
      const gagal: string[] = [];
      pekerja.push(createWorker(redisBaru(), registry, (nama) => gagal.push(nama)));

      // Backoff dipercepat khusus uji ini; nilai produksinya 30 detik (RETRY_OPTIONS).
      await antrean.add(
        'probe-gagal',
        {},
        { attempts: 2, backoff: { type: 'fixed', delay: 50 } },
      );
      await tunggu(() => percobaan >= 2);

      expect(percobaan).toBeGreaterThanOrEqual(2);
      expect(gagal).toContain('probe-gagal');
    },
    30_000,
  );

  it(
    'job tanpa definisi GAGAL KERAS, bukan ditelan',
    async () => {
      const registry = new JobRegistry();
      const gagal: string[] = [];
      pekerja.push(createWorker(redisBaru(), registry, (nama) => gagal.push(nama)));

      await antrean.add('probe-asing', {}, { attempts: 1 });
      await tunggu(() => gagal.length > 0);

      expect(gagal).toContain('probe-asing');
    },
    30_000,
  );
});

describe('JobRegistry — tanpa Redis', () => {
  it('menolak nama yang didaftarkan dua kali', () => {
    const j = { name: 'a', cron: '* * * * *', handler: async () => undefined };
    expect(() => new JobRegistry().register(j, j)).toThrow(JobRegistrationError);
  });

  it('menolak nama kosong', () => {
    expect(() =>
      new JobRegistry().register({ name: '  ', cron: '* * * * *', handler: async () => undefined }),
    ).toThrow(/tidak boleh kosong/);
  });
});
