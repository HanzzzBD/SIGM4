# Traceability & Implementation Scoreboard

> Digenerate dari isi `docs/PRD/` dengan `scripts/gen_trace.py`.
> **Kolom Status dan Notes diisi manual** dan dipertahankan saat regenerasi.
>
> Status yang sah: `Not Started` · `In Progress` · `Done` · `Tested` · `Accepted`
> Status awal seluruh baris adalah `Not Started`. **Status implementasi tidak pernah ditebak** —
> hanya diubah manual oleh yang mengerjakan.
>
> Kolom *ID* adalah alamat sebenarnya. Path berkas boleh berubah; ID tidak.

## A. Functional Requirements

Total: **61** requirement.

| ID | Module | File | Status | Notes |
|---|---|---|:---:|---|
| `FR-01.1` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `FR-01.2` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `FR-01.3` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `FR-01.4` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `FR-01.5` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `FR-01.6` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `FR-02.1` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `FR-02.2` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `FR-03.1` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `FR-03.2` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `FR-04.1` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `FR-04.2` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `FR-04.3` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `FR-04.4` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `FR-04.5` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `FR-05.1` | M-05 QR Code Barang | `02-modules/m05-qr.md` | Not Started |  |
| `FR-05.2` | M-05 QR Code Barang | `02-modules/m05-qr.md` | Not Started |  |
| `FR-06.1` | M-06 Dokumen Aset | `02-modules/m06-documents.md` | Not Started |  |
| `FR-07.1` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `FR-07.2` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `FR-07.3` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `FR-07.4` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `FR-07.5` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `FR-08.1` | M-08 Reservasi Barang | `02-modules/m08-reservation-item.md` | Not Started |  |
| `FR-08.2` | M-08 Reservasi Barang | `02-modules/m08-reservation-item.md` | Not Started |  |
| `FR-08.3` | M-08 Reservasi Barang | `02-modules/m08-reservation-item.md` | Not Started |  |
| `FR-09.1` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `FR-09.2` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `FR-09.3` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `FR-09.4` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `FR-09.5` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `FR-10.1` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `FR-10.2` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `FR-10.3` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `FR-11.1` | M-11 Laporan Kerusakan | `02-modules/m11-damage-reports.md` | Not Started |  |
| `FR-11.2` | M-11 Laporan Kerusakan | `02-modules/m11-damage-reports.md` | Not Started |  |
| `FR-11.3` | M-11 Laporan Kerusakan | `02-modules/m11-damage-reports.md` | Not Started |  |
| `FR-12.1` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `FR-12.2` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `FR-12.3` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `FR-12.4` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `FR-12.5` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `FR-13.1` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `FR-13.2` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `FR-13.3` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `FR-14.1` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-14.2` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-14.3` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-15.1` | M-15 Dashboard Monitoring | `02-modules/m15-dashboard.md` | Not Started |  |
| `FR-16.1` | M-16 Statistik & Analitik | `02-modules/m16-analytics.md` | Not Started |  |
| `FR-17.1` | M-17 Notifikasi | `02-modules/m17-notifications.md` | Not Started |  |
| `FR-17.2` | M-17 Notifikasi | `02-modules/m17-notifications.md` | Not Started |  |
| `FR-17.3` | M-17 Notifikasi | `02-modules/m17-notifications.md` | Not Started |  |
| `FR-18.1` | M-18 Activity Log | `02-modules/m18-activity-log.md` | Not Started |  |
| `FR-18.2` | M-18 Activity Log | `02-modules/m18-activity-log.md` | Not Started |  |
| `FR-19.1` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `FR-19.2` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `FR-20.1` | M-20 Konfigurasi Sistem | `02-modules/m20-settings.md` | Not Started |  |
| `FR-21.1` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `FR-21.2` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `FR-21.3` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |

## B. Business Rules

Total: **103** aturan. Setiap aturan wajib memiliki minimal satu test case
(lihat [`test-strategy.md`](test-strategy.md)).

| ID | Module | File | Status | Notes |
|---|---|---|:---:|---|
| `BR-001` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-002` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-003` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-004` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-005` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-005a` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-005b` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-006` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-007` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-008` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-009` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-010` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-011` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-012` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-013` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `BR-014` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `BR-015` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `BR-016` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `BR-017` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-018` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-019` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-020` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-021` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-022` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-023` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-023a` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-023b` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-023c` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-024` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-024a` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-024b` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-025` | M-07 Reservasi Ruangan | `02-modules/m07-reservation-room.md` | Not Started |  |
| `BR-026` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-026a` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-027` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-028` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-028a` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-028b` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-028c` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-028d` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-028e` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-029` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-030` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-031` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-032` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-033` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-034` | M-09 Peminjaman & Pengembalian | `02-modules/m09-loans.md` | Not Started |  |
| `BR-035` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-036` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-037` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-038` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-039` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-039a` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-040` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-041` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-042` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-043` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | Not Started |  |
| `BR-044` | M-11 Laporan Kerusakan | `02-modules/m11-damage-reports.md` | Not Started |  |
| `BR-045` | M-11 Laporan Kerusakan | `02-modules/m11-damage-reports.md` | Not Started |  |
| `BR-046` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-047` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-048` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-049` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-050` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-051` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-052` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-053` | M-12 Maintenance Management | `02-modules/m12-maintenance.md` | Not Started |  |
| `BR-054` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-055` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-056` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-057` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-058` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-059` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-060` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `BR-061` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `BR-062` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `BR-063` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `BR-064` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `BR-065` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `BR-065a` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `BR-065b` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `BR-065c` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `BR-065d` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `BR-065e` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `BR-065f` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `BR-065g` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `BR-066` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-067` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-068` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-069` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-070` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `BR-070a` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `BR-070b` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `BR-070c` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `BR-071` | M-18 Activity Log | `02-modules/m18-activity-log.md` | Not Started |  |
| `BR-072` | M-18 Activity Log | `02-modules/m18-activity-log.md` | Not Started |  |
| `BR-073` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-074` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-075` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-076` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-077` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-078` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-079` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |

