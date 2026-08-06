# M-16 — Statistik & Analitik

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-16 — Statistik & Analitik** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-16.1 Laporan Analitik

| Aspek | Uraian |
|---|---|
| **Description** | Sekumpulan laporan analitik untuk mendukung perencanaan dan evaluasi pengelolaan sarana prasarana. |
| **Actor** | Pimpinan Sekolah, Petugas Sarpras, Administrator |
| **Preconditions** | Terdapat data transaksional yang memadai |

**Main Flow**
1. Pengguna membuka menu Statistik & Analitik dan memilih jenis laporan:
   - **Kondisi Aset** — komposisi kondisi per kategori dan lokasi, tren kondisi antar-periode
   - **Pemanfaatan Fasilitas** — tingkat utilisasi ruangan dan barang, jam pemakaian, ruangan paling/paling jarang dipakai
   - **Biaya Pemeliharaan** — biaya per periode, per kategori, per aset; aset dengan biaya tertinggi
   - **Tren Kerusakan** — jumlah laporan per periode, kategori paling sering rusak, waktu rata-rata penyelesaian
   - **Aktivitas Peminjaman** — jumlah transaksi, tingkat keterlambatan, peminjam teraktif, barang terpopuler
   - **Kebutuhan Pengadaan** — rekomendasi berbasis aset rusak berat, aset melewati umur teknis, dan barang yang permintaannya sering tidak terpenuhi
   - **Rekapitulasi Aset** — daftar aset per kategori, lokasi, tahun perolehan, dan nilai perolehan
2. Pengguna menetapkan filter: rentang tanggal, lokasi, kategori, dan role pemohon.
3. Sistem menampilkan grafik dan tabel hasil.
4. Pengguna dapat mengekspor ke XLSX atau PDF.

**Alternative Flow**
- **A1 — Data pada rentang terpilih kosong:** Sistem menampilkan status kosong dan menyarankan rentang lain.
- **A2 — Laporan berat (rentang panjang):** Sistem memproses secara asinkron dan menotifikasi pengguna saat berkas siap diunduh.
- **A3 — Perbandingan antar-periode:** Pengguna mengaktifkan mode perbandingan untuk melihat selisih terhadap periode sebelumnya.

**Post Conditions** — Tidak ada perubahan data; berkas ekspor tercatat di activity log.

**Acceptance Criteria**
- [ ] Seluruh laporan dapat difilter minimal berdasarkan rentang tanggal, lokasi, dan kategori.
- [ ] Ekspor XLSX mempertahankan struktur tabel dan dapat diolah lebih lanjut.
- [ ] Ekspor PDF memuat kop laporan, filter yang dipakai, tanggal cetak, dan nama pencetak.
- [ ] Laporan pada volume data target dihasilkan ≤ 5 detik untuk rentang 1 tahun.
- [ ] Role Siswa/OSIS tidak memiliki akses ke modul ini.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk melalui ID — tidak disalin ke sini):

`BR-073` (m02) · `BR-074` (m02)

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/analytics/{jenis}` | `report.view` | Data laporan analitik |
| POST | `/analytics/{jenis}/export` | `report.export` | Ekspor (asinkron bila berat) |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

_Tidak memiliki entitas sendiri._

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |
|---|---|---|---|:---:|---|
| **NT-42** | Berkas ekspor asinkron siap diunduh | Pemohon ekspor | In-app + Push | ❌ | "Laporan {jenis} siap diunduh." |

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `report.view` | Analitik | Melihat laporan analitik | Admin, Petugas, Pimpinan |
| `report.export` | Analitik | Mengekspor laporan | Admin, Petugas, Pimpinan |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `REPORT_EXPORTED` | Ekspor laporan beserta jenis dan filter |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset
- [`m09-loans.md`](m09-loans.md) — M-09 Peminjaman & Pengembalian
- [`m12-maintenance.md`](m12-maintenance.md) — M-12 Maintenance Management

## 14. Related Modules

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset
- [`m09-loans.md`](m09-loans.md) — M-09 Peminjaman & Pengembalian
- [`m12-maintenance.md`](m12-maintenance.md) — M-12 Maintenance Management

## 15. Open Issues

_Tidak ada isu terbuka._
