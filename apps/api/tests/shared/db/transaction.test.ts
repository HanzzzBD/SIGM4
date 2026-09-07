import { describe, expect, it } from 'vitest';
import type { Kysely, Transaction } from 'kysely';
import { createAuthContext } from '../../../src/shared/auth/index.js';
import type { AuthContext } from '../../../src/shared/auth/index.js';
import { withTransaction } from '../../../src/shared/db/index.js';
import type { Database } from '../../../src/shared/db/index.js';

const ctx: AuthContext = createAuthContext({
  userId: 7,
  roleCode: 'SISWA',
  scopes: new Map([['loan.view', 'own']]),
});

interface Jejak {
  isolasi: string[];
  db: Kysely<Database>;
  tx: Transaction<Database>;
}

/** Kysely tiruan: mencatat isolasi yang diminta, lalu menjalankan callback-nya. */
function dbPalsu(): Jejak {
  const isolasi: string[] = [];
  const tx = { tanda: 'tx' } as unknown as Transaction<Database>;
  const db = {
    transaction: () => ({
      setIsolationLevel(level: string) {
        isolasi.push(level);
        return this;
      },
      execute: <T>(fn: (t: Transaction<Database>) => Promise<T>) => fn(tx),
    }),
  } as unknown as Kysely<Database>;
  return { isolasi, db, tx };
}

describe('withTransaction', () => {
  it('meneruskan ctx dan transaksi sebagai satu scope (SDD-AUTH-02)', async () => {
    const { db, tx } = dbPalsu();
    const scope = await withTransaction(ctx, async (s) => s, db);
    expect(scope.ctx).toBe(ctx);
    expect(scope.tx).toBe(tx);
  });

  it('meminta isolasi READ COMMITTED secara eksplisit (CI-03)', async () => {
    const { isolasi, db } = dbPalsu();
    await withTransaction(ctx, async () => undefined, db);
    expect(isolasi).toEqual(['read committed']);
  });

  it('meneruskan nilai kembalian callback', async () => {
    const { db } = dbPalsu();
    await expect(withTransaction(ctx, async () => 42, db)).resolves.toBe(42);
  });

  it('menolak dibuka tanpa AuthContext yang sah (kasus penolakan)', async () => {
    const { db, isolasi } = dbPalsu();
    await expect(
      withTransaction(undefined as unknown as AuthContext, async () => 1, db),
    ).rejects.toThrow(/AuthContext wajib/);
    // Transaksi tidak boleh sempat dibuka bila ctx-nya tidak sah.
    expect(isolasi).toEqual([]);
  });
});
