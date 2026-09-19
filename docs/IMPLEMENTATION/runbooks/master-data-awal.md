# Runbook — Pengisian Master Data Awal dan Pemetaan Unit Kerja

| | |
|---|---|
| **Berlaku sampai** | [`PR-01-18`](../phases/phase-01.md) tergabung — sesudahnya pengisian master dilakukan Administrator lewat aplikasi |
| **Pelaksana** | Operator basis data, dengan data dari Administrator sekolah |
| **Requirement** | `AC-YR-01`, `WU-01`, `WU-02` ([`conventions.md`](../../PRD/00-foundation/conventions.md) Lampiran E) |
| **Skema** | [`SDD-05 §4.7b`](../../SDD/05-database-design.md) (kalender akademik) · [`§4.7c`](../../SDD/05-database-design.md) (`work_units`, `SDD-DB-19`) |
| **Konteks keputusan** | [`logs/phase-01.md`](../logs/phase-01.md) keputusan 27, 28, 29 |

Runbook ini **tidak mengubah scope PRD**: ia hanya menjembatani jarak antara skema (`PR-01-11`, `PR-01-12`) dan endpoint (`PR-01-18`). Nilai pada contoh bertanda `<…>` adalah tempat data sekolah — **jangan mengarang nilai**; tanyakan Administrator sekolah.

## 0. Sebelum mulai

| Hal | Ketentuan |
|---|---|
| Akun | Akun **operasional** berhak DML pada basis data. **Bukan** kredensial aplikasi (`APP_DATABASE_URL`) — akun aplikasi dipakai proses API, bukan manusia |
| Lingkungan | Jalankan dulu di staging. Tiap blok di bawah dibungkus `BEGIN … COMMIT`; ganti `COMMIT` dengan `ROLLBACK` untuk uji coba |
| Jejak | Penulisan lewat SQL **tidak** masuk `activity_logs` (`AL-01` hanya menjangkau jalur aplikasi). Catat setiap eksekusi — siapa, kapan, isi — pada tiket perubahan. Ini alasan `PR-01-18` ada |
| Urutan | 1 → 2 → 3. Pemetaan (bagian 3) hanya bermakna setelah unit kerja (bagian 2) terisi |

## 1. Kalender akademik (`AC-YR-01`)

Basis data menegakkan **tepat satu tahun ajaran aktif** (`SDD-DB-18`): tahun ajaran **pertama** wajib dibuat dengan `is_active = true`, dan tidak ada transaksi yang boleh berakhir tanpa tahun aktif.

```sql
BEGIN;
INSERT INTO academic_years (nama, tanggal_mulai, tanggal_selesai, is_active)
VALUES ('<2026/2027>', '<yyyy-mm-dd>', '<yyyy-mm-dd>', true);

INSERT INTO academic_terms (academic_year_id, nama, tanggal_mulai, tanggal_selesai)
SELECT id, 'GANJIL', '<yyyy-mm-dd>', '<yyyy-mm-dd>' FROM academic_years WHERE nama = '<2026/2027>';
INSERT INTO academic_terms (academic_year_id, nama, tanggal_mulai, tanggal_selesai)
SELECT id, 'GENAP', '<yyyy-mm-dd>', '<yyyy-mm-dd>' FROM academic_years WHERE nama = '<2026/2027>';
COMMIT;
```

Hari libur — `academic_year_id` boleh dikosongkan untuk libur nasional; `jenis` ∈ `NASIONAL`, `SEKOLAH`, `CUTI_BERSAMA`; satu tanggal hanya satu hari libur:

```sql
INSERT INTO holidays (tanggal, nama, jenis, academic_year_id)
SELECT '<yyyy-mm-dd>', '<nama>', 'NASIONAL', id FROM academic_years WHERE nama = '<2026/2027>';
```

Hari kerja sudah terisi Senin–Sabtu (seed `0011`); ubah hanya bila sekolah meminta: `UPDATE work_days SET aktif = <true|false> WHERE hari = <1..7>;` (1 = Senin … 7 = Minggu).

**Pergantian tahun ajaran aktif** — dua `UPDATE` dalam **satu** transaksi; satu saja tanpa yang lain akan ditolak saat `COMMIT`:

```sql
BEGIN;
UPDATE academic_years SET is_active = false WHERE is_active;
UPDATE academic_years SET is_active = true  WHERE nama = '<tahun ajaran baru>';
COMMIT;
```

> Pergantian lewat SQL **tidak** menjalankan kenaikan kelas massal (`AC-YR-02`, `SL-02`) — itu milik `PR-01-13`.

