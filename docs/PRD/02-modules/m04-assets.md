# M-04 — Inventaris Aset

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-04 — Inventaris Aset** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-04.1 Pendaftaran Aset Baru (Per Unit)

| Aspek | Uraian |
|---|---|
| **Description** | Mencatat aset baru. Setiap unit fisik menghasilkan satu record dengan kode aset unik dan QR Code sendiri. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Kategori aset dan lokasi tersedia; format kode aset sudah dikonfigurasi (FR-20.1) |

**Main Flow**
1. Pengguna membuka menu Inventaris dan menekan "Tambah Aset".
2. Pengguna mengisi: nama aset, kategori, merek, model/tipe, nomor seri, tahun perolehan, sumber perolehan (Pembelian/Hibah/Bantuan), nilai perolehan, lokasi penempatan, kondisi awal, penanggung jawab, penanda `dapat_dipinjam` dan `boleh_dipinjam_siswa`.
3. Pengguna menentukan jumlah unit yang akan dibuat (mis. 20 unit kursi identik).
4. Sistem membuat N record aset terpisah, masing-masing dengan kode aset unik berurutan dan QR Code unik.
5. Sistem menetapkan status awal `Tersedia` dan kondisi sesuai input.
6. Sistem menampilkan daftar aset yang dibuat beserta tombol "Cetak QR".

**Alternative Flow**
- **A1 — Nomor seri duplikat:** Sistem menolak; nomor seri wajib unik bila diisi.
- **A2 — Impor massal:** Pengguna mengunggah CSV/XLSX sesuai template; sistem memvalidasi tiap baris dan menampilkan laporan hasil.
- **A3 — Aset dari penerimaan pengadaan:** Data terisi otomatis dari dokumen penerimaan (FR-14.3); pengguna melengkapi nomor seri dan lokasi.
- **A4 — Kategori belum ada:** Pengguna berwenang dapat membuat kategori baru langsung dari form.

**Post Conditions** — N record aset tersimpan berstatus `Tersedia`; kode aset dan QR terbentuk; activity log tercatat.

**Acceptance Criteria**
- [ ] Membuat 20 unit sekaligus menghasilkan 20 record dengan 20 kode aset dan 20 QR berbeda.
- [ ] Kode aset mengikuti format yang dikonfigurasi Administrator dan unik sistem-wide.
- [ ] Impor 500 baris selesai ≤ 60 detik dengan laporan galat per baris.
- [ ] Aset dengan `dapat_dipinjam = false` tidak muncul pada modul Reservasi Aset.
- [ ] Aset dengan `boleh_dipinjam_siswa = false` tidak terlihat pada katalog role Siswa/OSIS.

### FR-04.2 Melihat & Mencari Aset

| Aspek | Uraian |
|---|---|
| **Description** | Katalog aset dengan pencarian, filter, dan halaman detail lengkap. |
| **Actor** | Seluruh role (cakupan data menyesuaikan permission) |
| **Preconditions** | Terdapat data aset |

**Main Flow**
1. Pengguna membuka menu Inventaris.
2. Sistem menampilkan tabel aset terpaginasi (kode aset, nama, kategori, lokasi, kondisi, status).
3. Pengguna mencari berdasarkan kode aset, nama, merek, atau nomor seri.
4. Pengguna memfilter berdasarkan kategori, lokasi, kondisi, status, tahun perolehan, dan kelayakan pinjam.
5. Pengguna membuka detail aset: identitas lengkap, foto, QR Code, riwayat peminjaman, riwayat pemeliharaan, riwayat mutasi lokasi, laporan kerusakan terkait, dan dokumen aset.

**Alternative Flow**
- **A1 — Role Siswa/OSIS:** Sistem menyembunyikan nilai perolehan, sumber perolehan, biaya pemeliharaan, dan dokumen aset; hanya menampilkan aset dengan `boleh_dipinjam_siswa = true` atau aset publik.
- **A2 — Tidak ada hasil:** Sistem menampilkan status kosong dan saran penyesuaian filter.
- **A3 — Ekspor:** Pengguna dengan permission `asset.export` mengekspor hasil filter ke XLSX/PDF.

