// Acceptance PR-00-12: "Event terbit hanya setelah commit; urut per agregat"
// (SDD-EVT-04, SDD-EVT-09).
//
// Terhadap PostgreSQL nyata, dan itu wajib: kedua jaminannya adalah jaminan
// basis data — yang pertama milik batas transaksi, yang kedua milik kunci baris.
// Tiruan akan menguji tiruan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthContext } from '../../src/shared/auth/index.js';
import { FixedClock } from '../../src/shared/clock/index.js';
import { closeDb, createDb, readDatabaseConfig, withTransaction } from '../../src/shared/db/index.js';
import type { OutboxEvent } from '../../src/shared/events/index.js';
import {
  EventHandlerRegistry,
  MAX_ATTEMPTS,
  OutboxDispatcher,
  publish,
  publishAll,
} from '../../src/shared/events/index.js';
import { dbmate, kueri } from '../helpers/db.js';

const ADA_DB = process.env['DATABASE_URL'] !== undefined;

const ctx = createAuthContext({
  userId: 42,
  roleCode: 'PETUGAS_SARPRAS',
  scopes: new Map([['loan.update', 'all']]),
});

const acara = (nama: string, id: number, payload: Record<string, unknown> = {}) => ({
  name: nama,
  aggregateType: 'loan',
  aggregateId: id,
  payload,
});

