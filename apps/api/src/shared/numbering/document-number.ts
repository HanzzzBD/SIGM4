// DocumentNumberService (SDD-SYS-06, SDD-AVL-09, SEQ-01 … SEQ-04).
//
// Format: {PREFIX}-{TAHUN}-{URUT:4} — contoh RSV-RG-2026-0001 (SEQ-01).
// Nomor lahir dari penghitung basis data, bukan dari MAX(nomor)+1 (SEQ-02);
// bersifat gap-tolerant — transaksi yang gagal boleh menyisakan lompatan, dan
// nomor tidak pernah dipakai ulang (SEQ-03).

import { sql } from 'kysely';
import type { Clock } from '../clock/index.js';
import type { QueryExecutor } from '../db/index.js';

/**
 * Prefiks yang sah beserta entitas pemiliknya — cerminan tabel pemilik prefiks
 * pada `PRD 26` (`SEQ-04`). Daftar ini TERTUTUP: prefiks bertambah di PRD lebih
 * dulu, lalu dicerminkan ke sini. Uji membandingkan keduanya baris per baris.
 */
export const PREFIKS = {
  'RSV-RG': 'reservations (ruangan)',
  'RSV-BR': 'reservations (aset)',
  PJM: 'loans',
  KRS: 'damage_reports',
  WO: 'work_orders',
  OPN: 'audit_sessions',
  PGD: 'procurements',
  HPS: 'asset_disposals',
  PMB: 'material_requests',
} as const satisfies Record<string, string>;

export type Prefiks = keyof typeof PREFIKS;

/** Regex `SEQ-04`. Dirakit dari PREFIKS agar tidak dapat menyimpang darinya. */
export const POLA_NOMOR = new RegExp(
  `^(${Object.keys(PREFIKS)
    .sort((a, b) => b.length - a.length) // yang lebih panjang lebih dulu: RSV-RG sebelum RSV
    .join('|')})-\\d{4}-\\d{4,}$`,
);

const LEBAR_URUT = 4;

export class DocumentNumberService {
  constructor(private readonly clock: Clock) {}

  /**
   * Menerbitkan satu nomor dokumen dan menaikkan penghitungnya.
   *
   * Dijalankan pada `executor` yang diberikan — bila itu transaksi berjalan,
   * kenaikan penghitung ikut commit bersama dokumennya. Baris penghitung terkunci
   * oleh `ON CONFLICT DO UPDATE` sampai transaksi selesai, sehingga dua permintaan
   * bersamaan atas (prefix, tahun) yang sama diserialisasi basis data — bukan oleh
   * kunci aplikasi yang dapat dilewati proses lain.
   */
  async next(executor: QueryExecutor, prefiks: Prefiks): Promise<string> {
    if (!(prefiks in PREFIKS)) {
      // Gagal keras, bukan menerbitkan nomor yang tidak lolos SEQ-04. Prefiks
      // tak dikenal berarti ada entitas bernomor yang belum masuk katalog PRD.
      throw new Error(`Prefiks nomor dokumen tidak dikenal: ${prefiks} (SEQ-04)`);
    }

    // Tahun ANGGARAN = tahun kalender (AC-YR-04), dari Clock (SDD-SYS-07).
    const tahun = this.clock.now().getUTCFullYear();

    const hasil = await sql<{ value: string }>`
      INSERT INTO document_counters (prefix, year, value)
      VALUES (${prefiks}, ${tahun}, 1)
      ON CONFLICT (prefix, year) DO UPDATE SET value = document_counters.value + 1
      RETURNING value
    `.execute(executor);

    const urut = hasil.rows[0]?.value;
    if (urut === undefined) {
      throw new Error('Penghitung nomor dokumen tidak mengembalikan nilai');
    }

    // bigint kembali sebagai string dari driver pg — jangan dilewatkan Number(),
    // yang diam-diam kehilangan presisi di atas 2^53.
    return `${prefiks}-${tahun}-${urut.padStart(LEBAR_URUT, '0')}`;
  }
}

/** Memeriksa sebuah nomor terhadap `SEQ-04`. Dipakai uji dan validasi masukan. */
export function nomorSah(nomor: string): boolean {
  return POLA_NOMOR.test(nomor);
}