## C. Sebaran per Modul

| Module | FR | BR |
|---|---:|---:|
| M-01 Autentikasi & Manajemen Akun | 6 | 4 |
| M-02 Manajemen User & Role | 2 | 6 |
| M-03 Manajemen Lokasi | 2 | 4 |
| M-04 Inventaris Aset | 5 | 14 |
| M-05 QR Code Barang | 2 | 0 |
| M-06 Dokumen Aset | 1 | 0 |
| M-07 Reservasi Ruangan | 5 | 14 |
| M-08 Reservasi Barang | 3 | 0 |
| M-09 Peminjaman & Pengembalian | 5 | 15 |
| M-10 Approval Workflow Engine | 3 | 10 |
| M-11 Laporan Kerusakan | 3 | 2 |
| M-12 Maintenance Management | 5 | 8 |
| M-13 Audit & Stock Opname | 3 | 6 |
| M-14 Pengadaan Barang | 3 | 6 |
| M-15 Dashboard Monitoring | 1 | 0 |
| M-16 Statistik & Analitik | 1 | 0 |
| M-17 Notifikasi | 3 | 0 |
| M-18 Activity Log | 2 | 2 |
| M-19 Chatbot AI | 2 | 5 |
| M-20 Konfigurasi Sistem | 1 | 0 |
| M-21 Penghapusan Aset | 3 | 7 |

## D. Open Issues yang Menunggu Keputusan

Dikumpulkan dari bagian 15 tiap berkas modul. **Tidak boleh ditebak** oleh
pelaksana; perlu keputusan pemilik produk sebelum modul terkait dianggap selesai.

| Module | Isu |
|---|---|
| M-07 | Endpoint `/reservations`, `/reservations/{id}`, dan `/reservations/{id}/cancel` melayani reservasi ruangan **dan** barang. Untuk menjaga aturan satu-pemilik, seluruh baris tersebut ditempatkan di modul ini dan dirujuk oleh M-08. Perlu keputusan apakah pemisahan endpoint per jenis reservasi diinginkan pada tahap desain teknis (SDD). |
| M-07 | BR-017 … BR-025 berlaku untuk reservasi ruangan maupun barang; dimiliki modul ini dan dirujuk oleh M-08. |
| M-08 | Modul ini memakai endpoint dan Business Rules yang dimiliki M-07 (lihat Related Modules). Tidak ada salinan di berkas ini — perubahan aturan dilakukan di M-07. |
| M-09 | BR-030 (pemblokiran pemohon) ditegakkan saat pengajuan reservasi di M-07/M-08, namun aturannya dimiliki modul ini karena bersumber dari kewajiban peminjaman. |
| M-11 | BR-032 (barang kembali rusak menghasilkan tiket otomatis) dimiliki M-09; modul ini adalah konsumennya. |
| M-15 | Rincian isi tiap kartu dashboard berada di `04-frontend/dashboards.md` karena bersifat spesifikasi antarmuka, bukan aturan bisnis. |
| M-17 | Katalog notifikasi NT-01…NT-48 tidak berada di modul ini; setiap baris dimiliki modul yang menerbitkan event-nya. Indeks lengkap digenerate di `03-architecture/notifications-index.md`. |
| M-18 | Daftar aksi yang wajib dicatat tersebar ke modul penerbitnya. Indeks lengkap digenerate di `03-architecture/activity-log-index.md`. |

---

Ringkasan: **61 FR** · **103 BR** · **8 open issue** · seluruhnya berstatus awal `Not Started`.
