# M-21 — Penghapusan Aset

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-21 — Penghapusan Aset** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

> **Catatan revisi:** modul ini sebelumnya tidak ada, padahal FR-10.1 mencantumkan "Penghapusan Aset" sebagai jenis pengajuan, BR-035 mewajibkannya melalui approval engine, dan Bab 12.2 memuat transisi "Dihapuskan dari inventaris". Modul ini menutup siklus hidup aset dan **berada dalam lingkup rilis ini**.

### FR-21.1 Pengajuan Penghapusan Aset

| Aspek | Uraian |
|---|---|
| **Description** | Mengajukan penghapusan (penonaktifan permanen) satu atau beberapa unit aset dari inventaris aktif karena rusak berat tidak dapat diperbaiki, hilang, atau habis umur teknisnya. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Aset berkondisi `Rusak Berat` atau `Hilang`, atau memiliki rekomendasi penggantian (FR-12.5 A1); pengguna memiliki permission `disposal.create` |

**Main Flow**
1. Pengguna membuka menu Penghapusan Aset dan menekan "Buat Usulan Penghapusan".
2. Pengguna memilih satu atau beberapa aset (dapat dari hasil filter kondisi `Rusak Berat`/`Hilang`).
3. Sistem menampilkan data pendukung otomatis per aset: nilai perolehan, tahun perolehan, umur teknis, total biaya pemeliharaan kumulatif, jumlah work order, dan referensi sesi opname bila kondisinya `Hilang`.
4. Pengguna mengisi: alasan penghapusan (Rusak Berat Tidak Dapat Diperbaiki / Hilang / Habis Umur Teknis / Lainnya), justifikasi, dan usulan tindak lanjut fisik (Dimusnahkan / Dijual / Dihibahkan / Disimpan sebagai Suku Cadang).
5. Pengguna melampirkan dokumen pendukung (foto kondisi, berita acara kehilangan, rekomendasi teknisi).
6. Sistem membuat usulan berstatus `Menunggu Persetujuan` dengan nomor unik `HPS-2026-0001` dan membentuk instance approval jenis "Penghapusan Aset" (FR-10.1).

**Alternative Flow**
- **A1 — Aset masih memiliki slot pemesanan aktif atau sedang dipinjam:** Sistem menolak dan menampilkan transaksi yang menghalangi.
- **A2 — Aset masih dalam masa garansi:** Sistem menampilkan peringatan dan meminta konfirmasi eksplisit disertai alasan.
- **A3 — Aset berkondisi `Hilang` tanpa referensi sesi opname atau berita acara:** Sistem menolak (BR-012).
- **A4 — Usulan berasal dari work order `Tidak Dapat Diperbaiki`:** Data terisi otomatis dari work order tersebut (FR-12.3 A2).

**Post Conditions** — Usulan tercatat; aset **belum** dihapuskan; slot pemesanan mendatang atas aset tersebut diblokir selama usulan berjalan.

**Acceptance Criteria**
- [ ] Nomor usulan unik dengan format `HPS-{TAHUN}-{URUT}` (SEQ-04).
- [ ] Satu usulan dapat memuat banyak aset; keputusan approval berlaku untuk seluruh aset dalam usulan.
- [ ] Data pendukung finansial dan riwayat pemeliharaan diisi sistem, bukan diketik manual.
- [ ] Aset yang sedang diusulkan untuk dihapus tidak dapat direservasi maupun dipinjam.

### FR-21.2 Persetujuan & Eksekusi Penghapusan

| Aspek | Uraian |
|---|---|
| **Description** | Pimpinan Sekolah menyetujui usulan penghapusan; sistem menonaktifkan aset secara permanen dan menerbitkan berita acara. |
| **Actor** | Pimpinan Sekolah (menyetujui), Petugas Sarana Prasarana (mengeksekusi) |
| **Preconditions** | Terdapat usulan berstatus `Menunggu Persetujuan` |

