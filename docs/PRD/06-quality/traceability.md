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

Total: **69** requirement.

| ID | Module | File | Status | Notes |
|---|---|---|:---:|---|
| `FR-01.1` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | Audit 7 Oktober 2026: #62/#63/#110: API dan web login/2FA; aplikasi mobile belum ada (GAP-05-MOBILE). [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-01.2` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | Audit 7 Oktober 2026: #64/#110: pencabutan sesi/perangkat + idle web, auth-session.test.ts / alur-masuk.test.tsx; QA staging belum. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-01.3` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | Audit 7 Oktober 2026: #65/#67/#113: reset administratif + NT-37/38/38a; UI administratif masih GAP-02-WEB-AUTH. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-01.4` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | Audit 7 Oktober 2026: #67/#108/#125: password policy/riwayat + profil/foto backend; P-76/P-77 GAP-02-WEB-AUTH. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-01.5` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | Audit 7 Oktober 2026: #68/#69/#78/#110/#113: 2FA/aktivasi/CLI/notifikasi; buat ulang kode P-77 GAP-02-WEB-AUTH; disable role opsional masih keputusan produk. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-01.6` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | Audit 7 Oktober 2026: #78/#113: CLI guard/alarm/log/NT-53 diuji; Done lama dikoreksi: instalasi dua admin GAP-08-INSTALL/PR-08-15 dan drill PR-08-08 deferred, QA staging belum. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-02.1` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | In Progress | Audit 7 Oktober 2026: #46/#47/#57/#58/#59/#101: CRUD/impor/siswa/consent/notifikasi backend; users UI/template/demo GAP-01-WEB-USERS; SL-04 PR-05-09. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-02.2` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | In Progress | Audit 7 Oktober 2026: #48/#66: matriks/core permission/cache user+role+version; UI GAP-01-WEB-USERS; JWT nyata GAP-01-AUTH-E2E. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-03.1` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | In Progress | Audit 7 Oktober 2026: #49/#50/#83: hierarki/soft status/BR-015; summary ruangan #84. Counts pohon/pencarian GAP-01-LOCATION-DATA, UI GAP-01-WEB-LOCATIONS; konsumen BR-016 PR-03-09/10 deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-03.2` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | In Progress | Audit 7 Oktober 2026: #84: daftar/filter/summary ruangan sungguhan, m04-assets-list.test.ts. q belum diteruskan, ukuran 500 unit belum diukur, ekspor belum ada: GAP-01-LOCATION-DATA/EXPORT + web. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-04.1` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | In Progress | Audit 7 Oktober 2026: #81/#82/#87/#120: skema/pendaftaran/kategori/20 QR unik diuji. Bulk import PR-02-38 tergabung 9 Oktober (#131/#133): CSV/XLSX + P-17, 500 baris 4,28 detik; QA staging pending; konsumen dapat_dipinjam PR-04-02 deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-04.2` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | In Progress | Audit 7 Oktober 2026: #84/#120/#121/#122: katalog/pencarian/QR/scan; backend detail/timeline PR-03-24 deferred, UI P-15/P-18 GAP-02-WEB-ASSETS, ekspor katalog GAP-02-ASSET-EXPORT (Backend M-04/Frontend/QA). [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-04.3` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | In Progress | Audit 7 Oktober 2026: #85: alasan/riwayat/kondisi/status backend diuji; UI P-18 GAP-02-WEB-ASSETS, timeline PR-03-24; ASSIGNED PR-04-05/08 dan efek reservasi PR-03-10/PR-04-02 deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-04.4` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | In Progress | #86/0029: mutasi atomik/riwayat backend diuji. PR-02-39 tergabung 9 Oktober (#136/#138): P-20 + PDF 1.7 per operasi, snapshot tetap, worker/storage privat, akses tiga role dan audit; QA staging pending. Cek slot tanggal GAP-02-MOVE-SLOT dan UI P-18 masih gap. [Bukti mutasi](../../IMPLEMENTATION/reviews/PR-02-39.md), [audit historis](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-04.5` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | In Progress | Audit 7 Oktober 2026: #87: kategori/interval tersedia dan diuji; usulan interval saat jadwal dibuat deferred PR-04-07 / Backend maintenance+Frontend+QA. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
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
| `FR-10.1` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | In Progress | Audit 7 Oktober 2026: #90/#91/#93/#100/#111: snapshot/evaluator/rules/preview dan P-68/P-69 tersedia, approval-rules tests + axe; QA staging belum. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-10.2` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | In Progress | Audit 7 Oktober 2026: #93/#95/#97/#98/#101: keputusan/idempoten/delegasi/SLA/notifikasi diuji; web GAP-02-WEB-APPROVAL, mobile GAP-05-MOBILE deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-10.3` | M-10 Approval Workflow Engine | `02-modules/m10-approval.md` | In Progress | Audit 7 Oktober 2026: #99: history/durasi kerja API, approval-history.test.ts; timeline/waktu lokal web GAP-02-WEB-APPROVAL. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
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
| `FR-13.4` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `FR-14.1` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-14.2` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-14.3` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-15.1` | M-15 Dashboard Monitoring | `02-modules/m15-dashboard.md` | In Progress | Audit 7 Oktober 2026: #106/#107/#119: backend/dashboard shell dan timing API tersedia; drilldown/viewport/render peramban GAP-02-DASHBOARD; mobile deferred GAP-05-MOBILE. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-16.1` | M-16 Statistik & Analitik | `02-modules/m16-analytics.md` | Not Started |  |
| `FR-17.1` | M-17 Notifikasi | `02-modules/m17-notifications.md` | In Progress | Audit 7 Oktober 2026: #101/#102/#113: konsumen/SSE/fanout/read/archive backend diuji; lonceng/P-13/fallback/tujuan deep link GAP-02-WEB-NOTIFICATIONS; mobile deferred GAP-05-MOBILE. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-17.2` | M-17 Notifikasi | `02-modules/m17-notifications.md` | In Progress | Audit 7 Oktober 2026: #103: FCM/retry/registrasi/token/logout diuji; pengiriman nyata GAP-02-FCM / DevOps+QA+Mobile; klien mobile deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-17.3` | M-17 Notifikasi | `02-modules/m17-notifications.md` | In Progress | Audit 7 Oktober 2026: #105: preferensi enam kelompok/kanal backend diuji; layar P-78 GAP-02-WEB-NOTIFICATIONS. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-18.1` | M-18 Activity Log | `02-modules/m18-activity-log.md` | In Progress | Audit 7 Oktober 2026: #28/#29/#32/#117: log/redaksi/hash/partisi/privilege + JOB-05 diuji; pembuktian seluruh modul bertambah bersama PR pemilik, QA staging belum. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-18.2` | M-18 Activity Log | `02-modules/m18-activity-log.md` | In Progress | Audit 7 Oktober 2026: #52/#53/#61: filter/ekspor/AL-10 dan ukuran awal diuji; before/after dua kolom P-73/P-74 GAP-01-WEB-LOG. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-19.1` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `FR-19.2` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `FR-20.1` | M-20 Konfigurasi Sistem | `02-modules/m20-settings.md` | In Progress | Audit 7 Oktober 2026: #54/#60: settings/master endpoints dan default/validasi/audit backend diuji; UI GAP-01-WEB-SETTINGS, tafsir edit/baca GAP-01-SETTINGS-AC, kalender riil GAP-01-SCHOOL-DATA. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-21.1` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `FR-21.2` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `FR-21.3` | M-21 Penghapusan Aset | `02-modules/m21-disposal.md` | Not Started |  |
| `FR-22.1` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `FR-22.2` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `FR-22.3` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `FR-22.4` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `FR-22.5` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `FR-22.6` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `FR-22.7` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |

