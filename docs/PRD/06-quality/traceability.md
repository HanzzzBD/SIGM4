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
| `FR-02.1` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | In Progress | Audit 7 Oktober 2026: #46/#47/#57/#58/#59/#101: CRUD/impor/siswa/consent/notifikasi backend; users UI/template/demo GAP-01-WEB-USERS; SL-04/pseudonimisasi tersedia lokal PR-05-09/26; [audit 15 Oktober 2026](../../IMPLEMENTATION/audits/pr-05-09-26-local-2026-10-15.md). [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-02.2` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | In Progress | Audit 7 Oktober 2026: #48/#66: matriks/core permission/cache user+role+version; UI GAP-01-WEB-USERS; JWT nyata GAP-01-AUTH-E2E tersedia lokal PR-01-26: delapan skenario WEB/ANDROID, dua API dan DB/Redis nyata; review/CI/staging terbuka. [Audit 15 Oktober](../../IMPLEMENTATION/audits/pr-01-26-pr-03-36-local-2026-10-15.md). [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-03.1` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | In Progress | Audit 7 Oktober 2026: #49/#50/#83: hierarki/soft status/BR-015; summary ruangan #84. Counts pohon/pencarian GAP-01-LOCATION-DATA, UI GAP-01-WEB-LOCATIONS; konsumen BR-016 PR-03-09/10 deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-03.2` | M-03 Manajemen Lokasi | `02-modules/m03-locations.md` | In Progress | Audit 7 Oktober 2026: #84: daftar/filter/summary ruangan sungguhan, m04-assets-list.test.ts. q belum diteruskan, ukuran 500 unit belum diukur, ekspor belum ada: GAP-01-LOCATION-DATA/EXPORT + web. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-04.1` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | In Progress | Audit 7 Oktober 2026: #81/#82/#87/#120: skema/pendaftaran/kategori/20 QR unik diuji. Bulk import PR-02-38 tergabung 9 Oktober (#131/#133): CSV/XLSX + P-17, 500 baris 4,28 detik; QA staging pending; konsumen dapat_dipinjam PR-04-02 deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-04.2` | M-04 Inventaris Aset | `02-modules/m04-assets.md` | In Progress | Audit 7 Oktober 2026: #84/#120/#121/#122: katalog/pencarian/QR/scan; backend detail/timeline PR-03-24 deferred, UI P-15/P-18 GAP-02-WEB-ASSETS, ekspor katalog GAP-02-ASSET-EXPORT (Backend M-04/Frontend/QA). [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md).  Ekspor katalog PR-02-47 tersedia lokal 15 Oktober 2026, review/CI/staging pending; [audit](../../IMPLEMENTATION/audits/pr-02-47-local-2026-10-15.md). |
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
| `FR-13.4` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | In Progress | PR-05-24 lokal; integrasi/web/mobile teruji, CI/staging belum |
| `FR-14.1` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-14.2` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-14.3` | M-14 Pengadaan Barang | `02-modules/m14-procurement.md` | Not Started |  |
| `FR-15.1` | M-15 Dashboard Monitoring | `02-modules/m15-dashboard.md` | In Progress | Audit 7 Oktober 2026: #106/#107/#119: backend/dashboard shell dan timing API tersedia; drilldown/viewport/render peramban GAP-02-DASHBOARD; mobile deferred GAP-05-MOBILE. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-16.1` | M-16 Statistik & Analitik | `02-modules/m16-analytics.md` | In Progress | Delapan perhitungan lokal PR-06-03…07, fondasi PR-06-01/02; review/CI/staging dan ekspor/UI/performa lanjutan belum menjadi bukti batch ini. Audit: docs/IMPLEMENTATION/audits/pr-06-03-04-05-06-07-local-2026-10-15.md |
| `FR-17.1` | M-17 Notifikasi | `02-modules/m17-notifications.md` | In Progress | Audit 7 Oktober 2026: #101/#102/#113: konsumen/SSE/fanout/read/archive backend diuji; lonceng/P-13/fallback/tujuan deep link GAP-02-WEB-NOTIFICATIONS; mobile deferred GAP-05-MOBILE. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-17.2` | M-17 Notifikasi | `02-modules/m17-notifications.md` | In Progress | Audit 7 Oktober 2026: #103: FCM/retry/registrasi/token/logout diuji; pengiriman nyata GAP-02-FCM / DevOps+QA+Mobile; klien mobile deferred. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-17.3` | M-17 Notifikasi | `02-modules/m17-notifications.md` | In Progress | Audit 7 Oktober 2026: #105: preferensi enam kelompok/kanal backend diuji; layar P-78 GAP-02-WEB-NOTIFICATIONS. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-18.1` | M-18 Activity Log | `02-modules/m18-activity-log.md` | In Progress | Audit 7 Oktober 2026: #28/#29/#32/#117: log/redaksi/hash/partisi/privilege + JOB-05 diuji; pembuktian seluruh modul bertambah bersama PR pemilik, QA staging belum. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-18.2` | M-18 Activity Log | `02-modules/m18-activity-log.md` | In Progress | Audit 7 Oktober 2026: #52/#53/#61: filter/ekspor/AL-10 dan ukuran awal diuji; before/after dua kolom P-73/P-74 GAP-01-WEB-LOG. [Bukti closure/owner](../../IMPLEMENTATION/audits/closure-phase-00-02-2026-10-07.md). |
| `FR-19.1` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | In Progress | M-19 lokal 14 Okt 2026: SQL/SSE/privasi/700 CONTRACT; bukti model/cache/LIVE dan CI/staging belum selesai |
| `FR-19.2` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | In Progress | M-19 lokal 14 Okt 2026: SQL/SSE/privasi/700 CONTRACT; bukti model/cache/LIVE dan CI/staging belum selesai |
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

