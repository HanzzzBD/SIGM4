# M-03 — Manajemen Lokasi

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-03 — Manajemen Lokasi** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-03.1 CRUD Hierarki Lokasi

| Aspek | Uraian |
|---|---|
| **Description** | Pengelolaan struktur lokasi tiga tingkat: Gedung → Lantai/Area → Ruangan. Setiap aset ditempatkan pada satu ruangan/area. |
| **Actor** | Administrator, Petugas Sarana Prasarana |
| **Preconditions** | Pengguna memiliki permission `location.manage` |

**Main Flow**
1. Pengguna membuka menu Manajemen Lokasi dan melihat pohon lokasi.
2. Pengguna menambah Gedung (nama, kode, keterangan).
3. Pengguna menambah Lantai/Area di bawah Gedung.
4. Pengguna menambah Ruangan dengan atribut: nama, kode, jenis ruangan (Kelas, Laboratorium, Aula, Kantor, Gudang, Lainnya), kapasitas orang, penanggung jawab, status, dan penanda `dapat_direservasi`.
5. Sistem menyimpan dan memperbarui pohon lokasi.

**Alternative Flow**
- **A1 — Kode lokasi duplikat:** Sistem menolak.
- **A2 — Menonaktifkan ruangan yang masih memiliki reservasi mendatang:** Sistem menampilkan daftar reservasi terdampak dan meminta konfirmasi; reservasi yang sudah disetujui tetap berlaku, reservasi baru diblokir.
- **A3 — Menghapus lokasi yang masih memuat aset:** Sistem menolak dan meminta pemindahan aset terlebih dahulu.

**Post Conditions** — Struktur lokasi terbarui dan tersedia sebagai referensi pada modul aset, reservasi, dan opname.

**Acceptance Criteria**
- [ ] Struktur lokasi ditampilkan sebagai pohon yang dapat diperluas/diciutkan.
- [ ] Ruangan dengan `dapat_direservasi = false` tidak muncul di modul Reservasi Ruangan.
- [ ] Setiap lokasi menampilkan jumlah aset di dalamnya.
- [ ] Lokasi yang pernah memiliki transaksi hanya dapat dinonaktifkan, tidak dihapus permanen.

### FR-03.2 Pencarian Aset Berdasarkan Lokasi

| Aspek | Uraian |
|---|---|
| **Description** | Menampilkan seluruh aset pada suatu lokasi beserta ringkasan kondisinya untuk keperluan audit dan pencarian barang. |
| **Actor** | Petugas Sarpras, Administrator, Pimpinan Sekolah, Teknisi, Guru/Staf (read-only) |
| **Preconditions** | Data lokasi dan aset tersedia |

**Main Flow**
1. Pengguna memilih lokasi pada pohon lokasi atau memindai QR ruangan.
2. Sistem menampilkan daftar aset di lokasi tersebut (kode barang, nama, kondisi, status).
3. Sistem menampilkan ringkasan: total unit, jumlah per kondisi, jumlah dipinjam, jumlah dalam perbaikan.
4. Pengguna dapat memfilter berdasarkan kategori, kondisi, dan status.

**Alternative Flow**
- **A1 — Lokasi kosong:** Sistem menampilkan status kosong beserta tombol "Tambah Aset ke Lokasi Ini".
- **A2 — Ekspor daftar:** Pengguna dengan permission `report.export` mengekspor ke XLSX/PDF sebagai berita acara lokasi.

**Post Conditions** — Tidak ada perubahan data (operasi baca).

**Acceptance Criteria**
- [ ] Daftar aset per lokasi tampil ≤ 2 detik untuk lokasi dengan hingga 500 unit.
- [ ] Filter dan pencarian dapat dikombinasikan.
- [ ] Hasil ekspor memuat identitas lokasi, tanggal cetak, dan pencetak.

## 6. Business Rules

### Dimiliki modul ini

| Kode | Business Rule |
|---|---|
| BR-013 | Struktur lokasi bersifat hierarkis: Gedung → Lantai/Area → Ruangan. |
| BR-014 | Kode lokasi bersifat unik pada setiap tingkat hierarki. |
| BR-015 | Lokasi yang masih memuat aset tidak dapat dihapus maupun dinonaktifkan sebelum seluruh asetnya dipindahkan. |
| BR-016 | Hanya ruangan dengan penanda `dapat_direservasi = true` yang muncul pada modul Reservasi Ruangan. |

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/locations/tree` | `location.view` | Pohon lokasi lengkap |
| POST | `/buildings` · `/areas` · `/rooms` | `location.manage` | Buat entitas lokasi |
| PUT | `/rooms/{id}` | `location.manage` | Perbarui ruangan |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **buildings** | Gedung sekolah | id, nama, kode, keterangan, status | Petugas Sarpras |
| **areas** | Lantai/area dalam gedung | id, building_id, nama, kode, lantai | Petugas Sarpras |
| **rooms** | Ruangan | id, area_id, nama, kode, jenis, kapasitas, penanggung_jawab_id, dapat_direservasi, boleh_direservasi_siswa, status | Petugas Sarpras |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

_Modul ini tidak menerbitkan notifikasi._

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `location.view` | Lokasi | Melihat pohon lokasi | Semua kecuali Siswa |
| `location.manage` | Lokasi | CRUD gedung/area/ruangan | Admin, Petugas |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `LOCATION_CREATED` / `LOCATION_UPDATED` / `LOCATION_DEACTIVATED` | Perubahan struktur lokasi |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

_Tidak bergantung pada modul lain._

## 14. Related Modules

_Tidak ada._

## 15. Open Issues

_Tidak ada isu terbuka._
