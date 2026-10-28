# M-06 — Dokumen Aset

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-06 — Dokumen Aset** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-06.1 Unggah & Kelola Dokumen Aset

| Aspek | Uraian |
|---|---|
| **Description** | Penyimpanan terpusat dokumen pendukung aset: faktur pembelian, kartu garansi, sertifikat, manual penggunaan, foto, dan berita acara. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Aset terdaftar; pengguna memiliki permission `asset_document.manage` |

**Main Flow**
1. Pengguna membuka detail aset dan memilih tab Dokumen.
2. Pengguna menekan "Unggah Dokumen", memilih jenis (Faktur, Garansi, Sertifikat, Manual, Berita Acara, Lainnya), mengunggah berkas, dan mengisi keterangan.
3. Untuk dokumen garansi, pengguna mengisi tanggal mulai dan berakhir garansi.
4. Sistem memvalidasi jenis berkas (PDF, JPG, PNG, DOCX, XLSX) dan ukuran (maks. 10 MB per berkas).
5. Sistem menyimpan berkas pada penyimpanan objek dan mencatat metadatanya.

**Alternative Flow**
- **A1 — Berkas melebihi batas atau jenis tidak didukung:** Sistem menolak dengan pesan spesifik.
- **A2 — Dokumen dihapus:** Hanya Administrator dan Petugas Sarpras yang dapat menghapus; sistem meminta konfirmasi dan mencatat penghapusan di activity log.
- **A3 — Satu dokumen berlaku untuk banyak unit** (mis. satu faktur untuk 20 kursi): Pengguna mengunggah sekali lalu menautkannya ke beberapa aset.

**Post Conditions** — Dokumen tersimpan dan dapat diunduh pengguna berwenang; masa garansi terpantau sistem.

**Acceptance Criteria**
- [ ] Berkas tidak dapat diakses melalui URL tebakan; unduhan memakai URL bertanda tangan berbatas waktu 15 menit.
- [ ] Role Siswa/OSIS tidak dapat mengakses dokumen aset.
- [ ] Sistem mengirim notifikasi kepada Petugas Sarpras 30 hari sebelum garansi berakhir.
- [ ] Setiap unduhan dokumen tercatat di activity log.

## 6. Business Rules

### Dimiliki modul ini

_Tidak ada aturan bisnis yang dimiliki modul ini._

**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk melalui ID — tidak disalin ke sini):

`BR-073` (m02)

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| POST | `/files/presign` | Bearer | Minta URL unggah bertanda tangan ke object storage |
| POST | `/files/{id}/presign` | Bearer | URL unggah baru (300 detik) bagi pesanan milik pemanggil yang belum dikonfirmasi; object key, MIME dan ukuran tetap, tanpa baris baru. 200 respons presign; 404 berkas asing/tidak ada, 422 sudah dikonfirmasi |
| POST | `/files/confirm` | Bearer | Daftarkan berkas terunggah & antrekan pemindaian AV |
| GET | `/asset-documents` | `asset_document.view` | Daftar lintas aset terpagina untuk P-26; satu baris per tautan dokumen-aset aktif |
| GET | `/assets/{id}/documents` | `asset_document.view` | Daftar dokumen aset beserta status pemindaian (tab Dokumen, langkah 1) |
| POST | `/assets/{id}/documents` | `asset_document.manage` | Tautkan dokumen aset dari berkas terdaftar; `asset_ids_tambahan` untuk A3 |
| DELETE | `/assets/{id}/documents/{docId}` | `asset_document.manage` | Hapus dokumen dari aset (A2): melepas tautan aset ini; tautan terakhir → dokumen dihapus, berkas dipertahankan |
| GET | `/assets/{id}/documents/{docId}/download` | `asset_document.view` | URL unduhan bertanda tangan |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

**Kontrak P-26 (PR-03-29, disetujui pengguna 11 Oktober 2026).** `GET /asset-documents` menerima `q` (nama berkas/kode/nama aset), `filter[jenis]`, `filter[kategori_id]`, `filter[garansi]` (`AKTIF`, `BERAKHIR_30_HARI`, `BERAKHIR`), `sort` (`-diunggah_pada` bawaan atau `garansi_selesai`), `page` dan `per_page` (25/50/100). Filter digabung AND; pencarian literal, parameterized. Garansi memakai tanggal WIB: aktif mencakup hari ini, akan berakhir mencakup hari ini sampai 30 hari ke depan dan sudah dimulai, berakhir sebelum hari ini. Respons membawa metadata dokumen per-aset yang sama dengan endpoint lama ditambah `aset: {id,kode_barang,nama}`, dan meta paginasi standar. Dokumen multi-aset muncul sekali untuk tiap tautan yang dapat dilihat; tidak ada object key atau URL penyimpanan di respons daftar.

Scope `asset_document.view/manage` diterapkan sebelum daftar/unduh/lepas: `all` seluruh dokumen, `own` dokumen yang diunggah sendiri, `assigned` tautan pada aset dengan `penanggung_jawab_id` pemanggil, `restricted` tidak mendapat dokumen. Siswa/OSIS tidak mendapat dokumen (`BR-073`). Hitungan tautan hanya mencakup aset dalam scope tersebut; tautan tidak aktif/dokumen dihapus dikecualikan. Penautan aset tambahan dengan scope `assigned` hanya menerima aset yang ditugaskan; scope `restricted` ditolak. Aset dihapuskan tetap boleh mempunyai dokumen (BR-008).