**Post Conditions** — Tidak ada perubahan data.

**Acceptance Criteria**
- [ ] Pencarian pada 5.000 aset mengembalikan hasil ≤ 2 detik.
- [ ] Filter dapat dikombinasikan dan tercermin pada URL agar dapat dibagikan (web).
- [ ] Data finansial tidak pernah dikirim ke klien role Siswa/OSIS (diperiksa di sisi server).

### FR-04.3 Perubahan Data & Kondisi Aset

| Aspek | Uraian |
|---|---|
| **Description** | Memperbarui atribut aset termasuk kondisi fisik, dengan pencatatan riwayat perubahan. |
| **Actor** | Petugas Sarana Prasarana, Administrator; Teknisi (khusus kondisi pasca-perbaikan) |
| **Preconditions** | Aset terdaftar; pengguna memiliki permission `asset.update` |

**Main Flow**
1. Pengguna membuka detail aset dan menekan "Ubah".
2. Pengguna memperbarui atribut yang diperlukan.
3. Bila kondisi diubah, sistem mewajibkan pengisian alasan perubahan.
4. Sistem menyimpan perubahan dan mencatat riwayat kondisi (nilai lama → baru, pelaku, waktu, alasan).

**Alternative Flow**
- **A1 — Kondisi menjadi `Rusak Berat`:** Sistem mengubah status aset menjadi `Tidak Tersedia`, membatalkan reservasi mendatang atas aset tersebut, dan menotifikasi pemohon terkait.
- **A2 — Kondisi menjadi `Hilang`:** Sistem mewajibkan referensi ke sesi stock opname atau berita acara, mengubah status menjadi `Tidak Tersedia`, dan menotifikasi Pimpinan Sekolah.
- **A3 — Aset sedang dipinjam:** Perubahan lokasi diblokir hingga aset dikembalikan.

**Post Conditions** — Data aset dan riwayat kondisi terbarui; status turunan tersesuaikan.

**Acceptance Criteria**
- [ ] Perubahan kondisi selalu menyimpan alasan dan tidak dapat dikosongkan.
- [ ] Aset berkondisi `Rusak Berat` atau `Hilang` otomatis tidak dapat direservasi/dipinjam.
- [ ] Riwayat perubahan kondisi ditampilkan kronologis pada halaman detail aset.

### FR-04.4 Mutasi Lokasi Aset

| Aspek | Uraian |
|---|---|
| **Description** | Memindahkan aset antar lokasi secara permanen, disertai berita acara digital. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Aset berstatus `Tersedia` atau `Dalam Perbaikan`; lokasi tujuan aktif |

**Main Flow**
1. Pengguna memilih satu atau beberapa aset lalu menekan "Mutasi Lokasi".
2. Pengguna memilih lokasi tujuan, tanggal mutasi, alasan, dan penanggung jawab baru.
3. Sistem memvalidasi status aset dan kapasitas lokasi tujuan bila diatur.
4. Sistem memperbarui lokasi aset dan membuat record riwayat mutasi.
5. Sistem menyediakan berita acara mutasi yang dapat dicetak.

**Alternative Flow**
- **A1 — Aset sedang dipinjam/direservasi pada tanggal mutasi:** Sistem menolak dan menampilkan transaksi yang menghalangi.
- **A2 — Mutasi massal via scan QR:** Petugas memindai beberapa QR berurutan di aplikasi mobile lalu menetapkan satu lokasi tujuan.

**Post Conditions** — Lokasi aset terbarui; riwayat mutasi tersimpan permanen.

**Acceptance Criteria**
- [ ] Riwayat mutasi menampilkan lokasi asal, tujuan, tanggal, pelaku, dan alasan.
- [ ] Mutasi massal hingga 50 aset dalam satu operasi berhasil secara atomik.
- [ ] Berita acara mutasi dapat diunduh sebagai PDF.

