# M-12 — Maintenance Management

> **Modul self-contained.** Seluruh yang diperlukan untuk mengimplementasikan modul ini ada di
> berkas ini: requirement, aturan bisnis, endpoint, entitas, notifikasi, permission, jejak audit,
> dan kriteria penerimaan. Baris yang dimiliki modul lain dirujuk melalui ID, tidak disalin.
>
> Isi requirement bersifat **verbatim dari PRD v1.1**. Sumber kebenaran tunggal.

## 1. Overview

Lihat [`../01-product/overview.md`](../01-product/overview.md) untuk konteks produk menyeluruh.
Modul ini adalah **M-12 — Maintenance Management** sebagaimana terdaftar pada Daftar Modul PRD.

## 2. Scope

Cakupan modul ditentukan oleh Functional Requirement yang tercantum pada bagian 5.
Hal di luar daftar tersebut berada di luar cakupan modul ini.

## 3. Actors

Aktor per requirement tercantum pada tabel **Actor** di tiap FR (bagian 5).
Definisi role: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 4. Business Flow

_Diagram alur khusus modul ini tidak ada pada PRD. Alur lintas modul: [`../03-architecture/system-overview.md`](../03-architecture/system-overview.md)._

## 5. Functional Requirements

### FR-12.1 Pembuatan Work Order Korektif

| Aspek | Uraian |
|---|---|
| **Description** | Membuat perintah kerja perbaikan yang ditugaskan kepada teknisi internal, umumnya berasal dari tiket kerusakan yang telah diverifikasi. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Terdapat tiket kerusakan `Diverifikasi` atau kebutuhan perbaikan teridentifikasi; terdapat pengguna berrole Teknisi |

**Main Flow**
1. Petugas menekan "Buat Work Order" dari tiket kerusakan atau dari menu Maintenance.
2. Petugas mengisi: aset terkait, jenis pekerjaan (Korektif), deskripsi pekerjaan, prioritas, teknisi yang ditugaskan, target tanggal selesai, dan estimasi biaya.
3. Sistem membuat work order berstatus `Ditugaskan` dengan nomor unik.
4. Sistem mengubah status aset menjadi `Dalam Perbaikan` dan membatalkan reservasi mendatang atas aset tersebut bila ada.
5. Sistem menotifikasi teknisi (in-app + push).

**Alternative Flow**
- **A1 — Teknisi sedang memiliki beban kerja penuh:** Sistem menampilkan jumlah work order aktif tiap teknisi sebagai bahan pertimbangan penugasan.
- **A2 — Perbaikan tidak memerlukan aset dinonaktifkan** (mis. perawatan ringan): Petugas dapat memilih agar status aset tetap `Tersedia`.
- **A3 — Perbaikan atas ruangan, bukan aset:** Work order ditautkan ke lokasi.

**Post Conditions** — Work order aktif dan tertugaskan; status aset tersesuaikan; teknisi dinotifikasi.

**Acceptance Criteria**
- [ ] Nomor work order unik (mis. `WO-2026-0001`).
- [ ] Work order selalu memiliki satu teknisi penanggung jawab.
- [ ] Reservasi mendatang atas aset yang masuk perbaikan dibatalkan otomatis dan pemohonnya dinotifikasi.

### FR-12.2 Penjadwalan Pemeliharaan Preventif

| Aspek | Uraian |
|---|---|
| **Description** | Menjadwalkan pemeliharaan berkala berdasarkan interval kategori aset, sehingga work order preventif terbit otomatis. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Kategori aset memiliki interval pemeliharaan preventif (FR-04.5) |

**Main Flow**
1. Petugas membuka menu Jadwal Pemeliharaan dan menekan "Buat Jadwal".
2. Petugas memilih aset atau kategori aset, menetapkan interval (harian/mingguan/bulanan/triwulanan/tahunan atau jumlah hari), tanggal mulai, checklist pekerjaan, dan teknisi default.
3. Sistem menyimpan jadwal dan menghitung tanggal jatuh tempo berikutnya.
4. Pada H-7 sebelum jatuh tempo, sistem menerbitkan work order preventif berstatus `Ditugaskan` dan menotifikasi teknisi serta Petugas Sarpras.
5. Setelah work order preventif selesai, sistem menghitung ulang jatuh tempo berikutnya dari tanggal penyelesaian.

**Alternative Flow**
- **A1 — Aset sedang dipinjam saat jadwal jatuh tempo:** Work order tetap terbit namun ditandai `Menunggu Ketersediaan Aset`; teknisi dinotifikasi setelah aset kembali.
- **A2 — Jadwal dinonaktifkan:** Work order preventif berikutnya tidak lagi diterbitkan; work order yang sudah terbit tetap berjalan.
- **A3 — Pemeliharaan preventif dilewati:** Petugas dapat menandai `Dilewati` dengan alasan wajib; tercatat pada riwayat aset.

