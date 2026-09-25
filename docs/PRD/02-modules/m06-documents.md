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
| POST | `/files/confirm` | Bearer | Daftarkan berkas terunggah & antrekan pemindaian AV |
| POST | `/assets/{id}/documents` | `asset_document.manage` | Tautkan dokumen aset dari berkas terdaftar |
| GET | `/assets/{id}/documents/{docId}/download` | `asset_document.view` | URL unduhan bertanda tangan |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **asset_documents** | Dokumen pendukung aset | id, asset_id, jenis, nama_berkas, path, ukuran, mime, garansi_mulai, garansi_selesai, diunggah_oleh | ± 2.000 |
| **stored_files** | Registri berkas terpusat & status pemindaian AV | id, object_key, mime, ukuran, checksum, scan_status (`PENDING`/`CLEAN`/`INFECTED`/`FAILED`), scanned_at, owner_type, owner_id | ± 12.000 |

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