**Main Flow**
1. Approver meninjau usulan beserta data pendukung dan lampiran.
2. Approver memilih Setujui / Setujui Sebagian / Tolak / Perlu Revisi disertai catatan.
3. Setelah disetujui pada level terakhir, Petugas Sarpras mencatat pelaksanaan fisik: tanggal, tindak lanjut yang benar-benar dilakukan, saksi, dan foto bukti.
4. Sistem mengubah kondisi aset menjadi terminal, menetapkan `status = Tidak Tersedia`, menandai `dihapuskan = true` beserta `tanggal_penghapusan`, dan mengeluarkannya dari seluruh katalog dan perhitungan ketersediaan.
5. Sistem menerbitkan **Berita Acara Penghapusan Aset** dalam format PDF.
6. Sistem menotifikasi pengusul dan Pimpinan Sekolah.

**Alternative Flow**
- **A1 — Ditolak:** Usulan ditutup; aset kembali dapat dioperasikan sesuai kondisinya; slot pemesanan tidak lagi diblokir.
- **A2 — Setujui Sebagian:** Hanya aset yang disetujui yang dihapuskan; sisanya kembali ke status semula.
- **A3 — Aset ditemukan kembali setelah dihapuskan karena hilang:** Administrator dapat melakukan **pemulihan (*reinstatement*)** dengan alasan wajib; aset kembali aktif dengan kode aset dan UUID **yang sama**, dan seluruh riwayatnya tetap utuh.

**Post Conditions** — Aset tidak lagi muncul di inventaris aktif namun **tetap dapat ditelusuri** (BR-008); berita acara tersimpan permanen.

**Acceptance Criteria**
- [ ] Aset yang dihapuskan tidak pernah hilang dari basis data; hanya ditandai dan dikecualikan dari katalog aktif.
- [ ] Kode aset yang dihapuskan **tidak** dapat digunakan ulang oleh aset baru.
- [ ] Berita acara memuat: identitas aset, alasan, nilai perolehan, penyetuju, pelaksana, saksi, dan tanggal.
- [ ] Seluruh langkah tercatat di activity log dengan aksi `ASSET_DISPOSAL_*`.
- [ ] Aset yang dihapuskan tetap muncul pada laporan historis dan riwayat transaksi terkait.

### FR-21.3 Arsip & Pelaporan Penghapusan

| Aspek | Uraian |
|---|---|
| **Description** | Daftar aset yang telah dihapuskan beserta rekapitulasi nilainya untuk keperluan audit dan pelaporan. |
| **Actor** | Petugas Sarpras, Administrator, Pimpinan Sekolah, Auditor (melalui laporan) |
| **Preconditions** | Terdapat aset yang telah dihapuskan |

**Main Flow**
1. Pengguna membuka menu Penghapusan Aset → tab Arsip.
2. Sistem menampilkan daftar aset terhapus: kode aset, nama, alasan, tanggal, nilai perolehan, penyetuju, dan tautan berita acara.
3. Pengguna memfilter berdasarkan periode, alasan, kategori, dan lokasi terakhir.
4. Pengguna mengekspor rekapitulasi ke XLSX/PDF.

**Post Conditions** — Tidak ada perubahan data.

**Acceptance Criteria**
- [ ] Rekapitulasi menampilkan total unit dan total nilai perolehan aset terhapus per periode.
- [ ] Laporan dapat difilter per tahun anggaran untuk kebutuhan audit.

## 6. Business Rules

### Dimiliki modul ini

