// EventBus — penerbitan event ke outbox (SDD-EVT-03, SDD-EVT-04, SDD-EVT-06).
//
// `publish` menerima `TransactionScope`, bukan koneksi. Itu bukan kenyamanan:
// `SDD-EVT-04` mewajibkan event terbit DI DALAM transaksi bisnis, dan
// `TransactionScope` hanya lahir di dalam `withTransaction`. Menerima
// `QueryExecutor` akan membuat penerbitan di luar transaksi tetap terkompilasi —
// dan kegagalannya baru terlihat sebagai notifikasi yang terbit untuk transaksi
// yang ternyata di-rollback.

import type { TransactionScope } from '../db/index.js';
import { konteksSaatIni } from '../observability/index.js';

/**
 * Event domain. Namanya berformat `<Entitas><KataKerjaLampau>` dalam Bahasa
 * Inggris (`SDD-EVT-05`); katalog lengkapnya di `SDD-07 §4.3`.
 */
export interface DomainEvent {
  readonly name: string;
  /** Penentu urutan bersama `aggregateId` (`SDD-EVT-09`), bukan keterangan. */
  readonly aggregateType: string;
  readonly aggregateId: string | number;
  /**
   * Pengenal dan fakta minimum saja (`SDD-EVT-06`). Konsumen membaca ulang
   * entitasnya dari repository — payload gemuk membuat konsumen bekerja atas
   * data basi dan mengunci bentuk entitas ke dalam kontrak event.
   */
  readonly payload: Readonly<Record<string, unknown>>;
}

export class EventPublishError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = 'EventPublishError';
  }
}

function periksa(event: DomainEvent): void {
  if (event.name.trim() === '') {
    throw new EventPublishError('Nama event tidak boleh kosong (SDD-EVT-05).');
  }
  if (event.aggregateType.trim() === '') {
    throw new EventPublishError(
      `Event ${event.name} tanpa aggregate_type — urutan SDD-EVT-09 tidak dapat dijamin.`,
    );
  }
}

/**
 * Menerbitkan satu event ke outbox di dalam transaksi berjalan.
 *
 * `actor_id` diambil dari `AuthContext` yang membuka transaksi, dan `request_id`
 * dari konteks permintaan yang sedang berjalan (`SDD-OBS-03`) — keduanya supaya
 * satu permintaan tetap dapat ditelusuri setelah melewati batas commit, ketika
 * yang mengerjakannya sudah worker.
 */
export async function publish(scope: TransactionScope, event: DomainEvent): Promise<void> {
  periksa(event);
  await scope.tx
    .insertInto('event_outbox')
    .values({
      event_name: event.name,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      payload: JSON.stringify(event.payload),
      actor_id: String(scope.ctx.userId),
      request_id: konteksSaatIni()?.requestId ?? null,
    })
    .execute();
}

/**
 * Menerbitkan beberapa event sekaligus, urut sesuai argumen.
 *
 * Urutan argumen menjadi urutan `id`, dan `SDD-EVT-09` memproses menaik `id` —
 * sehingga `[LoanReturned, FineIssued]` benar-benar sampai dalam urutan itu.
 */
export async function publishAll(
  scope: TransactionScope,
  events: readonly DomainEvent[],
): Promise<void> {
  for (const event of events) {
    await publish(scope, event);
  }
}
