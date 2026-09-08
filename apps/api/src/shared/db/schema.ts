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

import type { ColumnType, Generated } from 'kysely';

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

/**
 * `work_days` (0004, PR-00-08). Hari kerja pekanan; `hari` memakai penomoran
 * ISO-8601 — 1 = Senin … 7 = Minggu (Lampiran E.2, CAL-01).
 */
export interface WorkDaysTable {
  hari: number;
  aktif: boolean;
}

/**
 * `holidays` (0004, PR-00-08). `academic_year_id` sengaja belum ada — ia
 * ditambahkan `PR-01-11` bersama `academic_years` sebagai migration `expand`.
 */
export interface HolidaysTable {
  id: Generated<string>;
  tanggal: ColumnType<string, string, string>;
  nama: string;
  jenis: 'NASIONAL' | 'SEKOLAH' | 'CUTI_BERSAMA';
}

/**
 * `idempotency_keys` (0005, PR-00-10). `status_code` dan `response_body` NULL
 * hanya di dalam transaksi yang sedang menulisnya — deteksi permintaan berjalan
 * memakai advisory lock, bukan kolom ini (`SDD-01 §4.4`).
 */
export interface IdempotencyKeysTable {
  key: string;
  endpoint: string;
  request_hash: string;
  status_code: number | null;
  response_body: unknown;
  created_at: Generated<Date>;
  expires_at: Generated<Date>;
}

/**
 * `event_outbox` (0006, PR-00-12). Transactional outbox — SDD-07 §4.1.
 *
 * `id` dan `aggregate_id` bertipe `bigint` di basis data dan kembali sebagai
 * **string** dari driver `pg`; itu dipertahankan apa adanya dengan alasan yang
 * sama seperti `document_counters.value`.
 *
 * Tiga kolom terakhir adalah pembukuan dispatcher, dan itulah sebabnya tabel ini
 * **bukan** *append-only*: `SDD-05` §4.2 menggolongkannya infrastruktur, dan
 * `AL-03b` yang mencabut hak `UPDATE` hanya menyebut `activity_logs`.
 */
export interface EventOutboxTable {
  id: Generated<string>;
  event_name: string;
  aggregate_type: string;
  aggregate_id: ColumnType<string, string | number, string | number>;
  payload: unknown;
  actor_id: string | null;
  request_id: string | null;
  occurred_at: Generated<Date>;
  processed_at: Date | null;
  attempts: Generated<number>;
  last_error: string | null;
}

/**
 * `activity_logs` (0008, PR-00-13). Terpartisi RANGE per bulan (`SDD-DB-07`);
 * bentuk kolomnya persis `SDD-05` §4.4.
 *
 * `waktu` tetap bernama `waktu` — pengecualian tertulis pada `SDD-05` §4.2,
 * sebab ia kolom partisi dan maknanya *kapan peristiwa terjadi*, bukan kapan
 * barisnya dibuat.
 *
 * Tabel ini **append-only** dan itu ditegakkan basis data: akun aplikasi tidak
 * memegang `UPDATE`/`DELETE` (`AL-03b`, migration 0007–0008). Tipe ini tidak
 * dapat mencegah kueri `updateTable('activity_logs')` ditulis, tetapi kueri itu
 * akan ditolak `42501` saat berjalan.
 */
export interface ActivityLogsTable {
  id: Generated<string>;
  waktu: ColumnType<Date, Date | string, never>;
  user_id: string | null;
  user_nama: string | null;
  role: string | null;
  ip: string | null;
  user_agent: string | null;
  modul: string;
  aksi: string;
  entitas: string | null;
  entitas_id: string | null;
  nilai_sebelum: ColumnType<unknown, string | null, never>;
  nilai_sesudah: ColumnType<unknown, string | null, never>;
  keterangan: string | null;
  hasil: 'SUKSES' | 'GAGAL';
  request_id: string | null;
  prev_hash: Buffer | null;
  row_hash: Buffer;
}

/** Peta nama tabel -> bentuk barisnya. Diisi bersama migration pemiliknya. */
export interface Database {
  document_counters: DocumentCountersTable;
  work_days: WorkDaysTable;
  holidays: HolidaysTable;
  idempotency_keys: IdempotencyKeysTable;
  event_outbox: EventOutboxTable;
  activity_logs: ActivityLogsTable;
}