| Kode | Business Rule |
|---|---|
| BR-065a | Penghapusan aset hanya sah setelah disetujui Pimpinan Sekolah melalui approval engine jenis "Penghapusan Aset". |
| BR-065b | Aset yang sedang dipinjam, direservasi, atau memiliki slot pemesanan aktif tidak dapat diusulkan untuk dihapus. |
| BR-065c | Aset yang diusulkan penghapusannya diblokir dari pemesanan baru selama usulan berjalan. |
| BR-065d | Penghapusan bersifat penonaktifan permanen, bukan penghapusan fisik record; seluruh riwayat transaksi tetap dapat ditelusuri (BR-008). |
| BR-065e | Kode aset dan UUID aset yang telah dihapuskan tidak pernah digunakan ulang oleh aset lain. |
| BR-065f | Setiap penghapusan yang dieksekusi wajib menghasilkan berita acara PDF yang tersimpan permanen. |
| BR-065g | Aset yang dihapuskan karena `Hilang` dan kemudian ditemukan kembali dapat dipulihkan oleh Administrator dengan alasan wajib, memakai kode aset dan UUID yang sama. |

**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk melalui ID — tidak disalin ke sini):

`BR-008` (m04) · `BR-012` (m04) · `BR-035` (m10)

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| POST | `/asset-disposals` | `disposal.create` | Buat usulan penghapusan aset |
| GET | `/asset-disposals` | `disposal.view` | Daftar & arsip penghapusan |
| POST | `/asset-disposals/{id}/execute` | `disposal.execute` | Catat pelaksanaan fisik & hapuskan aset |
| GET | `/asset-disposals/{id}/report` | `disposal.view` | Unduh berita acara penghapusan PDF |
| POST | `/assets/{id}/reinstate` | `disposal.reinstate` | Pulihkan aset yang telah dihapuskan |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **asset_disposals** | Usulan penghapusan aset | id, nomor, pengusul_id, alasan, justifikasi, tindak_lanjut_fisik, status, disetujui_oleh, disetujui_pada, dilaksanakan_oleh, dilaksanakan_pada, saksi, berita_acara_path | ± 50 |
| **asset_disposal_items** | Aset dalam usulan penghapusan | id, disposal_id, asset_id, nilai_perolehan_snapshot, biaya_pemeliharaan_snapshot, keputusan, keterangan | ± 300 |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |
|---|---|---|---|:---:|---|
| **NT-43** | Usulan penghapusan aset diajukan | Approver (Pimpinan Sekolah) | In-app + Push | ✅ | "Usulan penghapusan {nomor} atas {n} unit aset menunggu persetujuan Anda." |
| **NT-44** | Keputusan usulan penghapusan | Pengusul | In-app + Push | ✅ | "Usulan penghapusan {nomor} {disetujui/disetujui sebagian/ditolak}." |
| **NT-45** | Penghapusan aset dieksekusi | Pengusul + Pimpinan Sekolah | In-app | ❌ | "{n} unit aset telah dihapuskan. Berita acara {nomor} tersedia." |

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `disposal.view` | Penghapusan | Melihat usulan & arsip penghapusan | Admin, Petugas, Pimpinan |
| `disposal.create` | Penghapusan | Mengajukan penghapusan | Admin, Petugas |
| `disposal.approve` | Penghapusan | Menyetujui penghapusan | Pimpinan |
| `disposal.execute` | Penghapusan | Mencatat pelaksanaan & menghapuskan | Admin, Petugas |
| `disposal.reinstate` 🔒 | Penghapusan | Memulihkan aset terhapus | Admin |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `ASSET_DISPOSAL_PROPOSED` / `DECIDED` / `EXECUTED` / `CANCELLED` | Siklus penghapusan aset (M-21) |
| `ASSET_REINSTATED` | Pemulihan aset yang telah dihapuskan, beserta alasan |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset
- [`m10-approval.md`](m10-approval.md) — M-10 Approval Workflow Engine
- [`m13-audit-stocktake.md`](m13-audit-stocktake.md) — M-13 Audit & Stock Opname

## 14. Related Modules

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset
- [`m10-approval.md`](m10-approval.md) — M-10 Approval Workflow Engine
- [`m13-audit-stocktake.md`](m13-audit-stocktake.md) — M-13 Audit & Stock Opname

## 15. Open Issues

_Tidak ada isu terbuka._
