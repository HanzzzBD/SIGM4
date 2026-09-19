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

import type { ColumnType, Generated } from "kysely";

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
 * `holidays` (0004, PR-00-08; `academic_year_id` 0016, PR-01-11). Kolom itu
 * NULLABLE: hari libur nasional tidak intrinsik milik satu tahun ajaran.
 */
export interface HolidaysTable {
    id: Generated<string>;
    tanggal: ColumnType<string, string, string>;
    nama: string;
    jenis: "NASIONAL" | "SEKOLAH" | "CUTI_BERSAMA";
    academic_year_id: ColumnType<string | null, string | number | null | undefined, string | number | null>;
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
    hasil: "SUKSES" | "GAGAL";
    request_id: string | null;
    prev_hash: Buffer | null;
    row_hash: Buffer;
}

/**
 * Kolom baku `SDD-05` §4.2 (0012). `updated_at` dipelihara trigger — tipenya
 * menolak ditulis aplikasi, dan nilai yang dipaksakan lewat SQL tetap ditimpa.
 * `created_by` hanya diisi saat baris lahir.
 */
interface KolomBaku {
    created_at: ColumnType<Date, never, never>;
    updated_at: ColumnType<Date, never, never>;
    created_by: ColumnType<string | null, string | number | null, never>;
    updated_by: ColumnType<string | null, string | number | null, string | number | null>;
}

/**
 * `roles` (0009, PR-00-16; kolom baku 0012, PR-01-01; `role_version` 0013,
 * PR-01-04). Tujuh role seed ber-`created_by` NULL: dibuat sistem, bukan
 * seseorang.
 *
 * `role_version` bertipe `bigint` dan kembali sebagai **string** dari driver
 * `pg`, sama seperti `document_counters.value` — dinaikkan lewat ekspresi SQL
 * (`role_version + 1`), bukan dibaca-lalu-ditulis dari aplikasi (SDD-AUTH-04).
 */
export interface RolesTable extends KolomBaku {
    id: Generated<string>;
    kode: string;
    nama: string;
    deskripsi: string | null;
    is_system: Generated<boolean>;
    role_version: ColumnType<string, string | number | undefined, string | number>;
}

/**
 * `users` (0012, PR-01-01). `status` dan `must_change_password` sengaja tanpa
 * nilai bawaan — keduanya wajib dinyatakan saat akun dibuat (`SL-06`,
 * `FR-02.1` langkah 4). Penanda 2FA, kolom penguncian, dan foto profil belum
 * ada: masing-masing milik `SDD-04` §4.1 dan `SDD-FS-02`.
 */
export interface UsersTable extends KolomBaku {
    id: Generated<string>;
    nama: string;
    email: string;
    password_hash: string;
    nip_nis: string;
    role_id: ColumnType<string, string | number, string | number>;
    /**
     * Teks bebas warisan (`PR-01-12`, expand): masih dibaca, TIDAK lagi ditulis kode
     * — `work_unit_id` menggantikannya (WU-01). Dihapus `PR-08-11` (contract).
     */
    unit_kerja: ColumnType<string | null, never, never>;
    work_unit_id: ColumnType<string | null, string | number | null | undefined, string | number | null>;
    telepon: string | null;
    status: "AKTIF" | "NONAKTIF";
    must_change_password: boolean;
    login_terakhir_pada: Date | null;
}

/** `permissions` (0009, PR-00-16). Katalog Lampiran C; `inti` = 🔒 (`SDD-AUTH-10`). */
export interface PermissionsTable {
    id: Generated<string>;
    kode: string;
    modul: string;
    aksi: string;
    deskripsi: string;
    inti: Generated<boolean>;
}

/** `role_permissions` (0009, PR-00-16). Scope per baris — `SDD-DB-16`. */
export interface RolePermissionsTable {
    role_id: ColumnType<string, string | number, string | number>;
    permission_id: ColumnType<string, string | number, string | number>;
    scope: "ALL" | "OWN" | "ASSIGNED" | "RESTRICTED";
}

/** `buildings` (0014, PR-01-05). Tingkat pertama hierarki lokasi (`FR-03.1`). */
export interface BuildingsTable extends KolomBaku {
    id: Generated<string>;
    nama: string;
    kode: string;
    keterangan: string | null;
    status: Generated<"AKTIF" | "NONAKTIF">;
}

/**
 * `areas` (0014, PR-01-05). Tingkat kedua — SENGAJA tanpa `status`, lihat
 * migration `0014` untuk alasannya.
 */
export interface AreasTable extends KolomBaku {
    id: Generated<string>;
    building_id: ColumnType<string, string | number, string | number>;
    nama: string;
    kode: string;
    lantai: number | null;
}