Foto hasil WO memakai jenis WORK_ORDER_PHOTO dan jalur presign/confirm/scan yang sama.
Penautan ke WO milik Teknisi dilakukan oleh API M-12 (FR-12.3, BR-049); pending boleh tertaut,
URL hanya CLEAN terkonfirmasi. Berkas tidak dapat dipakai ulang di WO lain. Antrean luring
hanya menyimpan metadata berkas per akun; transaksi WO tetap daring (SDD-MOB-07).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **asset_documents** | Dokumen pendukung aset — satu berkas terdaftar, berlaku untuk satu atau banyak aset (FR-06.1 A3) | id, file_id (→ stored_files: nama objek, ukuran, mime, status pindai), jenis, nama_berkas, keterangan, garansi_mulai, garansi_selesai, dihapus, dihapus_pada, dihapus_oleh, created_by (pengunggah) | ± 2.000 |
| **asset_document_links** | Tautan dokumen ↔ aset (FR-06.1 A3); dilepas, tidak dihapus | id, document_id, asset_id, aktif, dilepas_pada, dilepas_oleh | ± 4.000 |
| **stored_files** | Registri berkas terpusat & status pemindaian AV | id, object_key, mime, ukuran, checksum, scan_status (`PENDING`/`CLEAN`/`INFECTED`/`FAILED`), scanned_at, owner_type, owner_id, thumb_key, medium_key (turunan gambar) | ± 12.000 |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

_Modul ini tidak menerbitkan notifikasi._

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `asset_document.view` | Dokumen | Melihat & mengunduh dokumen aset | Admin, Petugas, Pimpinan, Teknisi, Guru, Staf |
| `asset_document.manage` | Dokumen | Unggah & hapus dokumen aset | Admin, Petugas |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `FILE_UPLOADED` | Berkas terunggah dikonfirmasi (`POST /files/confirm`): jenis, MIME, ukuran, `file_id` — tanpa nama asli berkas (`SDD-FS-06`) |
| `FILE_GENERATED` | PDF mutasi keluaran worker terpercaya didaftarkan CLEAN; file_id, owner_id, MIME, ukuran dan checksum, atomik dengan status SIAP M-04 (`SDD-09 §4.6`) |
| `FILE_SCANNED` | Putusan akhir pemindaian anti-malware oleh worker (pelaku SYSTEM): `file_id`, hasil (`CLEAN`/`INFECTED`/`FAILED`), alasan (nama tanda tangan, ketidakcocokan MIME, atau kegagalan pemindaian) |
| `DOCUMENT_UPLOADED` / `DOCUMENT_DOWNLOADED` / `DOCUMENT_DELETED` | Termasuk pencatatan siapa mengunduh |

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

### Integrasi pengadaan (14 Oktober 2026)

Registri berkas menerima `PROCUREMENT_ATTACHMENT` dengan `procurement.create`, serta
`PROCUREMENT_RECEIPT_DOCUMENT` dan `PROCUREMENT_REJECTION_PHOTO` dengan
`procurement.receive`. Lampiran/dokumen menerima PDF, JPEG/PNG, DOCX/XLSX maksimal
10 MB; foto penolakan hanya JPEG/PNG maksimal 2 MB. Penautan memeriksa uploader,
jenis, konfirmasi checksum, pemilik entitas, dan scan; URL unduh hanya untuk `CLEAN`.
Penerimaan memerlukan dokumen/foto `CLEAN`. Satu dokumen penerimaan dapat ditautkan
ke seluruh unit aset dalam satu transaksi sesuai `BR-065`, dengan pemilik registri
tetap penerimaan asal. Jenis ini tidak digunakan untuk antrean transaksi bisnis mobile.

### Integrasi opname aset (14 Oktober 2026)

M-13 menautkan pesanan STOCKTAKE_PHOTO milik pelaksana sebelum unggah/confirm; foto
belum siap menghalangi submit dan URL hanya diberikan setelah CLEAN. STOCKTAKE_REPORT
adalah PDF hasil worker SYSTEM, terdaftar CLEAN setelah checksum/format tervalidasi;
presign publik tidak menerima jenis tersebut. Worker memakai kunci objek per percobaan
agar kompensasi kegagalan tidak menghapus PDF percobaan lain yang berhasil.

### Integrasi penghapusan aset — PR-05-10..14 (14 Oktober 2026)

`DISPOSAL_ATTACHMENT`: disposal.create, PDF/JPEG/PNG/DOCX/XLSX maksimal 10 MB.
`DISPOSAL_EXECUTION_PHOTO`: disposal.execute, JPEG/PNG maksimal 2 MB.
`DISPOSAL_REPORT`: PDF hasil worker SYSTEM; presign publik menolak jenis ini.
Penautan memeriksa uploader, jenis, checksum, pemilik usulan, dan scan. Eksekusi
dan bukti kehilangan mensyaratkan CLEAN; URL privat hanya tersedia saat CLEAN.
Fakta kelayakan garansi dibaca server melalui entry point M-06 tanpa URL dokumen;
nama berkas disamarkan tanpa asset_document.view. Pembatasan baca dokumen tidak
menghilangkan kewajiban konfirmasi garansi pada pengajuan penghapusan.
