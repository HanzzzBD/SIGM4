// Acceptance PR-00-10: "Kunci sama + body sama → respons tersimpan; body beda → 409"
// (ID-01 … ID-05, SDD-AVL-08).
//
// Terhadap PostgreSQL nyata, dan itu wajib: jaminannya berasal dari advisory lock
// dan dari kunci yang commit bersama efeknya. Tiruan akan menguji tiruan.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthContext } from '../../src/shared/auth/index.js';
import { closeDb, createDb, readDatabaseConfig } from '../../src/shared/db/index.js';
import { hashRequestBody, runIdempotent } from '../../src/shared/http/index.js';
import { dbmate, kueri } from '../helpers/db.js';

const ADA_DB = process.env['DATABASE_URL'] !== undefined;

const ctx = createAuthContext({
  userId: 7,
  roleCode: 'GURU',
  scopes: new Map([['reservation.create', 'own']]),
});

const KEY_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const KEY_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

describe.skipIf(!ADA_DB)('runIdempotent terhadap PostgreSQL nyata', () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(() => {
    dbmate('up');
    db = createDb({ ...readDatabaseConfig(), poolSize: 10 });
  });

  afterAll(async () => {
    await db.destroy();
    await closeDb();
  });

  beforeEach(async () => {
    await kueri('DELETE FROM idempotency_keys');
  });

  /** Handler yang mencatat berapa kali ia benar-benar dijalankan. */
  function handlerPencatat(body: unknown = { nomor: 'RSV-RG-2026-0001' }) {
    const jejak: number[] = [];
    return {
      jejak,
      handler: async () => {
        jejak.push(Date.now());
        return { statusCode: 201, body };
      },
    };
  }

  const permintaan = (key: string, body: unknown) => ({
    key,
    endpoint: 'POST /reservations',
    body,
  });

  it('menjalankan handler sekali dan menyimpan responsnya', async () => {
    const { jejak, handler } = handlerPencatat();
    const hasil = await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), handler);

    expect(hasil.statusCode).toBe(201);
    expect(hasil.body).toEqual({ nomor: 'RSV-RG-2026-0001' });
    expect(hasil.replayed).toBe(false);
    expect(jejak).toHaveLength(1);
  });

  it('ID-03 — kunci sama + body sama mengembalikan respons TERSIMPAN tanpa efek baru', async () => {
    const { jejak, handler } = handlerPencatat();
    const pertama = await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), handler);
    const kedua = await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), handler);

    expect(kedua.body).toEqual(pertama.body);
    expect(kedua.statusCode).toBe(201);
    expect(kedua.replayed).toBe(true);
    // Inilah inti ID-03: handler TIDAK dijalankan ulang.
    expect(jejak).toHaveLength(1);
  });

  it('ID-03 — urutan kunci JSON tidak membuat body dianggap berbeda', async () => {
    const { handler } = handlerPencatat();
    await runIdempotent(db, ctx, permintaan(KEY_A, { a: 1, b: 2 }), handler);
    const kedua = await runIdempotent(db, ctx, permintaan(KEY_A, { b: 2, a: 1 }), handler);
    expect(kedua.replayed).toBe(true);
  });

  it('ID-04 — kunci sama + body BERBEDA ditolak IDEMPOTENCY_KEY_REUSED', async () => {
    const { jejak, handler } = handlerPencatat();
    await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), handler);

    await expect(
      runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 2 }), handler),
    ).rejects.toMatchObject({ kode: 'IDEMPOTENCY_KEY_REUSED' });
    expect(jejak).toHaveLength(1);
  });

  it('kunci berbeda menjalankan handler masing-masing', async () => {
    const { jejak, handler } = handlerPencatat();
    await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), handler);
    await runIdempotent(db, ctx, permintaan(KEY_B, { room_id: 1 }), handler);
    expect(jejak).toHaveLength(2);
  });

  it('ID-05 — kunci yang SEDANG berjalan ditolak REQUEST_IN_PROGRESS', async () => {
    // Permintaan pertama ditahan di dalam transaksinya; yang kedua datang saat
    // advisory lock masih dipegang, sehingga pg_try_advisory_xact_lock gagal.
    let lepaskan: () => void = () => undefined;
    const tertahan = new Promise<void>((r) => {
      lepaskan = r;
    });

    const pertama = runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), async () => {
      await tertahan;
      return { statusCode: 201, body: { nomor: 'RSV-RG-2026-0001' } };
    });

    // Beri jeda agar transaksi pertama benar-benar memegang kuncinya.
    await new Promise((r) => setTimeout(r, 150));

    await expect(
      runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), async () => ({
        statusCode: 201,
        body: { nomor: 'TIDAK BOLEH' },
      })),
    ).rejects.toMatchObject({ kode: 'REQUEST_IN_PROGRESS' });

    lepaskan();
    await expect(pertama).resolves.toMatchObject({ replayed: false });
  });

  it('ID-05 — penolakan itu SEKETIKA, tidak menunggu yang pertama selesai', async () => {
    let lepaskan: () => void = () => undefined;
    const tertahan = new Promise<void>((r) => {
      lepaskan = r;
    });
    const pertama = runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), async () => {
      await tertahan;
      return { statusCode: 201, body: {} };
    });
    await new Promise((r) => setTimeout(r, 150));

    const mulai = Date.now();
    await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), async () => ({
      statusCode: 201,
      body: {},
    })).catch(() => undefined);
    const durasi = Date.now() - mulai;

    lepaskan();
    await pertama;
    // Kunci pemblokir akan membuat angka ini sepanjang handler pertama.
    expect(durasi).toBeLessThan(1000);
  });

  it('handler yang gagal TIDAK meninggalkan kunci — efek dan kunci commit bersama', async () => {
    await expect(
      runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), async () => {
        throw new Error('bisnis gagal');
      }),
    ).rejects.toThrow('bisnis gagal');

    const sisa = await kueri<{ n: string }>(
      'SELECT count(*)::text AS n FROM idempotency_keys',
    );
    expect(sisa[0]?.n).toBe('0');

    // Dan permintaan ulang dengan kunci yang sama boleh mencoba lagi.
    const { jejak, handler } = handlerPencatat();
    await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), handler);
    expect(jejak).toHaveLength(1);
  });

  it('kunci kedaluwarsa diperlakukan seperti kunci baru (ID-02, TTL 24 jam)', async () => {
    const { jejak, handler } = handlerPencatat();
    await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 1 }), handler);
    await kueri(`UPDATE idempotency_keys SET expires_at = now() - interval '1 hour'`);

    const kedua = await runIdempotent(db, ctx, permintaan(KEY_A, { room_id: 9 }), handler);
    expect(kedua.replayed).toBe(false);
    expect(jejak).toHaveLength(2);
  });

  it('menyimpan endpoint dan hash body, bukan body-nya (ID-02, DP-03)', async () => {
    const body = { room_id: 1, catatan: 'rahasia sekolah' };
    await runIdempotent(db, ctx, permintaan(KEY_A, body), handlerPencatat().handler);

    const baris = await kueri<{ endpoint: string; request_hash: string }>(
      'SELECT endpoint, request_hash FROM idempotency_keys',
    );
    expect(baris[0]?.endpoint).toBe('POST /reservations');
    expect(baris[0]?.request_hash).toBe(hashRequestBody(body));
    expect(JSON.stringify(baris)).not.toContain('rahasia sekolah');
  });

  it.each([
    ['bukan UUID', 'bukan-uuid'],
    ['UUIDv1', '3f2504e0-4f89-11d3-9a0c-0305e82c3301'],
    ['kosong', ''],
  ])('ID-01 — menolak Idempotency-Key %s', async (_n, key) => {
    await expect(
      runIdempotent(db, ctx, permintaan(key, { room_id: 1 }), handlerPencatat().handler),
    ).rejects.toMatchObject({ kode: 'INVALID_REQUEST' });
  });
});
