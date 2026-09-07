// Idempotensi (ID-01 … ID-05, SDD-AVL-08, SDD-01 §4.4).
//
// Ditulis sebagai fungsi yang membungkus satu transaksi, bukan sebagai middleware
// Express. Alasannya bukan selera: `SDD-AVL-08` mewajibkan kunci commit BERSAMA
// efek bisnisnya, sehingga penjaga idempotensi harus berada DI DALAM transaksi
// yang sama dengan handler — sesuatu yang tidak dapat dilakukan middleware yang
// selesai sebelum handler dipanggil. Rantai `SDD-06 §4.2` memanggil fungsi ini;
// perakitannya sendiri milik PR-00-15.

import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { DomainError } from '../errors/index.js';
import type { Database, TransactionScope } from '../db/index.js';
import type { AuthContext } from '../auth/index.js';

/** UUIDv4 sesuai `ID-01`. Bentuk lain ditolak sebelum menyentuh basis data. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface IdempotentResult<T> {
  readonly statusCode: number;
  readonly body: T;
  /** `true` bila respons berasal dari kunci yang sudah pernah diproses (`ID-03`). */
  readonly replayed: boolean;
}

export interface IdempotentRequest {
  readonly key: string;
  readonly endpoint: string;
  /** Body permintaan apa adanya; hanya hash-nya yang disimpan (`DP-03`). */
  readonly body: unknown;
}

/**
 * Hash body permintaan. Kunci JSON diurutkan supaya `{a,b}` dan `{b,a}` — body
 * yang sama dengan urutan berbeda — tidak dianggap dua permintaan berbeda dan
 * memicu `409` palsu.
 */
export function hashRequestBody(body: unknown): string {
  return createHash('sha256').update(canonicalize(body)).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(',')}}`;
}

interface StoredKey {
  request_hash: string;
  status_code: number | null;
  response_body: unknown;
}

/**
 * Menjalankan `handler` tepat satu kali per `Idempotency-Key`.
 *
 * Seluruhnya satu transaksi: kunci, efek bisnis, dan respons tersimpan commit
 * bersama, sehingga tidak ada keadaan "kunci ada tetapi efeknya tidak".
 *
 * @throws DomainError `INVALID_REQUEST` bila kunci bukan UUIDv4 (`ID-01`)
 * @throws DomainError `REQUEST_IN_PROGRESS` bila kunci sama sedang berjalan (`ID-05`)
 * @throws DomainError `IDEMPOTENCY_KEY_REUSED` bila kunci sama, body berbeda (`ID-04`)
 */
export async function runIdempotent<T>(
  db: Kysely<Database>,
  ctx: AuthContext,
  request: IdempotentRequest,
  handler: (scope: TransactionScope) => Promise<{ statusCode: number; body: T }>,
): Promise<IdempotentResult<T>> {
  if (!UUID_V4.test(request.key)) {
    throw new DomainError('INVALID_REQUEST', 'Idempotency-Key harus UUIDv4 (ID-01).');
  }
  const hash = hashRequestBody(request.body);

  return db
    .transaction()
    .setIsolationLevel('read committed')
    .execute(async (tx) => {
      // Kunci advisory transaksional, versi TRY. Kegagalan mengambilnya itu
      // sendiri adalah bukti ada permintaan berkunci sama yang sedang berjalan —
      // dijawab seketika alih-alih menahan koneksi sampai yang pertama selesai
      // (SDD-01 §4.4).
      const lock = await sql<{ locked: boolean }>`
        SELECT pg_try_advisory_xact_lock(hashtext(${request.key})) AS locked
      `.execute(tx);
      if (lock.rows[0]?.locked !== true) {
        throw new DomainError('REQUEST_IN_PROGRESS');
      }

      const existing = await sql<StoredKey>`
        SELECT request_hash, status_code, response_body
          FROM idempotency_keys
         WHERE key = ${request.key}::uuid AND expires_at > now()
      `.execute(tx);
      const row = existing.rows[0];

      if (row !== undefined) {
        // ID-04 diperiksa SEBELUM ID-03: kunci yang sama dengan body berbeda
        // adalah kekeliruan pemanggil, bukan permintaan ulang yang sah.
        if (row.request_hash !== hash) {
          throw new DomainError('IDEMPOTENCY_KEY_REUSED');
        }
        return {
          statusCode: row.status_code ?? 200,
          body: row.response_body as T,
          replayed: true,
        };
      }

      const hasil = await handler({ ctx, tx });

      // ON CONFLICT menggantikan baris yang sudah KEDALUWARSA. Ia tidak dapat
      // menimpa kunci yang masih hidup: baris hidup sudah dijawab di atas —
      // sebagai respons tersimpan (ID-03) atau 409 (ID-04) — sehingga satu-satunya
      // cara sampai ke sini dengan baris yang sudah ada adalah TTL-nya lewat.
      await sql`
        INSERT INTO idempotency_keys (key, endpoint, request_hash, status_code, response_body)
        VALUES (${request.key}::uuid, ${request.endpoint}, ${hash},
                ${hasil.statusCode}, ${JSON.stringify(hasil.body)}::jsonb)
        ON CONFLICT (key) DO UPDATE
           SET endpoint      = EXCLUDED.endpoint,
               request_hash  = EXCLUDED.request_hash,
               status_code   = EXCLUDED.status_code,
               response_body = EXCLUDED.response_body,
               created_at    = now(),
               expires_at    = now() + interval '24 hours'
      `.execute(tx);

      return { statusCode: hasil.statusCode, body: hasil.body, replayed: false };
    });
}
