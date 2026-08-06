# M-05 — QR Code Barang

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-05 — QR Code Barang** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-05.1 Generate & Cetak QR Code

| Aspek | Uraian |
|---|---|
| **Description** | Sistem menghasilkan QR Code unik per unit aset dan menyediakan pencetakan label satuan maupun massal. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Aset sudah terdaftar |

**Main Flow**
1. QR Code dihasilkan otomatis saat aset dibuat, memuat URL **permanen** menuju halaman publik aset: `https://{domain}/a/{asset_uuid}`. **Klarifikasi audit:** URL ini **tidak** bertanda tangan berbatas waktu — label QR dicetak permanen sehingga tanda tangan kedaluwarsa akan membuat label mati. Keamanannya bertumpu pada dua hal: UUIDv4 yang tidak dapat ditebak, dan halaman publik yang hanya memuat atribut non-sensitif (FR-05.2 A3). URL bertanda tangan berbatas waktu tetap dipakai untuk **unduhan dokumen dan foto** (FR-06.1), bukan untuk QR.
2. Pengguna memilih satu atau banyak aset lalu menekan "Cetak Label QR".
3. Pengguna memilih ukuran label, tata letak lembar (mis. 3×8 per A4), dan elemen yang ditampilkan (kode barang, nama, nama sekolah).
4. Sistem menghasilkan berkas PDF siap cetak.
5. Petugas mencetak, menempel label, lalu menandai aset `qr_terpasang = true`.

**Alternative Flow**
- **A1 — QR rusak/hilang:** Pengguna menekan "Cetak Ulang"; UUID aset tidak berubah sehingga QR lama tetap valid bila ditemukan kembali.
- **A2 — Regenerasi UUID:** Hanya Administrator yang dapat meregenerasi UUID; QR lama otomatis tidak berlaku dan tindakan dicatat di activity log.

**Post Conditions** — Label QR tercetak; status pelabelan aset terbarui.

**Acceptance Criteria**
- [ ] Setiap unit aset memiliki QR unik yang tidak pernah dipakai ulang oleh aset lain.
- [ ] Cetak massal hingga 200 label menghasilkan PDF ≤ 30 detik.
- [ ] QR tetap terbaca pada ukuran cetak minimum 2×2 cm dengan tingkat koreksi galat M.
- [ ] Laporan "Aset belum berlabel QR" tersedia bagi Petugas Sarpras.

### FR-05.2 Pemindaian QR Code

| Aspek | Uraian |
|---|---|
| **Description** | Pemindaian QR untuk membuka profil aset secara instan sekaligus menjadi titik masuk aksi kontekstual (serah terima, pengembalian, opname, lapor kerusakan). |
| **Actor** | Seluruh role (aksi lanjutan menyesuaikan permission) |
| **Preconditions** | Aset memiliki label QR; perangkat memiliki kamera dan koneksi internet |

**Main Flow**
1. Pengguna membuka fitur Scan pada aplikasi mobile atau web (kamera peramban).
2. Pengguna mengarahkan kamera ke QR Code aset.
3. Sistem membaca UUID, memanggil API detail aset, dan menampilkan profil aset.
4. Sistem menampilkan tombol aksi kontekstual sesuai role dan status aset:
   - Petugas Sarpras + aset `Direservasi` → "Proses Serah Terima"
   - Petugas Sarpras + aset `Dipinjam` → "Proses Pengembalian"
   - Petugas Sarpras dalam sesi opname aktif → "Catat Hasil Opname"
   - Guru/Staf/Siswa → "Lapor Kerusakan"
   - Teknisi dengan work order aktif → "Perbarui Work Order"

**Alternative Flow**
- **A1 — QR tidak dikenali/rusak:** Sistem menampilkan galat dan menyediakan input kode barang manual.
- **A2 — Aset sudah dinonaktifkan:** Sistem menampilkan profil dengan penanda "Aset tidak aktif" dan menyembunyikan aksi transaksional.
- **A3 — QR dipindai dengan aplikasi kamera bawaan:** Pengguna diarahkan ke halaman web publik aset yang hanya menampilkan informasi dasar (kode, nama, kategori, lokasi, kondisi, status) tanpa data finansial, disertai ajakan login untuk aksi lanjutan.
- **A4 — Izin kamera ditolak:** Sistem menampilkan panduan mengaktifkan izin dan menyediakan input manual.

**Post Conditions** — Profil aset ditampilkan; aksi lanjutan tersedia sesuai konteks.

**Acceptance Criteria**
- [ ] Waktu dari pemindaian hingga profil tampil ≤ 3 detik pada jaringan sekolah.
- [ ] Halaman publik hasil scan tidak pernah menampilkan nilai aset, biaya, maupun data pribadi peminjam.
- [ ] Input kode barang manual tersedia sebagai jalur cadangan di setiap alur pemindaian.
- [ ] Aksi kontekstual yang ditampilkan selalu sesuai permission pengguna dan status aset.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk melalui ID — tidak disalin ke sini):

`BR-001` (m04) · `BR-002` (m04)

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| GET | `/assets/by-uuid/{uuid}` | `asset.view` | Detail aset dari hasil scan QR |
| GET | `/public/assets/{uuid}` | Publik | Info dasar aset untuk scan kamera bawaan |
| POST | `/assets/qr/print` | `asset.update` | Hasilkan PDF label QR massal |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

_Tidak memiliki entitas sendiri._

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

_Modul ini tidak menerbitkan notifikasi._

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `asset.qr_print` | Aset | Mencetak label QR | Admin, Petugas |
| `asset.qr_regenerate` 🔒 | Aset | Meregenerasi UUID QR | Admin |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `ASSET_QR_REGENERATED` | Regenerasi UUID QR |
| `ASSET_QR_PRINTED` | Pencetakan label beserta jumlah |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset

## 14. Related Modules

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset

## 15. Open Issues

_Tidak ada isu terbuka._
