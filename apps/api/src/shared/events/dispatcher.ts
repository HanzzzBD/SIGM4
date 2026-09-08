// Dispatcher outbox (SDD-07 §4.2, SDD-EVT-04, SDD-EVT-07, SDD-EVT-09).
//
// Berjalan di entrypoint worker, SETELAH commit. Tiga jaminan yang dijaga:
//
//   SDD-EVT-04  hanya membaca baris yang sudah commit — event transaksi yang
//               gagal tidak pernah ada untuk dibaca
//   SDD-EVT-09  urutan per agregat; KUNCI diambil per agregat, bukan per baris
//   SDD-EVT-07  at-least-once, bukan exactly-once — handler wajib idempoten
//
// Kunci per agregat itu yang membuat `SKIP LOCKED` benar. Mengunci per baris
// justru melanggar SDD-EVT-09 pada keadaan yang SKIP LOCKED siapkan: dispatcher
// kedua melewati baris terkunci dan memungut event BERIKUTNYA dari agregat yang
// sama, sehingga urutannya terbalik.

import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import type { Clock } from '../clock/index.js';
import type { Database } from '../db/index.js';
import { getDb } from '../db/index.js';
import { Logger } from '../observability/index.js';

/** Ambang dead letter (`SDD-07 §4.2`). */
export const MAX_ATTEMPTS = 5;

/**
 * Basis backoff eksponensial: percobaan ke-n menunggu `BASE * 2^(n-1)`.
 *
 * Angkanya belum dikalibrasi — `SDD-07 §4.2` mewajibkan backoff-nya eksponensial
 * tanpa menyebut basis. Diekspor supaya kalibrasi Phase 07–08 mengubah satu
 * tempat, bukan berburu bilangan di dalam badan fungsi.
 */
export const BACKOFF_BASE_MS = 30_000;

/** Satu baris outbox sebagaimana dibaca dispatcher. */
export interface OutboxEvent {
  readonly id: string;
  readonly name: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly actorId: string | null;
  readonly requestId: string | null;
  readonly occurredAt: Date;
  readonly attempts: number;
}

export type EventHandler = (event: OutboxEvent) => Promise<void>;

/**
 * Peta nama event -> handler-nya. Satu event boleh punya beberapa handler
 * (`SDD-07 §4.3`: `LoanReturned` memicu `NT-14` **dan** metrik utilisasi).
 */
export class EventHandlerRegistry {
  private readonly handlers = new Map<string, EventHandler[]>();

  on(eventName: string, handler: EventHandler): this {
    const daftar = this.handlers.get(eventName);
    if (daftar === undefined) this.handlers.set(eventName, [handler]);
    else daftar.push(handler);
    return this;
  }

  handlersFor(eventName: string): readonly EventHandler[] {
    return this.handlers.get(eventName) ?? [];
  }
}

export interface DispatcherOptions {
  readonly registry: EventHandlerRegistry;
  readonly clock: Clock;
  readonly db?: Kysely<Database>;
  readonly logger?: Logger;
  /** Dipanggil saat sebuah event mencapai `MAX_ATTEMPTS` — alarm `OBS-05`. */
  readonly onDeadLetter?: (event: OutboxEvent, galat: unknown) => void;
}

/** Penundaan satu agregat: kapan boleh dicoba lagi, dan agregat mana. */
interface TundaAgregat {
  readonly jenis: string;
  readonly id: string;
  readonly sampai: number;
}

/** Hasil satu putaran: satu agregat diproses, atau tidak ada yang menunggu. */
export interface TickResult {
  readonly processed: number;
  readonly failed: number;
}

interface BarisOutbox {
  id: string;
  event_name: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  actor_id: string | null;
  request_id: string | null;
  occurred_at: Date;
  attempts: number;
}

function keAcara(baris: BarisOutbox): OutboxEvent {
  return {
    id: baris.id,
    name: baris.event_name,
    aggregateType: baris.aggregate_type,
    aggregateId: baris.aggregate_id,
    payload: baris.payload,
    actorId: baris.actor_id,
    requestId: baris.request_id,
    occurredAt: baris.occurred_at,
    attempts: baris.attempts,
  };
}

function pesanGalat(galat: unknown): string {
  return galat instanceof Error ? galat.message : String(galat);
}