/** `rooms` (0014, PR-01-05). Tingkat ketiga — tempat aset & bahan bermukim (`BR-082`). */
export interface RoomsTable extends KolomBaku {
    id: Generated<string>;
    area_id: ColumnType<string, string | number, string | number>;
    nama: string;
    kode: string;
    jenis:
        | "KELAS"
        | "LABORATORIUM"
        | "AULA"
        | "PERPUSTAKAAN"
        | "KANTOR"
        | "GUDANG"
        | "LAPANGAN"
        | "LAINNYA";
    kapasitas: number | null;
    penanggung_jawab_id: ColumnType<string | null, string | number | null, string | number | null>;
    dapat_direservasi: Generated<boolean>;
    boleh_direservasi_siswa: Generated<boolean>;
    status: Generated<"AKTIF" | "NONAKTIF">;
}

/**
 * `system_settings` (0015, PR-01-10). Bukan entitas domain: tanpa `id` dan
 * `created_*` (`SDD-05 §4.7a`). `value` jsonb ditulis sebagai string JSON
 * (pola `activity_logs`); `nilai_min`/`nilai_maks` bertipe `numeric` dan kembali
 * sebagai **string** dari driver `pg` — diubah ke angka di lapisan service.
 */
export interface SystemSettingsTable {
    key: string;
    kelompok:
        | "IDENTITAS_SEKOLAH"
        | "KODE_ASET"
        | "PEMINJAMAN"
        | "DENDA"
        | "RESERVASI"
        | "MAINTENANCE"
        | "BAHAN"
        | "NOTIFIKASI"
        | "KEAMANAN"
        | "CHATBOT_AI";
    tipe: "BILANGAN_BULAT" | "DESIMAL" | "BOOLEAN" | "TEKS";
    value: ColumnType<unknown, string, string>;
    nilai_bawaan: ColumnType<unknown, string, never>;
    nilai_min: ColumnType<string | null, string | number | null | undefined, never>;
    nilai_maks: ColumnType<string | null, string | number | null | undefined, never>;
    deskripsi: string;
    updated_at: ColumnType<Date, never, never>;
    updated_by: ColumnType<string | null, string | number | null, string | number | null>;
}

/** `work_units` (0017, PR-01-12). Unit kerja / kelas — Lampiran E.3. */
export interface WorkUnitsTable extends KolomBaku {
    id: Generated<string>;
    nama: string;
    kode: string;
    jenis: "MANAJEMEN" | "MATA_PELAJARAN" | "TATA_USAHA" | "EKSTRAKURIKULER" | "KELAS";
    kepala_unit_id: ColumnType<string | null, string | number | null | undefined, string | number | null>;
    status: Generated<"AKTIF" | "NONAKTIF">;
}

/**
 * `academic_years` (0016, PR-01-11). `tanggal_*` bertipe `date` dan kembali
 * sebagai string `YYYY-MM-DD` (pola `holidays.tanggal`). Tepat satu baris
 * `is_active` ditegakkan basis data — SDD-05 §4.7b.
 */
export interface AcademicYearsTable extends KolomBaku {
    id: Generated<string>;
    nama: string;
    tanggal_mulai: ColumnType<string, string, string>;
    tanggal_selesai: ColumnType<string, string, string>;
    is_active: Generated<boolean>;
}

/** `academic_terms` (0016, PR-01-11). Ganjil/Genap per tahun ajaran (Lampiran E.2). */
export interface AcademicTermsTable extends KolomBaku {
    id: Generated<string>;
    academic_year_id: ColumnType<string, string | number, string | number>;
    nama: "GANJIL" | "GENAP";
    tanggal_mulai: ColumnType<string, string, string>;
    tanggal_selesai: ColumnType<string, string, string>;
}

/** Peta nama tabel -> bentuk barisnya. Diisi bersama migration pemiliknya. */
export interface Database {
    document_counters: DocumentCountersTable;
    work_days: WorkDaysTable;
    holidays: HolidaysTable;
    idempotency_keys: IdempotencyKeysTable;
    event_outbox: EventOutboxTable;
    activity_logs: ActivityLogsTable;
    roles: RolesTable;
    permissions: PermissionsTable;
    role_permissions: RolePermissionsTable;
    users: UsersTable;
    buildings: BuildingsTable;
    areas: AreasTable;
    rooms: RoomsTable;
    system_settings: SystemSettingsTable;
    academic_years: AcademicYearsTable;
    academic_terms: AcademicTermsTable;
    work_units: WorkUnitsTable;
}
