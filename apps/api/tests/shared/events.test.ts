// Bagian outbox yang tidak menuntut PostgreSQL: validasi penerbitan, registri
// handler, dan pemungut worker. Jaminan transaksionalnya sendiri diuji terhadap
// basis data nyata di tests/integration/event-outbox.test.ts.

import { describe, expect, it, vi } from 'vitest';
import { createAuthContext } from '../../src/shared/auth/index.js';
import type { TransactionScope } from '../../src/shared/db/index.js';
import {
  BACKOFF_BASE_MS,
  EventHandlerRegistry,
  EventPublishError,
  MAX_ATTEMPTS,
  publish,
} from '../../src/shared/events/index.js';
import type { OutboxEvent, TickResult } from '../../src/shared/events/index.js';
import { startOutboxPoller } from '../../src/worker/outbox-poller.js';

const ctx = createAuthContext({
  userId: 1,
  roleCode: 'ADMIN',
  scopes: new Map([['loan.update', 'all']]),
});

/** Scope palsu: `publish` tidak boleh sampai menyentuh basis data untuk ditolak. */
const scopePalsu = { ctx, tx: {} } as unknown as TransactionScope;

describe('publish — validasi (SDD-EVT-05, SDD-EVT-09)', () => {
  it('menolak nama event kosong', async () => {
    await expect(
      publish(scopePalsu, { name: '  ', aggregateType: 'loan', aggregateId: 1, payload: {} }),
    ).rejects.toBeInstanceOf(EventPublishError);
  });

  it('menolak event tanpa aggregate_type — urutan SDD-EVT-09 tidak dapat dijamin', async () => {
    await expect(
      publish(scopePalsu, { name: 'LoanReturned', aggregateType: '', aggregateId: 1, payload: {} }),
    ).rejects.toThrow(/aggregate_type/);
  });
});

describe('EventHandlerRegistry', () => {
  const kosong = async () => undefined;

  it('mengembalikan daftar kosong untuk event tanpa konsumen', () => {
    expect(new EventHandlerRegistry().handlersFor('BelumAda')).toEqual([]);
  });

  it('satu event boleh punya beberapa handler (SDD-07 §4.3)', () => {
    const registry = new EventHandlerRegistry().on('LoanReturned', kosong).on('LoanReturned', kosong);
    expect(registry.handlersFor('LoanReturned')).toHaveLength(2);
  });

  it('handler tidak bocor antar nama event', () => {
    const registry = new EventHandlerRegistry().on('LoanReturned', kosong);
    expect(registry.handlersFor('FineIssued')).toEqual([]);
  });
});

describe('Tetapan dead letter & backoff (SDD-07 §4.2)', () => {
  it('ambang dead letter lima percobaan', () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it('backoff eksponensial menaik, bukan tetap', () => {
    const jeda = [1, 2, 3, 4].map((n) => BACKOFF_BASE_MS * 2 ** (n - 1));
    expect(jeda).toEqual([...jeda].sort((a, b) => a - b));
    expect(new Set(jeda).size).toBe(jeda.length);
  });
});

describe('startOutboxPoller', () => {
  const kosong: TickResult = { processed: 0, failed: 0 };

  it('memungut berulang selama masih ada pekerjaan, tanpa menunggu jeda', async () => {
    let sisa = 3;
    const dispatcher = {
      tick: vi.fn(async (): Promise<TickResult> => {
        if (sisa === 0) return kosong;
        sisa -= 1;
        return { processed: 1, failed: 0 };
      }),
    };

    const poller = startOutboxPoller(dispatcher as never, 10_000);
    await vi.waitFor(() => expect(sisa).toBe(0));
    await poller.stop();

    expect(dispatcher.tick.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('stop() selesai meski pemungut sedang tidur — tidak menggantung', async () => {
    const dispatcher = { tick: vi.fn(async () => kosong) };
    const poller = startOutboxPoller(dispatcher as never, 60_000);
    await vi.waitFor(() => expect(dispatcher.tick).toHaveBeenCalled());

    // Membatalkan timer saja akan membuat promise tidurnya tidak pernah selesai.
    await expect(
      Promise.race([
        poller.stop(),
        new Promise((_, tolak) => setTimeout(() => tolak(new Error('menggantung')), 3_000)),
      ]),
    ).resolves.toBeUndefined();
  });

  it('kegagalan dihitung sebagai pekerjaan — putaran berikutnya tidak menunggu jeda', async () => {
    let putaran = 0;
    const dispatcher = {
      tick: vi.fn(async (): Promise<TickResult> => {
        putaran += 1;
        return putaran <= 2 ? { processed: 0, failed: 1 } : kosong;
      }),
    };
    const poller = startOutboxPoller(dispatcher as never, 10_000);
    await vi.waitFor(() => expect(putaran).toBeGreaterThanOrEqual(3));
    await poller.stop();
  });
});

describe('Bentuk OutboxEvent', () => {
  it('membawa request_id agar jejak melewati batas commit (SDD-OBS-03)', () => {
    const event: OutboxEvent = {
      id: '1',
      name: 'LoanReturned',
      aggregateType: 'loan',
      aggregateId: '7',
      payload: {},
      actorId: '42',
      requestId: 'req-1',
      occurredAt: new Date(0),
      attempts: 0,
    };
    expect(event.requestId).toBe('req-1');
  });
});
