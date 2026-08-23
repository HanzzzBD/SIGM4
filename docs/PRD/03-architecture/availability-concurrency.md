# 26. Model Ketersediaan, Konkurensi & Integritas Transaksi

> **Bab ini bersifat mengikat bagi Software Architect dan Backend Lead.** Ia menyelesaikan ambiguitas paling berdampak dalam PRD: bagaimana ketersediaan berbasis waktu direpresentasikan, dan bagaimana sistem menjamin tidak terjadi *double-booking* di bawah beban konkuren.

## 26.1 Masalah yang Diselesaikan

Kolom `assets.status` bertipe enum tunggal hanya dapat menyatakan **satu** keadaan pada satu waktu. Sementara itu, reservasi bersifat *time-ranged*: satu unit dapat `Tersedia` hari ini, dipesan minggu depan, dan bebas kembali minggu berikutnya. Menjadikan `assets.status` sebagai sumber kebenaran ketersediaan akan menyebabkan:

- unit yang sedang dipinjam hari ini tampak tidak dapat dipesan untuk bulan depan;
- reservasi berulang 8 minggu mengunci unit selama 8 minggu penuh;
- perhitungan ketersediaan (FR-08.1) tidak mungkin memenuhi kriteria penerimaannya.

Karena itu ditetapkan pemisahan tegas berikut.

| Konsep | Direpresentasikan oleh | Menjawab pertanyaan |
|---|---|---|
| **Status operasional saat ini** | `assets.status` (BR-005) | "Unit ini sekarang di mana / sedang apa?" |
| **Ketersediaan pada rentang waktu** | Tabel `booking_slots` | "Apakah unit ini bebas pada 12–14 Agustus?" |

## 26.2 Entitas `booking_slots`

Satu tabel tunggal menampung seluruh pemesanan waktu, baik atas ruangan maupun atas unit aset, termasuk blokade non-reservasi.

| Atribut | Tipe | Keterangan |
|---|---|---|
| `id` | bigint PK | |
| `resource_type` | enum | `room` \| `asset` |
| `resource_id` | bigint | FK ke `rooms.id` atau `assets.id` |
| `slot_range` | tstzrange | Rentang waktu `[mulai, selesai)` — half-open agar slot berurutan tidak dianggap bentrok |
| `status` | enum | `Tentative` \| `Confirmed` \| `Active` \| `Released` |
| `origin` | enum | `reservation` \| `loan` \| `maintenance` \| `fixed_schedule` \| `manual_block` |
| `reservation_id` | bigint FK null | Terisi bila `origin = reservation` |
| `loan_id` | bigint FK null | Terisi bila `origin = loan` |
| `work_order_id` | bigint FK null | Terisi bila `origin = maintenance` |
| `parent_slot_id` | bigint FK null | Untuk slot turunan reservasi berulang |
| `expires_at` | timestamptz null | TTL slot `Tentative` (BR-023b) |
| `created_by` / `created_at` | | |

**Semantik status slot**

| Status | Terbentuk saat | Menghalangi pemesanan lain | Dibebaskan saat |
|---|---|---|---|
| `Tentative` | Pengajuan dibuat (FR-07.2 / FR-08.2) | Ya | Ditolak, dibatalkan, atau TTL habis (BR-023b) |
| `Confirmed` | Approval level terakhir disetujui | Ya | Dibatalkan, kedaluwarsa (BR-023), atau aset masuk perbaikan |
| `Active` | Serah terima dilakukan (FR-09.1) | Ya | Pengembalian tercatat (FR-09.2) |
| `Released` | — (status terminal) | Tidak | — |

Slot `Released` dipertahankan sebagai arsip untuk analitik utilisasi (SC-05, Bab 16) dan tidak dihapus.

## 26.3 Penegakan Integritas di Lapisan Basis Data

Validasi aplikasi **tidak cukup** untuk mencegah *race condition* (RS-11). Aturan berikut wajib ditegakkan oleh basis data:

```sql
-- PostgreSQL 15+, ekstensi btree_gist
ALTER TABLE booking_slots
  ADD CONSTRAINT booking_slots_no_overlap
  EXCLUDE USING gist (
    resource_type WITH =,
    resource_id   WITH =,
    slot_range    WITH &&
  )
  WHERE (status IN ('Tentative','Confirmed','Active'));
```

| Kode | Aturan integritas | Penegakan |
|---|---|---|
| CI-01 | Dua slot aktif atas sumber daya yang sama tidak boleh beririsan | *Exclusion constraint* di atas |
| CI-02 | Pemesanan multi-unit mengunci baris `assets` terurut menaik berdasarkan `asset_id` | Konvensi wajib pada service layer, untuk mencegah *deadlock* |
| CI-03 | Seluruh operasi pemesanan dijalankan pada isolasi `READ COMMITTED` dengan `SELECT … FOR UPDATE` atas baris aset yang dialokasikan | Service layer |
| CI-04 | Pelanggaran `booking_slots_no_overlap` dipetakan ke respons `409 ASSET_NOT_AVAILABLE` / `409 RESERVATION_CONFLICT`, bukan `500` | Error mapper |
| CI-05 | `assets.status` diturunkan (*derived*), tidak pernah ditulis langsung oleh modul reservasi | Hanya `LoanService`, `MaintenanceService`, `AssetService`, dan job `slot-activation` boleh menulisnya |

## 26.4 Algoritma Perhitungan Ketersediaan

Dipakai oleh FR-07.1, FR-08.1, dan tool AI `check_asset_availability`.