### FR-04.5 Manajemen Kategori Aset

| Aspek | Uraian |
|---|---|
| **Description** | Mengelola kategori dan subkategori aset sebagai dasar pengelompokan, penomoran kode, dan pelaporan. |
| **Actor** | Administrator, Petugas Sarana Prasarana |
| **Preconditions** | Pengguna memiliki permission `category.manage` |

**Main Flow**
1. Pengguna membuka menu Kategori Aset.
2. Pengguna menambah kategori (nama, kode, kategori induk, umur teknis dalam tahun, interval pemeliharaan preventif dalam hari).
3. Sistem menyimpan dan menjadikannya pilihan pada form aset.

**Alternative Flow**
- **A1 — Kode kategori duplikat:** Sistem menolak.
- **A2 — Menghapus kategori yang masih dipakai aset:** Sistem menolak dan menampilkan jumlah aset terkait.

**Post Conditions** — Daftar kategori terbarui; interval preventif menjadi dasar penjadwalan maintenance (FR-12.2).

**Acceptance Criteria**
- [ ] Mendukung minimal dua tingkat kategori (induk dan anak).
- [ ] Interval preventif kategori otomatis diusulkan saat membuat jadwal pemeliharaan.

## 6. Business Rules

### Dimiliki modul ini

| Kode | Business Rule |
|---|---|
| BR-001 | Setiap unit fisik aset dicatat sebagai satu record tersendiri dengan kode aset dan QR Code unik (pencatatan *serialized*). |
| BR-002 | Kode aset bersifat unik sistem-wide, dihasilkan otomatis mengikuti format yang dikonfigurasi Administrator, dan tidak dapat diubah manual setelah terbentuk. |
| BR-003 | Nomor seri, bila diisi, wajib unik di seluruh sistem. |
| BR-004 | Kondisi aset hanya bernilai: `Baik`, `Rusak Ringan`, `Rusak Berat`, `Hilang`. |
| BR-005 | Status aset (`assets.status`) menyatakan **kondisi operasional aset pada saat ini (*now*)** dan hanya bernilai: `Tersedia`, `Direservasi`, `Dipinjam`, `Dalam Perbaikan`, `Tidak Tersedia`. Status ini **bukan** sumber kebenaran ketersediaan masa depan. |
| BR-005a | Ketersediaan aset dan ruangan pada rentang waktu tertentu **wajib** dihitung dari tabel interval pemesanan (`booking_slots`), bukan dari `assets.status`. Lihat Bab 26. |
| BR-005b | `assets.status = Direservasi` hanya ditetapkan bila terdapat slot pemesanan aktif yang **mencakup waktu saat ini**; penetapannya dilakukan oleh proses terjadwal dan oleh transisi transaksional, bukan pada saat pengajuan dibuat. |
| BR-006 | Aset berkondisi `Rusak Berat` atau `Hilang` tidak dapat direservasi maupun dipinjam. |
| BR-007 | Setiap perubahan kondisi aset wajib menyertakan alasan dan tersimpan pada riwayat kondisi. |
| BR-008 | Aset tidak dapat dihapus permanen; hanya dapat dinonaktifkan/dihapuskan dengan pencatatan alasan dan tetap dapat ditelusuri. |
| BR-009 | Setiap aset wajib memiliki tepat satu lokasi penempatan aktif. |
| BR-010 | Aset yang sedang berstatus `Dipinjam` tidak dapat dimutasi lokasinya. |
| BR-011 | Aset yang berasal dari pengadaan wajib menyimpan referensi ke nomor usulan pengadaan asalnya. |
| BR-012 | Penetapan kondisi `Hilang` hanya sah bila merujuk pada sesi stock opname yang disetujui atau berita acara kehilangan. |

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/rooms/{id}/assets` | `asset.view` | Aset dalam satu ruangan |
| GET | `/assets` | `asset.view` | Daftar aset (filter & pencarian) |
| POST | `/assets` | `asset.create` | Buat aset (mendukung `jumlah_unit` untuk N record) |
| GET | `/assets/{id}` | `asset.view` | Detail aset |
| PUT | `/assets/{id}` | `asset.update` | Perbarui aset |
| PATCH | `/assets/{id}/condition` | `asset.update` | Ubah kondisi + alasan |
| POST | `/assets/move` | `asset.update` | Mutasi lokasi (massal) |
| POST | `/assets/import` | `asset.create` | Impor massal |
| GET | `/assets/export` | `asset.export` | Ekspor XLSX/PDF |
| GET | `/asset-categories` | `asset.view` | Daftar kategori |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **assets** | Unit aset (serialized) | id, uuid, kode_barang, nama, category_id, merek, model, nomor_seri, tahun_perolehan, sumber_perolehan, nilai_perolehan, room_id, kondisi, status, dapat_dipinjam, boleh_dipinjam_siswa, penanggung_jawab_id, qr_terpasang, procurement_id, dihapuskan, tanggal_penghapusan — *foto dipindahkan ke tabel `asset_photos` karena satu aset dapat memiliki banyak foto* | Petugas Sarpras |
| **asset_categories** | Kategori & subkategori aset | id, parent_id, nama, kode, umur_teknis_tahun, interval_preventif_hari | Petugas Sarpras |
| **asset_movements** | Riwayat mutasi lokasi | id, asset_id, room_asal_id, room_tujuan_id, tanggal, alasan, dilakukan_oleh | ± 1.000 |
| **asset_condition_history** | Riwayat perubahan kondisi | id, asset_id, kondisi_lama, kondisi_baru, alasan, referensi_jenis, referensi_id, diubah_oleh, diubah_pada | ± 1.500 |
| **asset_photos** | Foto aset (menggantikan field tunggal `assets.foto`) | id, asset_id, path, urutan, is_primary, diunggah_oleh | ± 6.000 |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

_Modul ini tidak menerbitkan notifikasi._

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `category.manage` | Kategori | CRUD kategori aset | Admin, Petugas |
| `asset.view` | Aset | Melihat katalog & detail aset | Semua (scope berbeda) |
| `asset.view_financial` | Aset | Melihat nilai & sumber perolehan | Admin, Petugas, Pimpinan |
| `asset.create` | Aset | Membuat & mengimpor aset | Admin, Petugas |
| `asset.update` | Aset | Menyunting aset & mutasi lokasi | Admin, Petugas |
| `asset.update_condition` | Aset | Mengubah kondisi aset | Admin, Petugas, Teknisi(`assigned`) |
| `asset.deactivate` | Aset | Menonaktifkan aset (bukan penghapusan formal) | Admin, Petugas |
| `asset.export` | Aset | Mengekspor daftar aset | Admin, Petugas, Pimpinan |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `ASSET_CREATED` / `ASSET_UPDATED` / `ASSET_DEACTIVATED` | Termasuk pembuatan massal N unit |
| `ASSET_CONDITION_CHANGED` | Wajib menyertakan alasan |
| `ASSET_STATUS_CHANGED` | Perubahan status termasuk yang otomatis oleh sistem |
| `ASSET_MOVED` | Mutasi lokasi beserta asal dan tujuan |
| `ASSET_IMPORTED` | Impor massal |
| `CATEGORY_CREATED` / `CATEGORY_UPDATED` / `CATEGORY_DELETED` | Perubahan kategori |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m03-locations.md`](m03-locations.md) — M-03 Manajemen Lokasi
- [`m14-procurement.md`](m14-procurement.md) — M-14 Pengadaan Barang

## 14. Related Modules

- [`m03-locations.md`](m03-locations.md) — M-03 Manajemen Lokasi
- [`m14-procurement.md`](m14-procurement.md) — M-14 Pengadaan Barang

## 15. Open Issues

_Tidak ada isu terbuka._