**Post Conditions** — Jadwal aktif; work order preventif terbit otomatis sesuai interval.

**Acceptance Criteria**
- [ ] Satu jadwal dapat mencakup banyak aset dalam satu kategori.
- [ ] Work order preventif terbit otomatis tanpa intervensi manual.
- [ ] Checklist pekerjaan tampil pada work order dan wajib diisi teknisi sebelum penyelesaian.

### FR-12.3 Eksekusi Work Order oleh Teknisi

| Aspek | Uraian |
|---|---|
| **Description** | Teknisi mengeksekusi pekerjaan, memperbarui progres, mencatat biaya dan sparepart, serta melaporkan hasil melalui aplikasi mobile. |
| **Actor** | Teknisi |
| **Preconditions** | Terdapat work order berstatus `Ditugaskan` kepada teknisi tersebut |

**Main Flow**
1. Teknisi membuka menu Work Order Saya dan melihat daftar berprioritas.
2. Teknisi membuka detail: deskripsi kerusakan, foto pelapor, riwayat servis aset, dan checklist pekerjaan.
3. Teknisi menekan "Mulai Kerjakan"; status berubah menjadi `Dikerjakan` dan waktu mulai tercatat.
4. Teknisi melakukan pekerjaan, mengisi checklist, mencatat tindakan yang dilakukan, sparepart yang dipakai, dan biaya yang dikeluarkan.
5. Teknisi mengunggah foto hasil pekerjaan (minimal 1).
6. Teknisi menekan "Selesai"; status berubah menjadi `Menunggu Verifikasi`.
7. Sistem menotifikasi Petugas Sarana Prasarana untuk verifikasi.

**Alternative Flow**
- **A1 — Pekerjaan tertunda** (mis. menunggu sparepart): Teknisi menandai `Tertunda` beserta alasan dan perkiraan tanggal lanjut; sistem menotifikasi Petugas Sarpras.
- **A2 — Aset tidak dapat diperbaiki:** Teknisi menandai `Tidak Dapat Diperbaiki` dengan rekomendasi; Petugas menindaklanjuti dengan mengubah kondisi aset menjadi `Rusak Berat` dan/atau mengusulkan penghapusan.
- **A3 — Kerusakan berbeda dari laporan awal:** Teknisi memperbarui deskripsi temuan dan estimasi biaya; jika biaya melebihi ambang tertentu, sistem meminta persetujuan ulang.
- **A4 — Teknisi memindai QR aset di lokasi:** Sistem langsung membuka work order aktif untuk aset tersebut.

**Post Conditions** — Progres, biaya, dan dokumentasi pekerjaan tercatat; work order menunggu verifikasi.

**Acceptance Criteria**
- [ ] Teknisi hanya dapat mengakses work order yang ditugaskan kepadanya.
- [ ] Waktu mulai dan selesai tercatat otomatis untuk pengukuran durasi perbaikan.
- [ ] Foto hasil pekerjaan wajib ada minimal 1 berkas.
- [ ] Seluruh alur ini dapat diselesaikan sepenuhnya dari aplikasi mobile.

### FR-12.4 Verifikasi & Penutupan Work Order

| Aspek | Uraian |
|---|---|
| **Description** | Petugas memverifikasi hasil pekerjaan, memperbarui kondisi aset, dan menutup work order beserta tiket kerusakan terkait. |
| **Actor** | Petugas Sarana Prasarana, Administrator |
| **Preconditions** | Work order berstatus `Menunggu Verifikasi` |

**Main Flow**
1. Petugas membuka work order dan meninjau catatan, biaya, serta foto hasil.
2. Petugas memeriksa fisik aset bila diperlukan.
3. Petugas menetapkan kondisi aset pasca-perbaikan dan menekan "Verifikasi & Tutup".
4. Sistem mengubah status work order menjadi `Selesai`, mengembalikan status aset menjadi `Tersedia` (bila kondisinya memungkinkan), menutup tiket kerusakan terkait, dan menotifikasi pelapor serta teknisi.

**Alternative Flow**
- **A1 — Hasil pekerjaan tidak memuaskan:** Petugas menekan "Kembalikan ke Teknisi" dengan catatan; status kembali menjadi `Dikerjakan`.
- **A2 — Aset tetap tidak layak pakai:** Kondisi ditetapkan `Rusak Berat`; status aset tetap `Tidak Tersedia` dan dapat diusulkan untuk penghapusan.

**Post Conditions** — Work order tertutup; riwayat servis aset bertambah; biaya pemeliharaan masuk ke analitik.