Total: **122** aturan. Setiap aturan wajib memiliki minimal satu test case
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
| `BR-069a` | M-02 Manajemen User & Role | `02-modules/m02-users.md` | Not Started |  |
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
| `BR-075` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | In Progress | M-19 lokal 14 Okt 2026: SQL/SSE/privasi/700 CONTRACT; bukti model/cache/LIVE dan CI/staging belum selesai |
| `BR-076` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | In Progress | M-19 lokal 14 Okt 2026: SQL/SSE/privasi/700 CONTRACT; bukti model/cache/LIVE dan CI/staging belum selesai |
| `BR-077` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | In Progress | M-19 lokal 14 Okt 2026: SQL/SSE/privasi/700 CONTRACT; bukti model/cache/LIVE dan CI/staging belum selesai |
| `BR-078` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | In Progress | M-19 lokal 14 Okt 2026: SQL/SSE/privasi/700 CONTRACT; bukti model/cache/LIVE dan CI/staging belum selesai |
| `BR-079` | M-19 Chatbot AI | `02-modules/m19-chatbot.md` | In Progress | M-19 lokal 14 Okt 2026: SQL/SSE/privasi/700 CONTRACT; bukti model/cache/LIVE dan CI/staging belum selesai |
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
| `BR-093` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | In Progress | PR-05-24 lokal; penolakan campur domain SQL/API teruji |
| `BR-094` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | In Progress | PR-05-24 lokal; Pimpinan, ledger atomik dan persetujuan serentak teruji |
| `BR-095` | M-13 Audit & Stock Opname | `02-modules/m13-audit-stocktake.md` | In Progress | PR-05-24 lokal; selisih tanpa keterangan memblokir submit |

## C. Sebaran per Modul

