// Tipe tabel Kysely (SDD-DB-15). Ini CERMINAN skema, bukan pendefinisinya:
// pemilik skema tetap berkas .sql di apps/api/migrations (SDD-DB-08).
//
// Aturannya satu, dan SDD-05 §5 menyebutnya eksplisit: setiap migration yang
// mengubah bentuk tabel menyegarkan tipenya pada PR YANG SAMA. Tipe yang
// tertinggal berhenti mencerminkan basis data dan berubah menjadi kebohongan
// yang diperiksa CI.
//
// 0001-0002 (PR-00-05) hanya membuat ekstensi dan tipe enum — bukan tabel —
// sehingga peta ini memang kosong sampai 0003.

import type { ColumnType } from 'kysely';

/**
 * `document_counters` (0003, PR-00-07). Penghitung nomor dokumen per
 * (prefix, tahun) — SDD-AVL-09, SEQ-02.
 *
 * `value` bertipe `bigint` di basis data dan kembali sebagai **string** dari
 * driver `pg`. Itu dipertahankan apa adanya: melewatkannya ke `Number()` akan
 * diam-diam kehilangan presisi di atas 2^53, dan tipe yang berbohong tentang
 * hal itu lebih berbahaya daripada tipe yang merepotkan.
 */
export interface DocumentCountersTable {
  prefix: string;
  year: number;
  value: ColumnType<string, string | number | undefined, string | number>;
}

/** Peta nama tabel -> bentuk barisnya. Diisi bersama migration pemiliknya. */
export interface Database {
  document_counters: DocumentCountersTable;
}
