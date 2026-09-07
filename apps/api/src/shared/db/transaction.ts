// Batas transaksi (SDD-07, SDD-EVT-02). Efek yang wajib atomik dengan pemicunya
// dijalankan sinkron di dalam blok ini; efek yang boleh tertunda terbit ke outbox
// di dalamnya juga (PR-00-12) — tidak pernah setelah COMMIT.

import type { Kysely, Transaction } from 'kysely';
import type { AuthContext } from '../auth/index.js';
import { assertAuthContext } from '../auth/index.js';
import { getDb } from './connection.js';
import type { Database } from './schema.js';

/** Eksekutor kueri: koneksi pool atau transaksi berjalan. Repository tidak membedakannya. */
export type QueryExecutor = Kysely<Database> | Transaction<Database>;

/**
 * Satu transaksi beserta AuthContext yang membukanya. Keduanya bepergian sebagai
 * satu objek supaya operasi di dalam transaksi tidak dapat kehilangan ctx-nya
 * di tengah jalan (SDD-AUTH-02).
 */
export interface TransactionScope {
  readonly ctx: AuthContext;
  readonly tx: Transaction<Database>;
}

/**
 * Menjalankan `fn` dalam satu transaksi dan meneruskan `ctx` ke dalamnya.
 * Isolasi `READ COMMITTED` disebut eksplisit karena `CI-03` mewajibkannya —
 * bawaan PostgreSQL yang kebetulan sama bukan jaminan yang dapat dirujuk.
 */
export async function withTransaction<T>(
  ctx: AuthContext,
  fn: (scope: TransactionScope) => Promise<T>,
  db: Kysely<Database> = getDb(),
): Promise<T> {
  assertAuthContext(ctx);
  return db
    .transaction()
    .setIsolationLevel('read committed') // CI-03
    .execute((tx) => fn({ ctx, tx }));
}