**Acceptance Criteria**
- [ ] Work order tidak dapat ditutup tanpa penetapan kondisi aset pasca-perbaikan.
- [ ] Penutupan work order otomatis menutup tiket kerusakan yang menjadi asalnya.
- [ ] Total biaya pemeliharaan per aset terakumulasi dan tampil pada halaman detail aset.

### FR-12.5 Riwayat Servis Aset

| Aspek | Uraian |
|---|---|
| **Description** | Menampilkan seluruh riwayat pemeliharaan suatu aset beserta akumulasi biaya, sebagai dasar keputusan perbaikan atau penggantian. |
| **Actor** | Petugas Sarpras, Administrator, Pimpinan Sekolah, Teknisi |
| **Preconditions** | Aset pernah memiliki work order |

**Main Flow**
1. Pengguna membuka detail aset dan memilih tab Riwayat Pemeliharaan.
2. Sistem menampilkan daftar kronologis work order: tanggal, jenis, deskripsi, teknisi, durasi, biaya, dan hasil.
3. Sistem menampilkan ringkasan: total biaya pemeliharaan, jumlah perbaikan, dan rata-rata interval antar-kerusakan.

**Alternative Flow**
- **A1 — Biaya pemeliharaan kumulatif melebihi ambang persentase dari nilai perolehan** (dikonfigurasi Administrator): Sistem menampilkan rekomendasi "Pertimbangkan penggantian aset".
- **A2 — Teknisi mengakses melalui pemindaian QR di lokasi:** Riwayat servis tampil langsung untuk membantu diagnosis.

**Post Conditions** — Tidak ada perubahan data.

**Acceptance Criteria**
- [ ] Riwayat menampilkan seluruh work order termasuk yang dibatalkan atau tidak dapat diperbaiki.
- [ ] Peringatan penggantian aset muncul sesuai ambang yang dikonfigurasi.

## 6. Business Rules

### Dimiliki modul ini

| Kode | Business Rule |
|---|---|
| BR-046 | Work order hanya dapat ditugaskan kepada pengguna berrole Teknisi. |
| BR-047 | Aset yang sedang berstatus `Dalam Perbaikan` tidak dapat direservasi maupun dipinjam. |
| BR-048 | Reservasi mendatang atas aset yang masuk perbaikan dibatalkan otomatis dan pemohonnya dinotifikasi. |
| BR-049 | Work order tidak dapat ditutup tanpa penetapan kondisi aset pasca-perbaikan dan minimal satu foto hasil pekerjaan. |
| BR-050 | Penutupan work order otomatis menutup tiket kerusakan yang menjadi asalnya. |
| BR-051 | Work order preventif terbit otomatis H-7 sebelum tanggal jatuh tempo jadwal pemeliharaan. |
| BR-052 | Sistem menampilkan peringatan bila perbaikan dilakukan atas aset yang masih dalam masa garansi aktif. |
| BR-053 | Biaya pemeliharaan terakumulasi per aset; bila melewati ambang persentase nilai perolehan yang dikonfigurasi, sistem menampilkan rekomendasi penggantian. |

**Aturan bersama yang juga berlaku** (dimiliki modul lain, dirujuk melalui ID — tidak disalin ke sini):

`BR-005b` (m04)

## 7. API Endpoints

### Endpoint

| Method | Endpoint | Permission | Deskripsi |
|---|---|---|---|
| POST | `/work-orders` | `workorder.create` | Buat work order |
| GET | `/work-orders/mine` | `workorder.execute` | Work order yang ditugaskan kepada saya |
| PATCH | `/work-orders/{id}/start` | `workorder.execute` | Mulai kerjakan |
| PATCH | `/work-orders/{id}/progress` | `workorder.execute` | Perbarui progres, biaya, foto |
| POST | `/work-orders/{id}/complete` | `workorder.execute` | Ajukan penyelesaian |
| POST | `/work-orders/{id}/verify` | `workorder.verify` | Verifikasi & tutup |
| GET | `/assets/{id}/service-history` | `asset.view` | Riwayat servis aset |
| POST | `/maintenance-schedules` | `maintenance.manage` | Buat jadwal preventif |

Konvensi umum, format respons, kode galat, dan ketentuan keamanan API:
[`../03-architecture/api-conventions.md`](../03-architecture/api-conventions.md).

## 8. Database Entity

### Entitas

| Entitas | Deskripsi | Atribut Utama | Keterangan |
|---|---|---|---|
| **work_orders** | Perintah kerja pemeliharaan | id, nomor, jenis (`PREVENTIF`/`KOREKTIF`), asset_id, room_id, damage_report_id, teknisi_id, prioritas, deskripsi, target_selesai, waktu_mulai, waktu_selesai, biaya, catatan_teknisi, hasil, status | ± 700 |
| **work_order_costs** | Rincian biaya & sparepart | id, work_order_id, deskripsi, jumlah, harga_satuan, total | ± 1.000 |
| **maintenance_schedules** | Jadwal pemeliharaan preventif | id, asset_id/category_id, interval_hari, tanggal_mulai, checklist (JSON), teknisi_default_id, jatuh_tempo_berikutnya, status | Petugas Sarpras |