export class OutboxDispatcher {
  private readonly registry: EventHandlerRegistry;
  private readonly clock: Clock;
  private readonly db: Kysely<Database>;
  private readonly logger: Logger;
  private readonly onDeadLetter: ((event: OutboxEvent, galat: unknown) => void) | undefined;

  /**
   * Agregat yang sedang menunggu backoff, beserta waktu boleh dicoba lagi.
   *
   * Di memori, bukan di kolom: `SDD-07 §4.1` tidak punya kolom waktu-percobaan
   * berikutnya, dan menambahkannya adalah suntingan skema yang bukan milik PR
   * ini. Akibatnya jujur dan terbatas — proses yang restart, atau dispatcher
   * kedua, akan mencoba lebih awal daripada backoff-nya. Itu aman karena
   * `SDD-EVT-07` menuntut handler idempoten; yang hilang hanya jedanya.
   */
  private readonly backoff = new Map<string, TundaAgregat>();

  constructor(options: DispatcherOptions) {
    this.registry = options.registry;
    this.clock = options.clock;
    this.db = options.db ?? getDb();
    this.logger = options.logger ?? new Logger({ clock: options.clock, modulBawaan: 'outbox' });
    this.onDeadLetter = options.onDeadLetter;
  }

  /**
   * Memproses **satu** agregat: seluruh event pending miliknya, berurutan `id`.
   *
   * Rantai berhenti pada kegagalan pertama. Melanjutkan ke event berikutnya akan
   * menyampaikannya mendahului event yang gagal — persis pembalikan urutan yang
   * `SDD-EVT-09` larang.
   */
  async tick(): Promise<TickResult> {
    const tertunda = this.agregatTertunda();
    return this.db.transaction().execute(async (tx) => {
      const dipilih = await this.kunciAgregat(tx, tertunda);
      if (dipilih === undefined) return { processed: 0, failed: 0 };

      const antrean = await this.eventAgregat(tx, dipilih);
      let processed = 0;

      for (const baris of antrean) {
        const event = keAcara(baris);
        try {
          for (const handler of this.registry.handlersFor(event.name)) {
            await handler(event);
          }
          await tx
            .updateTable('event_outbox')
            .set({ processed_at: this.clock.now() })
            .where('id', '=', event.id)
            .execute();
          processed += 1;
        } catch (galat) {
          await this.catatKegagalan(tx, event, galat);
          return { processed, failed: 1 };
        }
      }

      this.backoff.delete(kunciBackoff(dipilih.aggregate_type, dipilih.aggregate_id));
      return { processed, failed: 0 };
    });
  }

  /** Memproses berulang sampai tidak ada lagi yang dapat dikerjakan sekarang. */
  async drain(batasPutaran = 1000): Promise<TickResult> {
    let processed = 0;
    let failed = 0;
    for (let i = 0; i < batasPutaran; i += 1) {
      const hasil = await this.tick();
      processed += hasil.processed;
      failed += hasil.failed;
      if (hasil.processed === 0 && hasil.failed === 0) break;
    }
    return { processed, failed };
  }

  /** Agregat yang belum boleh dicoba lagi, dalam dua larik sejajar untuk `unnest`. */
  private agregatTertunda(): { jenis: string[]; id: string[] } {
    const sekarang = this.clock.now().getTime();
    const jenis: string[] = [];
    const id: string[] = [];
    for (const [kunci, tunda] of this.backoff) {
      if (tunda.sampai <= sekarang) {
        this.backoff.delete(kunci);
        continue;
      }
      jenis.push(tunda.jenis);
      id.push(tunda.id);
    }
    return { jenis, id };
  }