| Module | FR | BR |
|---|---:|---:|
| M-01 Autentikasi & Manajemen Akun | 6 | 6 |
| M-02 Manajemen User & Role | 2 | 7 |
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
| M-04 | Seluruh ekspor melalui worker dengan status/unduh pada P-15, memakai infrastruktur ekspor yang ada. Hak `asset.export` bersama `asset.view` cukup; tidak memerlukan `report.export` atau `report.view`. |
| M-04 | Kolom lengkap: kode/nama/merek/model/nomor seri, kategori, gedung/ruangan, kondisi/status, tahun, kelayakan pinjam/siswa, penanggung jawab dan QR terpasang. Sumber/nilai perolehan hanya sesuai izin finansial. Tidak memuat dokumen, foto, histori transaksi, data kontak atau biaya pemeliharaan. GET /assets/export menerima format=XLSX|PDF serta q, sort dan filter katalog yang sama (kategori/lokasi/kondisi/status/tahun/kelayakan/QR/hasil impor), tanpa page/per_page. Seluruh hasil filter diekspor, bukan halaman aktif. Parameter tak dikenal ditolak. Respons 202 berisi job; Idempotency-Key UUIDv4 wajib agar pengulangan pengiriman tidak membuat job ganda. Respons private/no-store. Worker memakai keadaan data saat pemrosesan, bukan snapshot saat tombol ditekan. Scope baca all/own/restricted dan ekspor all/own beririsan sebelum query; own adalah penanggung jawab aset. Restricted mengikuti boleh_dipinjam_siswa. Scope lain tanpa aturan ditolak. Aset dihapuskan tidak masuk katalog/ekspor biasa. Filter hasil impor hanya milik pengunggah. Nilai/sumber tidak dipilih SQL jika izin finansial tidak cukup: all membuka kolom, own hanya jika seluruh dataset sudah dibatasi ke aset pemanggil; selainnya kedua kolom dihilangkan. R-07 tidak mendapat field finansial sekalipun permission itu diberikan secara kustom. Batas infrastruktur yang dipakai ulang: XLSX 100.000/PDF 5.000 baris; hasil lebih besar gagal dengan penjelasan untuk mempersempit filter, tanpa berkas terpotong. PDF memerlukan Nama sekolah terkonfigurasi dan memuat filter/waktu WIB/pencetak. Teks spreadsheet tetap teks, nilai DECIMAL tetap presisi. Job/audit/outbox atomik; berkas siap terdaftar privat dan NT-42 menautkan /aset?ekspor={id}. File berlaku 24 jam, URL unduh paling lama lima menit. Izin akun dan keanggotaan scope dibaca ulang saat pemrosesan/unduh; perubahan membatalkan akses file lama. Pemanggil lain, termasuk Admin, tidak membaca pekerjaan milik pengguna lain. |
| M-07 | Endpoint `/reservations`, `/reservations/{id}`, dan `/reservations/{id}/cancel` melayani reservasi ruangan **dan** aset. Untuk menjaga aturan satu-pemilik, seluruh baris tersebut ditempatkan di modul ini dan dirujuk oleh M-08. **Ditutup 25 Agustus 2026** (`TBD-AVL-B`, `UXD-15`): endpoint tetap satu rumpun `/reservations`; pemisahan per jenis tidak dilakukan karena `BR-017` … `BR-025` berlaku identik bagi kedua jenis. |
| M-07 | BR-017 … BR-025 berlaku untuk reservasi ruangan maupun aset; dimiliki modul ini dan dirujuk oleh M-08. ### Ekspor P-30 — PR-06-11 Keputusan AskUserQuestion 14 Oktober 2026: POST /reservations/export memakai report.export + reservation.view, irisan scope, XLSX/PDF melalui pipeline M-16. Seluruh hasil filter q/jenis/status/pemohon/dari/sampai dan urut daftar dipakai, bukan hanya halaman aktif. Kolom: Nomor, Jenis, Kegiatan, Ruangan, Pemohon, Mulai WIB, Selesai WIB, Status, Diajukan WIB, Jumlah tanggal berulang (jumlah anak, sama dengan P-30). Satu baris per pengajuan induk/tunggal, mengikuti P-30. Tanpa foto/dokumen/nilai finansial. Batas XLSX100000/PDF5000 tanpa truncation, kop/filter/pencetak, HTTP202, file24jam/URL5menit, NT-42 dan REPORT_EXPORTED mengikuti kontrak ekspor M-16. Revalidasi izin/scope tetap berlaku saat unduh. |
| M-08 | Modul ini memakai endpoint dan Business Rules yang dimiliki M-07 (lihat Related Modules). Tidak ada salinan di berkas ini — perubahan aturan dilakukan di M-07. |
| M-09 | BR-030 (pemblokiran pemohon) ditegakkan saat pengajuan reservasi di M-07/M-08, namun aturannya dimiliki modul ini karena bersumber dari kewajiban peminjaman. |
| M-11 | BR-032 (aset kembali rusak menghasilkan tiket otomatis) dimiliki M-09; modul ini adalah konsumennya. ### Ekspor P-39 — PR-06-11 Keputusan AskUserQuestion 14 Oktober 2026: POST /damage-reports/export memakai report.export + damage.view dan irisan scope melalui pipeline M-16, XLSX/PDF. Filter q/status/urgensi/building_id/room_id/category_id/pelapor/dari/sampai/ melampaui_sla dan urut identik daftar; seluruh hasil, tanpa page/per_page. Kolom: Nomor, Objek, Kode aset, Lokasi, Pelapor, Urgensi, Status, Dilaporkan WIB, Diverifikasi WIB, Batas SLA WIB, Melewati SLA. Objek ruangan tetap dapat diekspor; status/SLA mengikuti perhitungan daftar kanonik. Tanpa deskripsi, foto/dokumen atau nilai finansial. Batas XLSX100000/PDF5000 tanpa truncation, kop/filter/ pencetak, HTTP202, file24jam/URL5menit, NT-42 dan REPORT_EXPORTED mengikuti M-16. Cakupan teknisi mengikuti penugasan, sedangkan report.export own juga mensyaratkan pelapor = pengguna. Tidak ada perluasan izin lewat ekspor. |
| M-15 | Rincian isi tiap kartu dashboard berada di `04-frontend/dashboards.md` karena bersifat spesifikasi antarmuka, bukan aturan bisnis. |
| M-16 | Periode tanggal mulai/selesai inklusif WIB, bawaan 30 hari terakhir dari Clock, maksimum 366 hari untuk permintaan laporan. Pembanding adalah periode tepat sebelumnya dengan jumlah hari sama. Rentang lebih panjang disiapkan melalui kontrak ekspor PR-06-08; belum diproses oleh fondasi ini. |
| M-16 | report.view wajib bersama permission baca setiap domain yang digunakan. Scope diterapkan di SQL sebelum GROUP BY/count/window/pagination. report.export nanti menjadi irisan tambahan; tidak dapat memperluas report.view/domain. Siswa/OSIS R-07 tetap ditolak meskipun diberi report.view. SYSTEM tidak dipakai untuk membaca laporan pengguna; worker ekspor harus memuat ulang hak pemohon. |
| M-16 | Own subjek: aset berdasarkan penanggung_jawab_id; reservasi pemohon_id; peminjaman peminjam_id; kerusakan pelapor_id; maintenance teknisi_id; pengadaan/penghapusan pengusul_id; konsumsi bahan pemohon permintaan asal. Scope report own mengikuti subjek laporan. Scope domain pada dimensi join tetap diberlakukan: pinjaman sendiri boleh atas aset milik orang lain jika asset.view all; jika asset.view own, irisan tetap mempersempit hasil. |
| M-16 | Tanpa asset.view_financial, nilai perolehan/sumber perolehan tidak di-SELECT. Scope finansial own hanya membuka kolom jika seluruh baris aset yang dipilih sudah dibatasi kepada pemanggil; selainnya kolom dihilangkan seluruhnya. Laporan biaya membutuhkan maintenance.view_cost. Scope assigned/restricted tanpa definisi ditolak, tidak jatuh ke all. |
| M-16 | Katalog memuat delapan jenis FR-16.1, sesuai izin. Penyedia yang belum tersedia ditandai BELUM_TERSEDIA dan GET laporannya menghasilkan 503 SERVICE_NOT_READY. Fondasi tidak mengembalikan angka nol untuk perhitungan yang belum dibuat. Jenis teknis: kondisi-aset, pemanfaatan-fasilitas, biaya-pemeliharaan, tren-kerusakan, aktivitas-peminjaman, konsumsi-bahan, kebutuhan-pengadaan, rekapitulasi-aset. Jenis tidak dikenal/parameter tidak sah menghasilkan 400. Parameter: tanggal_mulai/tanggal_selesai (keduanya atau tidak keduanya), page (bawaan 1, maksimum 1000000), per_page (25, maksimum 100), sort (key kolom dengan awalan minus untuk menurun), bandingkan=true/false, room_id/category_id dan work_unit_id/requester_role untuk jenis yang mendukungnya. Filter yang belum relevan pada suatu jenis ditolak 422. Urutan tanggal terbalik atau >366 hari juga 422. Rentang eksplisit tidak diasumsikan hanya masa lalu oleh kerangka; makna peristiwa/tanggal setiap laporan dipastikan pada PR perhitungan domain. Respons daftar tetap success/data/meta. Tambahan report berisi jenis/judul, periode/filter yang diterapkan, zona waktu, waktu Clock, metadata kolom tabel serta ringkasan, ringkasan utama dan pembanding nullable. DECIMAL dikirim sebagai string tanpa notasi eksponen, bukan float mata uang. Total adalah jumlah grup terlihat sebelum pagination, bukan jumlah seluruh data sekolah. Halaman di luar batas tetap mempertahankan total terlihat dengan data kosong. Seluruh respons private/no-store. Tidak ada cache bersama lintas scope. Kontrak body ekspor XLSX/PDF tersedia tanpa page/per_page; route/worker/NT-42 serta pencatatan REPORT_EXPORTED tetap PR-06-08. ### Keputusan pengguna PR-06-03/04/05/06/07 — 14 Oktober 2026 Enam jawaban AskUserQuestion melengkapi FR-16.1: |
| M-16 | Utilisasi memakai pemakaian terealisasi (reservasi Berlangsung/Selesai dan peminjaman nyata). Slot tentatif/batal tidak dihitung. Jam operasional pada hari kerja, selain libur, menjadi pembagi. Interval dipotong pada periode, jam operasional dan Clock; interval tumpang tindih satu objek digabung. Pembagi nol menghasilkan persentase null, bukan 0%. Kalender operasional yang berlaku sekarang digunakan karena belum ada versi kalender historis. |
| M-16 | Tren kondisi adalah snapshot akhir tiap bulan/akhir periode berdasarkan asset_condition_history, untuk aset yang sudah tercatat pada batas itu. Penghapusan/pemulihan diperhitungkan pada waktunya. Kategori, lokasi dan penanggung jawab/scope menggunakan data sekarang; keterbatasan ini dijelaskan. Aset yang dihapus setelah suatu periode tetap terhitung pada periode tersebut. |
| M-16 | Keterlambatan mengikuti BR-028/029 dan implementasi operasional: kebijakan tiap pinjaman, bukan selalu hari kerja. Libur/nonoperasional dikecualikan hanya bila snapshot mengaturnya. Unit yang kembali sebagian dihitung masing-masing; perpanjangan disetujui diperhitungkan, termasuk hari terakumulasi sebelumnya. |
| M-16 | Biaya aktual hanya WO Selesai dan terverifikasi, pada tanggal verifikasi; estimasi dan WO menunggu verifikasi tidak menjadi realisasi. Setiap baris tetap menunjuk nomor WO agar dapat direkonsiliasi. |
| M-16 | Kebutuhan pengadaan memakai rusak berat dan umur teknis yang dapat dihitung. Permintaan tidak terpenuhi ditandai BELUM_TERUKUR/null, bukan angka nol; penolakan atau pembatalan tidak diasumsikan sebagai kekurangan aset. |
| M-16 | Batch melengkapi delapan jenis yang sudah ada, termasuk Konsumsi Bahan. Pengadaan/penghapusan menjadi ringkasan tambahan pada laporan terkait, hanya bila izin domain dan irisan scope memungkinkan. Tanpa izin, kolom/ringkasan tersebut tidak dipilih SQL. Ekspor, indeks baru dan UI tetap PR-06-08/09/10. Periode peminjaman berdasarkan tanggal pinjam; kepatuhan memakai unit kembali normal sampai batas periode/Clock. Hilang dipisahkan dari unit kembali normal. Tren kerusakan memakai kohor tiket yang dibuat pada periode, termasuk objek ruangan; rata-rata penyelesaian hanya tiket kohor yang selesai pada batas itu. Konsumsi memakai PENGELUARAN dari penyerahan nyata (tanggal_serah WIB), bukan jumlah diminta/disetujui, penerimaan, penyesuaian atau opname. Satuan berbeda tidak dijumlahkan menjadi satu total jumlah. Nama/role/unit kerja dimensi pemohon adalah data saat ini. Metode frekuensi stok minimum dikukuhkan pada jawaban tambahan AskUserQuestion di bawah; ambang historis yang tidak tersedia tidak boleh diklaim telah direkonstruksi. Rekap aset adalah populasi tercatat selama periode atau masih aktif pada awal periode, beserta kondisi akhir dan tanggal penghapusan/pemulihan. Nilai finansial hanya dipilih bila asset.view_financial mengizinkan seluruh baris terlihat. Laporan baca tidak menulis data operasional maupun menerbitkan audit ekspor. Filter work_unit_id/requester_role pada Kebutuhan Pengadaan belum tersedia karena keduanya hanya bermakna pada indikator permintaan tak terpenuhi yang belum terukur. Katalog jenis ini mengiklankan filter lokasi/kategori saja dan menolak filter pemohon; report.view/reservation.view/asset.view tetap menjadi gerbang fondasinya. Jawaban tambahan AskUserQuestion (14–15 Oktober 2026) mengonfirmasi: rekonstruksi seluruh ledger per jenis menurut ID transaksi dan bandingkan saldo total sebelum/sesudah terhadap minimum sekarang. Label AMBANG_SAAT_INI membedakannya dari kejadian notifikasi/ambang historis. Jika scope atau filter pemohon membatasi data, frekuensi global null/TIDAK_TERSEDIA_PADA_SCOPE dan SQL tidak membaca ledger global. Frekuensi per jenis/periode tidak dijumlahkan ulang per baris lokasi. Ringkasan pengadaan memakai kohor usulan menurut tanggal dibuat; status selesai adalah status sekarang. Aset dari pengadaan memakai tanggal registrasi. Filter kategori berlaku pada aset/usulan aset; kategori aset pada Pemanfaatan Fasilitas mengeluarkan baris ruangan yang tidak memiliki kategori aset. ### Ekspor PR-06-08/11 — keputusan AskUserQuestion 14–15 Oktober 2026 Semua ekspor analitik dan daftar reservasi/kerusakan memakai HTTP 202, job report_exports dan outbox ExportRequested. Penghitungan/render/PUT hanya worker; API tidak merender file. XLSX maksimal 100.000 baris, PDF 5.000 baris, termasuk seluruh hasil filter tanpa page/per_page. Worker membaca limit+1 sebagai sentinel: kelebihan menjadi GAGAL dengan instruksi mempersempit filter, tanpa pemotongan. Rentang analitik paling lama lima tahun kalender inklusif (akhir sebelum ulang tahun kelima tanggal mulai); tampilan langsung tetap maksimal 366 hari. Tanggal bawaan dibekukan saat pengajuan; pemrosesan memakai Clock dan WIB. POST /analytics/{jenis}/export, /reservations/export dan /damage-reports/export memerlukan report.export dan Idempotency-Key UUIDv4. Body {format:XLSX|PDF, filter:{...}} strict. Izin baca domain wajib; analitik juga report.view. Scope report.export beririsan dengan scope baca, tidak memperluasnya. Operasional memakai filter/urutan kanonik P-30/P-39: reservasi own = pemohon; kerusakan own = pelapor, cakupan teknisi mengikuti penugasan M-11; report.export own menambah syarat pelapor milik sendiri. Scope domain tanpa aturan ditolak. R-07 dan SYSTEM bukan pemohon ekspor. Status/file hanya bagi pemohon, juga untuk Administrator. GET /report-exports menampilkan maksimal 25 job terbaru milik pemohon. GET /report-exports/{id} memeriksa akses sekarang. GET /report-exports/{id}/download mengembalikan URL privat, nama file dan expires_at. Ketiga GET memerlukan report.export, no-store. Identitas/izin dibaca ulang langsung dari SQL saat pengajuan, sebelum/sesudah pemrosesan, serta saat status/unduh. Hash role/version/ permission×scope dan himpunan baris dalam cakupan own/assigned/restricted membuat file lama tidak dapat diunduh ketika akses berubah; pengguna membuat ekspor ulang. Riwayat daftar tidak menampilkan jumlah baris yang belum diperiksa ulang. Status: MENUNGGU ? BERJALAN ? SIAP/GAGAL/DIBATALKAN. File SIAP tersedia 24 jam sejak selesai. URL berlaku paling lama lima menit, dibatasi sisa umur file; URL yang sudah terbit dapat berlaku hingga batas tersebut. Cleanup worker tiap 15 menit menghapus objek kedaluwarsa/terminal, melepas registri file ke lifecycle M-06 dan menyimpan tombstone pembersihan agar kegagalan storage dapat dicoba ulang. Metadata job/audit tetap dipertahankan, byte dan URL tidak dimasukkan notifikasi. REPORT_EXPORT adalah owner_type khusus keluaran renderer terpercaya, bukan jenis presign unggahan pengguna. XLSX tidak membuat formula dari teks input; DECIMAL tetap teks presisi, NUMBER/BOOLEAN tetap bertipe. PDF meng-escape HTML, menonaktifkan JavaScript/jaringan lewat renderer bersama, memuat kop, filter, periode, waktu cetak WIB, pencetak dan ringkasan/pembanding. Parameter sekolah.nama wajib diisi sebelum PDF; sekolah.npsn/alamat opsional. XLSX tetap tersedia tanpa kop terisi. Konfigurasi identitas melalui Pengaturan, tanpa nama sekolah buatan. Satu job yang berhasil menghasilkan satu REPORT_EXPORTED (jenis, filter, format, baris, file_id) dan satu ExportReady ? NT-42 in-app/push sesuai preferensi. REPORT_EXPORT_REQUESTED mencatat pengajuan. Replay idempoten tidak menggandakan job/file/audit/notifikasi; kunci juga diikat pada actor/endpoint. Kegagalan PUT atau transaksi akhir dikompensasi; retry memakai object key/job yang sama. |
| M-17 | Katalog notifikasi NT-01…NT-51 tidak berada di modul ini; setiap baris dimiliki modul yang menerbitkan event-nya. Indeks lengkap digenerate di [`_generated/notifications-index.md`](../_generated/notifications-index.md). |
| M-18 | Daftar aksi yang wajib dicatat tersebar ke modul penerbitnya. Indeks lengkap digenerate di [`_generated/activity-log-index.md`](../_generated/activity-log-index.md). |
| M-22 | Ambang memakai **jumlah per jenis bahan**, dijumlahkan lintas lokasi. Administrator wajib mengisi batas bawaan M-20 dan boleh memasang override jenis bahan. Tepat di batas langsung Disetujui tanpa instance M-10; melewati salah satu batas masuk aturan aktif M-10 yang cocok atau fallback Petugas. Nilai uang tidak dipakai tanpa harga referensi sah. |
| M-22 | Pengajuan dan persetujuan tidak menahan stok. Pengajuan memeriksa saldo lokasi; penyerahan memeriksa ulang dalam transaksi dengan row lock. Jumlah disetujui per baris hanya dapat tetap/berkurang pada level berikutnya. Jumlah aktual tidak melebihi sisa disetujui maupun saldo. Seluruh baris satu penyerahan commit/rollback bersama. |
| M-22 | Guru/Staf/Teknisi melihat permintaan sendiri. Petugas/Admin/Pimpinan melihat seluruhnya dengan izin operasional/approval berscope all; pembaca lain tidak mendapat perluasan hanya karena material.view all. Pemutus sah dapat membuka konteks langkah aktif; peserta keputusan/delegasi mempertahankan akses riwayat miliknya melalui penjaga M-10. Revisi oleh pemohon pada Perlu Revisi sebelum penyerahan membentuk siklus baru menggunakan ambang terkini; snapshot lama immutable. |
| M-22 | Pemohon/Admin dapat membatalkan sebelum penyerahan, alasan wajib. Sesudah sebagian diserahkan hanya Petugas dengan material.issue dapat menutup sisa, alasan wajib; histori tidak dihapus. Bahan tidak masuk pinjaman/pengembalian/denda. |
| M-22 | Item pengadaan BAHAN wajib memilih master aktif sejak pengajuan, satuan master tanpa konversi. Penerimaan membutuhkan procurement.receive dan material.receive serta bukti M-14 yang sama. Penerimaan langsung membutuhkan tanggal WIB tidak mendatang, nomor dokumen dan minimal satu dokumen milik pengunggah yang terkonfirmasi CLEAN. Penyesuaian TAMBAH/KURANG memakai material.adjust langsung, jumlah/lokasi/alasan wajib, ledger immutable. |
| M-22 | NT-49 wajib kepada Petugas/Admin hanya pada transaksi penurunan bahan aktif yang menembus total > minimum menjadi <= minimum (minimum > 0). Tidak berulang saat sudah rendah; pulih di atas minimum mengaktifkan kembali peringatan. Audit, perubahan saldo dan outbox atomik. NT-50/51 mengikuti preferensi dan deduplikasi event. Dashboard Petugas/Admin menampilkan saldo menipis dengan drilldown ke bahan. Permintaan memakai nomor PMB, item unik per jenis/lokasi/siklus, jumlah bulat positif. Detail menyimpan nama/satuan/lokasi snapshot; siklus menyimpan ambang efektif dan items. GET daftar memakai tab AKTIF/SELESAI/SEMUA, status, q, saya, page/per_page. Semua write membutuhkan Idempotency-Key. Berita penerimaan langsung dibuka melalui GET receipts; bukti pengadaan melalui referensi kartu stok ke detail pengadaan. URL hanya untuk CLEAN. |

---

Ringkasan: **69 FR** · **122 BR** · **27 open issue** · seluruhnya berstatus awal `Not Started`.