## B. Business Rules

Total: **121** aturan. Setiap aturan wajib memiliki minimal satu test case
(lihat [`test-strategy.md`](test-strategy.md)).

| ID | Module | File | Status | Notes |
|---|---|---|:---:|---|
| `BR-001` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Done | PR-02-11: `jumlah_unit` unit terpisah, tiap unit `kode_barang`+`uuid` sendiri, diuji |
| `BR-002` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Done | PR-02-10 (unique index) + PR-02-11 (penomoran otomatis via `asset_code_counters`), diuji termasuk beban paralel |
| `BR-003` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Done | PR-02-10 (partial unique index) + PR-02-11 (ditolak sebelum INSERT, DUPLICATE_CODE), diuji |
| `BR-004` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Done | Enum `asset_condition` (0002) + kolom NOT NULL (PR-02-10); diterima sebagai input tervalidasi PR-02-11 |
| `BR-005` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-005a` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-005b` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-006` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-007` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-008` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-009` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Done | PR-02-11: `room_id` wajib ada dan berstatus AKTIF, diuji |
| `BR-010` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-011` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-012` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | Not Started |  |
| `BR-013` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `BR-014` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Not Started |  |
| `BR-015` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | Done | `PR-01-06` (gedung, kerangka struktural) + tindak lanjut `PR-02-10` (ruangan, `assets.room_id`+`dihapuskan`), diuji |
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
| `BR-070` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | PR-02-07 (#68): gerbang 403 TWO_FACTOR_REQUIRED untuk R-01/R-03. PR-02-33 (#69): pendaftaran pertama role wajib terikat kode aktivasi (BR-070d), menutup risiko pemegang password. TERBUKA: jalur CLI untuk instalasi awal (PR-02-08) |
| `BR-070a` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Not Started |  |
| `BR-070b` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Done | PR-02-08 (#78): sigm4 admin:recover, CLI-only, diuji |
| `BR-070c` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Done | PR-02-07 (#68): hash Argon2id, tampil sekali; diuji |
| `BR-070d` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | Done | PR-02-33 (#69): enroll/confirm role wajib menuntut kode aktivasi; endpoint penerbit + reset 2FA. PR-02-08 (#78): CLI penerbit kode aktivasi (admin:activation-code, admin:recover). Diuji |
| `BR-070e` | M-01 Autentikasi & Manajemen Akun | `02-modules/m01-auth.md` | In Progress | PR-02-07 (#68): sesi lain dicabut + event TwoFactorEnabled, diuji. TERBUKA: notifikasi NT-39a ke Administrator (PR-02-25) |
| `BR-071` | M-18 Activity Log | `02-modules/m18-activity-log.md` | Not Started |  |
| `BR-072` | M-18 Activity Log | `02-modules/m18-activity-log.md` | Not Started |  |
| `BR-073` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-074` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
| `BR-075` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-076` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-077` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-078` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-079` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | Not Started |  |
| `BR-080` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-081` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-082` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-083` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-084` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-085` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-086` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-087` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-088` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-089` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-090` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-091` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-092` | M-22 Manajemen Bahan | `02-modules/m22-materials.md` | Not Started |  |
| `BR-093` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-094` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |
| `BR-095` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | Not Started |  |

## C. Sebaran per Modul

| Module | FR | BR |
|---|---:|---:|
| M-01 Autentikasi & Manajemen Akun | 6 | 6 |
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
| M-13 Audit & Stock Opname | 4 | 9 |
| M-14 Pengadaan Barang | 3 | 6 |
| M-15 Dashboard Monitoring | 1 | 0 |
| M-16 Statistik & Analitik | 1 | 0 |
| M-17 Notifikasi | 3 | 0 |
| M-18 Activity Log | 2 | 2 |
| M-19 Chatbot AI | 2 | 5 |
| M-20 Konfigurasi Sistem | 1 | 0 |
| M-21 Penghapusan Aset | 3 | 7 |
| M-22 Manajemen Bahan | 7 | 13 |

## D. Open Issues yang Menunggu Keputusan

Dikumpulkan dari bagian 15 tiap berkas modul. **Tidak boleh ditebak** oleh
pelaksana; perlu keputusan pemilik produk sebelum modul terkait dianggap selesai.

| Module | Isu |
|---|---|
| M-07 | Endpoint `/reservations`, `/reservations/{id}`, dan `/reservations/{id}/cancel` melayani reservasi ruangan **dan** aset. Untuk menjaga aturan satu-pemilik, seluruh baris tersebut ditempatkan di modul ini dan dirujuk oleh M-08. **Ditutup 25 Agustus 2026** (`TBD-AVL-B`, `UXD-15`): endpoint tetap satu rumpun `/reservations`; pemisahan per jenis tidak dilakukan karena `BR-017` … `BR-025` berlaku identik bagi kedua jenis. |
| M-07 | BR-017 … BR-025 berlaku untuk reservasi ruangan maupun aset; dimiliki modul ini dan dirujuk oleh M-08. |
| M-08 | Modul ini memakai endpoint dan Business Rules yang dimiliki M-07 (lihat Related Modules). Tidak ada salinan di berkas ini — perubahan aturan dilakukan di M-07. |
| M-09 | BR-030 (pemblokiran pemohon) ditegakkan saat pengajuan reservasi di M-07/M-08, namun aturannya dimiliki modul ini karena bersumber dari kewajiban peminjaman. |
| M-11 | BR-032 (aset kembali rusak menghasilkan tiket otomatis) dimiliki M-09; modul ini adalah konsumennya. |
| M-15 | Rincian isi tiap kartu dashboard berada di `04-frontend/dashboards.md` karena bersifat spesifikasi antarmuka, bukan aturan bisnis. |
| M-17 | Katalog notifikasi NT-01…NT-51 tidak berada di modul ini; setiap baris dimiliki modul yang menerbitkan event-nya. Indeks lengkap digenerate di [`_generated/notifications-index.md`](../_generated/notifications-index.md). |
| M-18 | Daftar aksi yang wajib dicatat tersebar ke modul penerbitnya. Indeks lengkap digenerate di [`_generated/activity-log-index.md`](../_generated/activity-log-index.md). |

---

Ringkasan: **69 FR** · **121 BR** · **8 open issue**. Status FR mengikuti kolom Status dan bukti audit terbaru; PR selesai tidak otomatis menutup requirement.