Verifikasi (harus tepat satu baris aktif; semester tidak beririsan dan berada di dalam tahun ajarannya — basis data **belum** menegakkan yang terakhir, periksa dengan mata):

```sql
SELECT nama, tanggal_mulai, tanggal_selesai, is_active FROM academic_years ORDER BY tanggal_mulai;
SELECT y.nama AS tahun, t.nama AS semester, t.tanggal_mulai, t.tanggal_selesai
  FROM academic_terms t JOIN academic_years y ON y.id = t.academic_year_id ORDER BY t.tanggal_mulai;
```

## 2. Unit kerja (`WU-01`, `WU-02`)

`jenis` ∈ `MANAJEMEN`, `MATA_PELAJARAN`, `TATA_USAHA`, `EKSTRAKURIKULER`, `KELAS`. `kode` dan `nama` unik **tanpa memandang huruf besar-kecil dan spasi tepi** — `TU` dan ` tu ` dianggap sama. Unit tidak pernah dihapus, hanya dinonaktifkan (`WU-02`).

```sql
INSERT INTO work_units (nama, kode, jenis)
VALUES ('<nama unit>', '<KODE>', '<JENIS>'),
       ('<nama unit>', '<KODE>', '<JENIS>');
```

Menonaktifkan: `UPDATE work_units SET status = 'NONAKTIF' WHERE kode = '<KODE>';` — pengguna yang sudah berada di unit itu tetap memakainya; unit tidak dapat dipilih untuk pengguna baru.

Impor pengguna (`kode_unit_kerja`, `E.5.2`) hanya berhasil untuk kode yang **sudah ada** di tabel ini — isi bagian ini **sebelum** mengimpor.

## 3. Memetakan teks `users.unit_kerja` lama ke master (`WU-01`, `SDD-DB-19`)

**Kapan:** setelah bagian 2 selesai, dan bila ada pengguna berteks `unit_kerja` (pada instalasi tanpa data lama, hasilnya kosong dan bagian ini selesai seketika).

```sql
SELECT * FROM map_users_unit_kerja();
```

Fungsi ini **idempoten** dan boleh dijalankan berulang. Ia mencocokkan teks lama dengan `nama` **atau** `kode` unit (huruf besar-kecil dan spasi tepi diabaikan), mengisi `work_unit_id` hanya bila **tepat satu** unit cocok, dan **tidak pernah menimpa** `work_unit_id` yang sudah terisi. Keluarannya adalah laporan: teks yang **belum terpetakan** beserta jumlah penggunanya.

Menindaklanjuti laporan — satu per satu, oleh manusia (fungsi ini tidak menebak):

| Penyebab | Tindakan |
|---|---|
| Unit belum ada di master | Tambahkan unit (bagian 2), jalankan ulang fungsi |
| Ejaan teks lama berbeda dari `nama`/`kode` | Tambahkan unit dengan ejaan yang diinginkan, atau atur pengguna lewat aplikasi: `PUT /users/{id}` dengan `work_unit_id` |
| Teks cocok dengan **dua** unit (nama satu unit = kode unit lain) | Fungsi sengaja membiarkannya; atur `work_unit_id` pengguna itu lewat aplikasi |
| Teks memang tidak bermakna (mis. `-`) | Putuskan bersama Administrator; catat di tiket bahwa dibiarkan kosong |

**Selesai bila** kueri berikut mengembalikan `0`, atau setiap sisanya sudah dicatat sebagai sengaja dibiarkan:

```sql
SELECT count(*) AS belum_terpetakan
  FROM users WHERE work_unit_id IS NULL AND btrim(coalesce(unit_kerja, '')) <> '';
```

> **Batas waktu:** kolom `users.unit_kerja` dihapus `PR-08-11` (*contract*, tidak dapat dibatalkan). Bagian 3 wajib selesai — atau sisanya diputuskan — **sebelum** PR itu.

## 4. Bila salah

- Blok bagian 1–2 berupa transaksi: `ROLLBACK` sebelum `COMMIT` membatalkan seluruhnya. Sesudah `COMMIT`, koreksi dengan `UPDATE`/`DELETE` terarah; `academic_terms` dan `holidays` boleh dihapus, `academic_years` yang masih dirujuk tidak.
- Bagian 3 tidak destruktif (hanya mengisi kolom kosong); memperbaiki pemetaan yang keliru berarti mengatur `work_unit_id` pengguna itu langsung, karena fungsi tidak menimpa.