  /**
   * Mengunci sebuah agregat lewat baris KEPALA-nya — event pending ber-`id`
   * terkecil milik agregat itu.
   *
   * Syarat `id = min(id)` bukan optimasi, melainkan yang membuat kuncinya
   * benar-benar jatuh pada agregat. Tanpanya, `SKIP LOCKED` melewati baris yang
   * terkunci lalu mengunci baris BERIKUTNYA dari agregat yang sama; dua
   * dispatcher kemudian saling menunggu saat masing-masing mengambil seluruh
   * rantai agregat itu, dan PostgreSQL melaporkan **deadlock**. Dengan kepala
   * sebagai satu-satunya baris yang dapat dikunci, satu agregat hanya punya satu
   * pemegang, dan dispatcher kedua berpindah ke agregat lain.
   *
   * `attempts < MAX_ATTEMPTS` wajib ada: tanpanya baris dead letter dipungut
   * ulang selamanya, sebab indeks `event_outbox_pending` sengaja tidak
   * menyaringnya (`SDD-07 §4.2`).
   */
  private async kunciAgregat(
    tx: Kysely<Database>,
    tertunda: { jenis: string[]; id: string[] },
  ): Promise<{ aggregate_type: string; aggregate_id: string } | undefined> {
    const hasil = await sql<{ aggregate_type: string; aggregate_id: string }>`
      SELECT aggregate_type, aggregate_id
        FROM event_outbox e
       WHERE processed_at IS NULL
         -- Tanpa 'AND attempts < …' di sini: kelayakan sudah ditegakkan subkueri
         -- di bawah. Barisnya terpilih HANYA bila ia min(id) di antara baris yang
         -- layak, jadi ia pasti layak. Menyalin syaratnya ke sini membuat ada dua
         -- tempat yang dapat dicabut sendiri-sendiri tanpa satu pun uji memerah.
         AND id = (
               SELECT min(id) FROM event_outbox k
                WHERE k.aggregate_type = e.aggregate_type
                  AND k.aggregate_id   = e.aggregate_id
                  AND k.processed_at IS NULL
                  AND k.attempts < ${MAX_ATTEMPTS}
             )
         AND (aggregate_type, aggregate_id) NOT IN (
               SELECT t, a FROM unnest(
                 ${sql.val(tertunda.jenis)}::text[],
                 ${sql.val(tertunda.id)}::bigint[]
               ) AS u(t, a)
             )
       ORDER BY id
         FOR UPDATE SKIP LOCKED
       LIMIT 1
    `.execute(tx);
    return hasil.rows[0];
  }

  private async eventAgregat(
    tx: Kysely<Database>,
    agregat: { aggregate_type: string; aggregate_id: string },
  ): Promise<readonly BarisOutbox[]> {
    const hasil = await sql<BarisOutbox>`
      SELECT id, event_name, aggregate_type, aggregate_id, payload,
             actor_id, request_id, occurred_at, attempts
        FROM event_outbox
       WHERE processed_at IS NULL
         AND attempts < ${MAX_ATTEMPTS}
         AND aggregate_type = ${agregat.aggregate_type}
         AND aggregate_id = ${agregat.aggregate_id}
       ORDER BY id
         FOR UPDATE
    `.execute(tx);
    return hasil.rows;
  }

  private async catatKegagalan(
    tx: Kysely<Database>,
    event: OutboxEvent,
    galat: unknown,
  ): Promise<void> {
    const percobaan = event.attempts + 1;
    await tx
      .updateTable('event_outbox')
      .set({ attempts: percobaan, last_error: pesanGalat(galat) })
      .where('id', '=', event.id)
      .execute();

    if (percobaan >= MAX_ATTEMPTS) {
      // Dead letter: keadaan baris, bukan tempat lain (SDD-07 §4.2). Ia berhenti
      // dipungut karena `attempts < MAX_ATTEMPTS` tidak lagi terpenuhi.
      this.logger.error('Event mencapai dead letter', galat, {
        event_id: event.id,
        event_name: event.name,
        attempts: percobaan,
      });
      this.onDeadLetter?.(event, galat); // alarm OBS-05
      return;
    }

    // Backoff eksponensial (SDD-07 §4.2). Agregatnya ikut tertahan, bukan hanya
    // barisnya — event sesudahnya tidak boleh mendahului yang gagal.
    const jeda = BACKOFF_BASE_MS * 2 ** (percobaan - 1);
    this.backoff.set(kunciBackoff(event.aggregateType, event.aggregateId), {
      jenis: event.aggregateType,
      id: event.aggregateId,
      sampai: this.clock.now().getTime() + jeda,
    });
    this.logger.warn('Event gagal, dijadwalkan ulang', {
      event_id: event.id,
      event_name: event.name,
      attempts: percobaan,
      backoff_ms: jeda,
    });
  }
}

/**
 * Kunci peta backoff. Bentuknya bebas dan tidak pernah diurai balik — jenis dan
 * id agregat disimpan sebagai field tersendiri pada nilainya, sehingga tidak ada
 * pemisah yang dapat bertabrakan dengan isi `aggregate_type`.
 */
function kunciBackoff(jenis: string, id: string): string {
  return `${jenis}/${id}`;
}