```
INPUT  : kategori/aset, rentang [T1, T2), konteks pengguna
LANGKAH:
  1. Ambil kandidat aset:
       dapat_dipinjam = true
       AND kondisi IN ('Baik','Rusak Ringan')
       AND status NOT IN ('Dalam Perbaikan','Tidak Tersedia')
       AND (role = Siswa/OSIS -> boleh_dipinjam_siswa = true)
       AND aset aktif (tidak dihapuskan)
  2. Kurangi kandidat yang memiliki slot beririsan [T1,T2)
     dengan status IN ('Tentative','Confirmed','Active')
  3. Kembalikan jumlah tersedia per kategori + daftar unit
OUTPUT : jumlah tersedia, daftar unit, dan tanggal bebas terdekat bila 0
```

**Persyaratan performa & indeks**

| Kode | Requirement |
|---|---|
| AV-01 | Indeks GiST atas `(resource_type, resource_id, slot_range)` wajib ada |
| AV-02 | Indeks komposit atas `assets(category_id, status, kondisi, dapat_dipinjam, boleh_dipinjam_siswa)` |
| AV-03 | Kueri ketersediaan katalog untuk 5.000 aset dan rentang ≤ 30 hari selesai ≤ 2 detik (NFR-P-05) |
| AV-04 | Hasil ketersediaan **tidak boleh** di-*cache* lebih dari 30 detik; kartu dashboard boleh memakai TTL 5 menit karena bersifat agregat, bukan transaksional |
| AV-05 | Horizon pemesanan dibatasi 90 hari ke depan secara bawaan (BR-023c), dapat dikonfigurasi |

## 26.5 Idempotensi Operasi Transaksional

| Kode | Requirement |
|---|---|
| ID-01 | Endpoint `POST /reservations`, `/loans/checkout`, `/loans/{id}/checkin`, `/approvals/{id}/decide`, dan `/audit-sessions/{id}/scan` wajib menerima header `Idempotency-Key` (UUIDv4) |
| ID-02 | Kunci disimpan pada tabel `idempotency_keys` bersama *hash* body permintaan, kode status, dan body respons, dengan TTL **24 jam** |
| ID-03 | Permintaan ulang dengan kunci sama **dan** body identik mengembalikan respons tersimpan (`200`/`201`) tanpa efek samping baru |
| ID-04 | Permintaan ulang dengan kunci sama **namun** body berbeda ditolak `409 IDEMPOTENCY_KEY_REUSED` |
| ID-05 | Kunci yang belum selesai diproses (in-flight) mengembalikan `409 REQUEST_IN_PROGRESS` |

## 26.6 Penomoran Dokumen Aman Konkurensi

Berlaku untuk `RSV-RG-…`, `RSV-BR-…`, `PJM-…`, `KRS-…`, `WO-…`, `PGD-…`, `OPN-…`, `HPS-…`.

| Kode | Requirement |
|---|---|
| SEQ-01 | Format nomor: `{PREFIX}-{TAHUN}-{URUT:4}` dengan urutan direset setiap tahun anggaran, contoh `RSV-RG-2026-0001` |
| SEQ-02 | Nomor **wajib** dihasilkan dari sequence basis data per (prefix, tahun), bukan dari `MAX(nomor)+1` |
| SEQ-03 | Nomor bersifat *gap-tolerant*: kegagalan transaksi boleh menyisakan lompatan nomor; nomor tidak pernah digunakan ulang |
| SEQ-04 | Regex validasi: `^(RSV-RG\|RSV-BR\|PJM\|KRS\|WO\|PGD\|OPN\|HPS)-\d{4}-\d{4,}$` |

## 26.7 Eksekusi Pekerjaan Terjadwal pada Lingkungan Multi-Instance

NFR-SC-01 mewajibkan API *stateless* multi-instance, sementara Bab 12.4 mendefinisikan 8 pekerjaan harian. Tanpa pengaman, setiap instance akan menjalankan pekerjaan yang sama.

| Kode | Requirement |
|---|---|
| JOB-01 | Seluruh pekerjaan terjadwal berjalan pada **worker terpisah** dari proses API, memakai antrean terpusat (Redis + BullMQ atau setara) |
| JOB-02 | Setiap pekerjaan memperoleh *distributed lock* bernama (`SET NX PX`) sebelum eksekusi; instance yang gagal memperoleh lock berhenti tanpa galat |
| JOB-03 | Setiap pekerjaan bersifat idempoten dan aman dijalankan ulang atas periode yang sama (mis. penerbitan denda memeriksa keberadaan denda untuk `loan_item` dan tanggal yang sama) |
| JOB-04 | Cron dijadwalkan dalam **UTC**; jam yang tertulis di Bab 12.4 adalah WIB dan harus dikonversi (contoh: 00:05 WIB = 17:05 UTC hari sebelumnya) |
| JOB-05 | Setiap eksekusi mencatat: nama pekerjaan, waktu mulai/selesai, jumlah record diproses, jumlah galat — sebagai entri activity log dengan pelaku `SYSTEM` (AL-06) |
| JOB-06 | Kegagalan pekerjaan memicu percobaan ulang dengan *exponential backoff* (maksimum 3 kali) lalu alarm ke pemantauan (Bab 27.6) |

**Pekerjaan tambahan yang diwajibkan bab ini** (melengkapi Bab 12.4):

| Waktu (WIB) | Pekerjaan | Fungsi |
|---|---|---|
| Setiap 5 menit | `slot-activation` | Menetapkan `assets.status = Direservasi` saat slot `Confirmed` mulai berlaku, dan mengembalikannya ke `Tersedia` saat slot berakhir tanpa serah terima |
| Setiap 15 menit | `tentative-slot-expiry` | Membebaskan slot `Tentative` yang melewati `expires_at` (BR-023b) |
| Setiap 30 menit | `approval-sla-check` | Mengirim pengingat SLA dan menjalankan eskalasi (FR-10.2 A2) |

---