Model data menyeluruh dan ERD: [`../03-architecture/data-model.md`](../03-architecture/data-model.md).

## 9. Notification

### Notifikasi diterbitkan modul ini

| Kode | Event Pemicu | Penerima | Kanal | Wajib | Contoh Isi |
|---|---|---|---|:---:|---|
| **NT-22** | Work order ditugaskan | Teknisi | In-app + Push | ✅ | "Work order {nomor} ditugaskan kepada Anda. Prioritas: {prioritas}." |
| **NT-23** | Work order melewati target selesai | Teknisi + Petugas Sarpras | In-app + Push | ✅ | "Work order {nomor} melewati target selesai {tanggal}." |
| **NT-24** | Work order menunggu verifikasi | Petugas Sarpras | In-app + Push | ❌ | "Work order {nomor} selesai dikerjakan dan menunggu verifikasi." |
| **NT-25** | Work order dikembalikan ke teknisi | Teknisi | In-app + Push | ✅ | "Work order {nomor} dikembalikan. Catatan: {catatan}." |
| **NT-26** | Work order selesai & diverifikasi | Pelapor + Teknisi | In-app + Push | ❌ | "Perbaikan {aset} telah selesai dan diverifikasi." |
| **NT-27** | Reservasi dibatalkan karena aset masuk perbaikan | Pemohon terdampak | In-app + Push | ✅ | "Reservasi {nomor} dibatalkan karena {aset} sedang diperbaiki." |
| **NT-28** | Work order preventif terbit | Teknisi + Petugas Sarpras | In-app + Push | ❌ | "Pemeliharaan preventif {aset} dijadwalkan {tanggal}." |
| **NT-29** | Garansi aset akan berakhir (H-30) | Petugas Sarpras | In-app | ❌ | "Garansi {aset} berakhir pada {tanggal}." |

Ketentuan umum kanal, latensi, dan preferensi: [`m17-notifications.md`](m17-notifications.md).

## 10. Permission

### Kode permission

| Kode | Domain | Deskripsi singkat | Role bawaan pemilik |
|---|---|---|---|
| `workorder.view` | Maintenance | Melihat work order | Admin, Petugas, Pimpinan, Teknisi(`assigned`) |
| `workorder.create` | Maintenance | Membuat & menugaskan work order | Admin, Petugas |
| `workorder.execute` | Maintenance | Mengeksekusi work order | Teknisi(`assigned`) |
| `workorder.verify` | Maintenance | Verifikasi & menutup work order | Admin, Petugas |
| `maintenance.manage` | Maintenance | Mengelola jadwal preventif | Admin, Petugas |
| `maintenance.view_cost` | Maintenance | Melihat biaya pemeliharaan | Admin, Petugas, Pimpinan, Teknisi(`assigned`) |

Katalog kanonik & aturan scope: [`../00-foundation/roles-permissions.md`](../00-foundation/roles-permissions.md).

## 11. Activity Log

### Aksi yang wajib dicatat

| Aksi | Keterangan |
|---|---|
| `WORKORDER_CREATED` / `WORKORDER_ASSIGNED` / `WORKORDER_STARTED` | Penugasan dan pelaksanaan |
| `WORKORDER_PROGRESS_UPDATED` | Termasuk perubahan biaya |
| `WORKORDER_COMPLETED` / `WORKORDER_VERIFIED` / `WORKORDER_RETURNED` / `WORKORDER_CANCELLED` | Penyelesaian |
| `MAINTENANCE_SCHEDULE_CREATED` / `UPDATED` / `DEACTIVATED` / `SKIPPED` | Jadwal preventif |

Prinsip, struktur entri, dan tamper-evidence: [`../03-architecture/activity-log.md`](../03-architecture/activity-log.md).

## 12. Acceptance Criteria

Kriteria penerimaan tercantum **inline** pada tiap Functional Requirement di bagian 5,
sesuai bentuk aslinya di PRD. Tidak diringkas maupun dipindahkan agar tidak terpisah dari
konteks requirement-nya.

Strategi pengujian: [`../06-quality/test-strategy.md`](../06-quality/test-strategy.md).

## 13. Dependencies

- [`m11-damage-reports.md`](m11-damage-reports.md) — M-11 Laporan Kerusakan
- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset

## 14. Related Modules

- [`m04-assets.md`](m04-assets.md) — M-04 Inventaris Aset
- [`m11-damage-reports.md`](m11-damage-reports.md) — M-11 Laporan Kerusakan

## 15. Open Issues

_Tidak ada isu terbuka._
