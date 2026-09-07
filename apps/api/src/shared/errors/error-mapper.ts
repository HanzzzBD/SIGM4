// ErrorMapper (SDD-SYS-06, SDD-06 §4.4). Satu-satunya tempat galat berubah
// menjadi respons HTTP; controller tidak pernah menyebut status.
//
// Urutan pencocokan MENGIKAT: yang lebih khusus lebih dulu, `always` terakhir.
// Menukar urutannya mengubah kode yang diterima klien tanpa satu pun tipe berubah.

import { DomainError } from './domain-error.js';
import type { KodeGalat } from './codes.js';
import { statusUntuk } from './codes.js';

/** Galat PostgreSQL membawa `code` SQLSTATE lima karakter. */
interface PgGalat {
  code: string;
  constraint?: string;
}

function pgGalat(galat: unknown): PgGalat | undefined {
  if (galat === null || typeof galat !== 'object') return undefined;
  const c = (galat as { code?: unknown }).code;
  return typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c)
    ? (galat as unknown as PgGalat)
    : undefined;
}

/** Galat validasi skema (Zod) — dikenali dari bentuknya, bukan dari `instanceof`. */
function zodGalat(galat: unknown): boolean {
  return (
    galat !== null &&
    typeof galat === 'object' &&
    (galat as { name?: unknown }).name === 'ZodError' &&
    Array.isArray((galat as { issues?: unknown }).issues)
  );
}

export interface HasilPemetaan {
  readonly status: number;
  readonly kode: KodeGalat;
  /** Konteks yang aman dikirim ke klien. Tidak pernah memuat pesan galat asli. */
  readonly detail?: Readonly<Record<string, unknown>>;
  /** true bila kejadiannya wajib memicu alarm, bukan sekadar dikembalikan. */
  readonly alarm: boolean;
}

/**
 * Memetakan galat apa pun menjadi status + kode Bab 17.3.
 *
 * Galat 500 **tidak pernah** menyertakan pesan asli ke klien (`NFR-R-10`);
 * pesan asli hanya masuk log terstruktur bersama `request_id`.
 */
export function mapError(galat: unknown): HasilPemetaan {
  if (zodGalat(galat)) return hasil('INVALID_REQUEST');

  if (galat instanceof DomainError) {
    return hasil(galat.kode, galat.detail);
  }

  const pg = pgGalat(galat);
  if (pg !== undefined) {
    // CI-04: pelanggaran exclusion constraint booking_slots.
    // SDD-06 §4.4 — dibedakan berdasarkan nama constraint yang dilanggar,
    // karena aset dan ruangan memberi pesan berbeda kepada pengguna.
    if (pg.code === '23P01') {
      const aset = pg.constraint?.includes('asset') ?? false;
      return hasil(aset ? 'ASSET_NOT_AVAILABLE' : 'RESERVATION_CONFLICT');
    }
    if (pg.code === '23505') return hasil('DUPLICATE_CODE');
    // 23514 hanya dapat dilanggar dari jalur pengguna lewat
    // material_balances_non_negatif — jaring terakhir SDD-DB-14. Bila IA yang
    // menolak, ada jalur kode yang lupa mengunci baris: wajib alarm.
    if (pg.code === '23514') return hasil('INSUFFICIENT_BALANCE', undefined, true);
  }

  return hasil('INTERNAL_ERROR', undefined, true);
}

function hasil(
  kode: KodeGalat,
  detail?: Readonly<Record<string, unknown>>,
  alarm = false,
): HasilPemetaan {
  return detail === undefined
    ? { status: statusUntuk(kode), kode, alarm }
    : { status: statusUntuk(kode), kode, detail, alarm };
}