describe.skipIf(!ADA_DB)('Outbox terhadap PostgreSQL nyata', () => {
  let db: ReturnType<typeof createDb>;
  const clock = new FixedClock(new Date('2026-09-08T03:00:00.000Z'));

  beforeAll(() => {
    dbmate('up');
    db = createDb({ ...readDatabaseConfig(), poolSize: 10 });
  });

  afterAll(async () => {
    await db.destroy();
    await closeDb();
  });

  beforeEach(async () => {
    await kueri('DELETE FROM event_outbox');
  });

  /** Dispatcher dengan handler yang mencatat urutan panggilannya. */
  function dispatcherPencatat(handlers?: EventHandlerRegistry) {
    const jejak: string[] = [];
    const registry =
      handlers ??
      new EventHandlerRegistry().on('LoanReturned', async (e: OutboxEvent) => {
        jejak.push(`${e.aggregateId}:${String((e.payload as { urutan?: number }).urutan)}`);
      });
    const mati: OutboxEvent[] = [];
    const dispatcher = new OutboxDispatcher({
      registry,
      clock,
      db,
      onDeadLetter: (e) => mati.push(e),
    });
    return { jejak, mati, dispatcher, registry };
  }

  const hitung = async (where: string) =>
    Number((await kueri<{ n: string }>(`SELECT count(*)::text AS n FROM event_outbox ${where}`))[0]?.n);

  it('SDD-EVT-04 — transaksi yang GAGAL tidak meninggalkan satu pun event', async () => {
    await expect(
      withTransaction(
        ctx,
        async (scope) => {
          await publish(scope, acara('LoanReturned', 1, { urutan: 1 }));
          throw new Error('bisnis gagal setelah publish');
        },
        db,
      ),
    ).rejects.toThrow('bisnis gagal');

    expect(await hitung('')).toBe(0);
  });

  it('SDD-EVT-04 — event baru terlihat dispatcher SETELAH commit', async () => {
    const { jejak, dispatcher } = dispatcherPencatat();

    // Selagi transaksi masih terbuka, dispatcher pada koneksi lain tidak
    // menemukan apa pun — barisnya belum commit.
    let selamaTransaksi = -1;
    await withTransaction(
      ctx,
      async (scope) => {
        await publish(scope, acara('LoanReturned', 1, { urutan: 1 }));
        selamaTransaksi = (await dispatcher.tick()).processed;
      },
      db,
    );

    expect(selamaTransaksi).toBe(0);
    expect(jejak).toEqual([]);

    expect((await dispatcher.drain()).processed).toBe(1);
    expect(jejak).toEqual(['1:1']);
  });

  it('SDD-EVT-09 — event satu agregat diproses berurutan id', async () => {
    const { jejak, dispatcher } = dispatcherPencatat();
    await withTransaction(
      ctx,
      (scope) =>
        publishAll(scope, [
          acara('LoanReturned', 7, { urutan: 1 }),
          acara('LoanReturned', 7, { urutan: 2 }),
          acara('LoanReturned', 7, { urutan: 3 }),
        ]),
      db,
    );

    await dispatcher.drain();
    expect(jejak).toEqual(['7:1', '7:2', '7:3']);
  });

  it(
    'SDD-EVT-09 — DUA dispatcher bersamaan TIDAK membalik urutan satu agregat',
    async () => {
      const jejak: string[] = [];
      // Handler lambat: bila kunci diambil per BARIS, dispatcher kedua akan
      // melewati baris terkunci dan memungut event berikutnya dari agregat yang
      // sama — dan jejaknya keluar terbalik.
      const registry = new EventHandlerRegistry().on('LoanReturned', async (e) => {
        const urutan = (e.payload as { urutan: number }).urutan;
        if (urutan === 1) await new Promise((r) => setTimeout(r, 400));
        jejak.push(`${e.aggregateId}:${String(urutan)}`);
      });

      await withTransaction(
        ctx,
        (scope) =>
          publishAll(scope, [
            acara('LoanReturned', 9, { urutan: 1 }),
            acara('LoanReturned', 9, { urutan: 2 }),
            acara('LoanReturned', 9, { urutan: 3 }),
          ]),
        db,
      );

      const satu = new OutboxDispatcher({ registry, clock, db });
      const dua = new OutboxDispatcher({ registry, clock, db });
      await Promise.all([satu.drain(), dua.drain()]);

      expect(jejak).toEqual(['9:1', '9:2', '9:3']);
    },
    30_000,
  );

  it('agregat berbeda tidak saling menahan', async () => {
    const { jejak, dispatcher } = dispatcherPencatat();
    await withTransaction(
      ctx,
      (scope) =>
        publishAll(scope, [
          acara('LoanReturned', 1, { urutan: 1 }),
          acara('LoanReturned', 2, { urutan: 1 }),
        ]),
      db,
    );

    await dispatcher.drain();
    expect(jejak.sort()).toEqual(['1:1', '2:1']);
  });

  it('handler yang gagal MENAHAN event sesudahnya pada agregat yang sama', async () => {
    const jejak: string[] = [];
    const registry = new EventHandlerRegistry().on('LoanReturned', async (e) => {
      const urutan = (e.payload as { urutan: number }).urutan;
      if (urutan === 1) throw new Error('handler tumbang');
      jejak.push(String(urutan));
    });
    const dispatcher = new OutboxDispatcher({ registry, clock, db });

    await withTransaction(
      ctx,
      (scope) =>
        publishAll(scope, [
          acara('LoanReturned', 3, { urutan: 1 }),
          acara('LoanReturned', 3, { urutan: 2 }),
        ]),
      db,
    );

    await dispatcher.drain();

    // Event kedua TIDAK dijalankan mendahului yang gagal (SDD-EVT-09).
    expect(jejak).toEqual([]);
    const baris = await kueri<{ attempts: number; last_error: string | null }>(
      'SELECT attempts, last_error FROM event_outbox ORDER BY id',
    );
    expect(baris[0]?.attempts).toBe(1);
    expect(baris[0]?.last_error).toBe('handler tumbang');
    expect(baris[1]?.attempts).toBe(0);
  });

  it('kegagalan yang berulang berakhir sebagai DEAD LETTER dan berhenti dipungut', async () => {
    let panggilan = 0;
    const registry = new EventHandlerRegistry().on('LoanReturned', async () => {
      panggilan += 1;
      throw new Error('selalu gagal');
    });
    const mati: OutboxEvent[] = [];
    const dispatcher = new OutboxDispatcher({
      registry,
      clock,
      db,
      onDeadLetter: (e) => mati.push(e),
    });

    await withTransaction(ctx, (scope) => publish(scope, acara('LoanReturned', 5)), db);

    // Backoff dilewati dengan memajukan jam — bukan dengan menunggu sungguhan.
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await dispatcher.tick();
      clock.advance(60 * 60 * 1000);
    }

    expect(panggilan).toBe(MAX_ATTEMPTS);
    expect(mati).toHaveLength(1);
    expect(await hitung(`WHERE processed_at IS NULL AND attempts >= ${MAX_ATTEMPTS}`)).toBe(1);

    // Putaran berikutnya tidak menyentuhnya lagi — inilah yang membuat predikat
    // dead letter bekerja tanpa tabel kedua (SDD-07 §4.2).
    await dispatcher.drain();
    expect(panggilan).toBe(MAX_ATTEMPTS);
  });

  it('backoff menahan agregat sampai waktunya, tanpa memblokir agregat lain', async () => {
    const jejak: string[] = [];
    const registry = new EventHandlerRegistry().on('LoanReturned', async (e) => {
      if (e.aggregateId === '11') throw new Error('gagal');
      jejak.push(String(e.aggregateId));
    });
    const dispatcher = new OutboxDispatcher({ registry, clock, db });

    await withTransaction(
      ctx,
      (scope) => publishAll(scope, [acara('LoanReturned', 11), acara('LoanReturned', 12)]),
      db,
    );

    await dispatcher.drain();
    expect(jejak).toEqual(['12']);

    // Agregat 11 tertahan backoff; percobaannya tidak bertambah sebelum waktunya.
    await dispatcher.drain();
    const attempts = await kueri<{ attempts: number }>(
      `SELECT attempts FROM event_outbox WHERE aggregate_id = 11`,
    );
    expect(attempts[0]?.attempts).toBe(1);
  });

  it('event tanpa handler ditandai selesai, bukan dianggap gagal', async () => {
    const dispatcher = new OutboxDispatcher({ registry: new EventHandlerRegistry(), clock, db });
    await withTransaction(ctx, (scope) => publish(scope, acara('BelumAdaKonsumennya', 1)), db);

    expect((await dispatcher.drain()).processed).toBe(1);
    expect(await hitung('WHERE processed_at IS NULL')).toBe(0);
  });

  it('menyimpan actor_id dan request_id agar jejak melewati batas commit', async () => {
    await withTransaction(ctx, (scope) => publish(scope, acara('LoanReturned', 1, { a: 1 })), db);

    const baris = await kueri<{ actor_id: string; event_name: string; payload: unknown }>(
      'SELECT actor_id, event_name, payload FROM event_outbox',
    );
    expect(baris[0]?.actor_id).toBe('42');
    expect(baris[0]?.event_name).toBe('LoanReturned');
    expect(baris[0]?.payload).toEqual({ a: 1 });
  });

  it('processed_at diambil dari Clock yang di-inject (SDD-SYS-07)', async () => {
    const dispatcher = new OutboxDispatcher({ registry: new EventHandlerRegistry(), clock, db });
    await withTransaction(ctx, (scope) => publish(scope, acara('LoanReturned', 1)), db);
    await dispatcher.drain();

    const baris = await kueri<{ processed_at: Date }>(
      'SELECT processed_at FROM event_outbox',
    );
    expect(baris[0]?.processed_at.toISOString()).toBe(clock.now().toISOString());
  });
});
