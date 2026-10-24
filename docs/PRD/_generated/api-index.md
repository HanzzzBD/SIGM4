<!-- DIGENERATE OTOMATIS oleh scripts/gen_indexes.py — JANGAN SUNTING BERKAS INI.
     Sumber kebenaran setiap baris ada di berkas modul terkait (docs/02-modules/).
     Menyunting di sini akan hilang saat regenerasi berikutnya. -->

# Indeks Endpoint API

> Setiap endpoint dimiliki satu modul. Konvensi umum di `../03-architecture/api-conventions.md`.
> Total: **287** baris, dikumpulkan dari 22 berkas modul.

| Method | Endpoint | Permission | Deskripsi | Pemilik |
|---|---|---|---|---|
| DELETE | `/asset-categories/{id}` | `category.manage` | Hapus kategori yang tidak dipakai | [M-04](../02-modules/m04-assets.md) |
| DELETE | `/assets/{id}/documents/{docId}` | `asset_document.manage` | Hapus dokumen dari aset (A2): melepas tautan aset ini; tautan terakhir → dokumen dihapus, berkas dipertahankan | [M-06](../02-modules/m06-documents.md) |
| DELETE | `/auth/sessions/{id}` | Bearer | Mencabut satu sesi milik pengguna sendiri | 204 | 400, 401, 403 | [M-01](../02-modules/m01-auth.md) |
| DELETE | `/chat/sessions/{id}` | `chat.use` | Hapus isi sesi sendiri; statistik anonim tetap | [M-19](../02-modules/m19-chatbot.md) |
| DELETE | `/device-tokens/{token}` | `notification.manage_own` | Cabut token perangkat | [M-17](../02-modules/m17-notifications.md) |
| DELETE | `/holidays/{id}` | `setting.manage` | Hapus hari libur | [M-20](../02-modules/m20-settings.md) |
| DELETE | `/material-categories/{id}` | `material.manage` | Hapus kategori yang belum dipakai bahan | [M-22](../02-modules/m22-materials.md) |
| DELETE | `/materials/{id}/request-threshold` | `setting.manage` | Kembali ke batas bawaan, body kosong | [M-20](../02-modules/m20-settings.md) |
| DELETE | `/work-orders/{id}/photos/{fileId}` | `workorder.execute` | Lepas bukti sebelum pengajuan penyelesaian, termasuk foto gagal scan | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/academic-years` | `setting.view` | Daftar tahun ajaran beserta semesternya (Lampiran E.2) | [M-20](../02-modules/m20-settings.md) |
| GET | `/activity-logs/export` | `activity_log.export` | Ekspor log | [M-18](../02-modules/m18-activity-log.md) |
| GET | `/activity-logs/{id}` | `activity_log.view` | Detail satu entri beserta nilai sebelum/sesudah (`FR-18.2` langkah 4); akses tercatat `ACTIVITY_LOG_VIEWED` | [M-18](../02-modules/m18-activity-log.md) |
| GET | `/activity-logs` | `activity_log.view` | Telusuri activity log | [M-18](../02-modules/m18-activity-log.md) |
| GET | `/analytics/{jenis}/options` | `report.view` | Pilihan filter tersaring scope | [M-16](../02-modules/m16-analytics.md) |
| GET | `/analytics/{jenis}` | `report.view` | Data laporan analitik | [M-16](../02-modules/m16-analytics.md) |
| GET | `/analytics` | `report.view` | Katalog jenis laporan sesuai izin dan kesiapan penyedia | [M-16](../02-modules/m16-analytics.md) |
| GET | `/approval-rules` | `approval_rule.view` | Daftar aturan | [M-10](../02-modules/m10-approval.md) |
| GET | `/approvals/pending` | `approval.decide` | Pengajuan menunggu keputusan saya, terurut tenggat SLA lalu waktu pengajuan; tiap baris membawa sisa SLA langkah dalam **menit kerja** dan penanda terlambat (CAL-01) — bahan urgensi P-37 | [M-10](../02-modules/m10-approval.md) |
| GET | `/approvals/{id}/history` | `approval.view` | Linimasa persetujuan | [M-10](../02-modules/m10-approval.md) |
| GET | `/asset-categories` | `asset.view` | Daftar kategori | [M-04](../02-modules/m04-assets.md) |
| GET | `/asset-disposals/candidates` | `disposal.create` | Kandidat dan penghalang otomatis, paginasi | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-disposals/export/pdf` | `disposal.view` | Rekap PDF dengan penyaringan finansial | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-disposals/export/xlsx` | `disposal.view` | Rekap snapshot dieksekusi sesuai filter | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-disposals/options` | `disposal.view` | Filter kategori dan lokasi aktif | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-disposals/{id}/report` | `disposal.view` | Unduh berita acara penghapusan PDF | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-disposals/{id}` | `disposal.view` | Snapshot, bukti CLEAN dan status keputusan | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-disposals` | `disposal.view` | Daftar & arsip penghapusan | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-documents` | `asset_document.view` | Daftar lintas aset terpagina untuk P-26; satu baris per tautan dokumen-aset aktif | [M-06](../02-modules/m06-documents.md) |
| GET | `/assets/availability` | `reservation.view` | Ketersediaan unit aset pada rentang waktu | [M-08](../02-modules/m08-reservation-item.md) |
| GET | `/assets/by-uuid/{uuid}` | `asset.view` | Detail aset dari hasil scan QR | [M-05](../02-modules/m05-qr.md) |
| GET | `/assets/export` | `asset.export` | Ekspor XLSX/PDF | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/exports/{id}/download` | `asset.export` | URL privat berkas siap setelah pemeriksaan ulang izin dan scope | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/exports/{id}` | `asset.export` | Status pekerjaan ekspor katalog milik pemanggil | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/exports` | `asset.export` | 25 pekerjaan ekspor katalog terbaru milik pemanggil; juga mensyaratkan `asset.view`, izin dibaca ulang dari data pengguna saat ini | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/import/template` | `asset.create` | Unduh template XLSX E.5.1 beserta contoh (`IMPT-05`) | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/import/{id}` | `asset.create` | Status, hitungan baris sukses/gagal, unit dibuat, alasan dan isian asli baris gagal untuk koreksi (`IMPT-02`); hanya pengunggah | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/movements/{id}/document/download` | `asset_movement_document.view` | URL privat PDF siap, berlaku 15 menit; setiap penerbitan diaudit | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/movements/{id}/document` | `asset_movement_document.view` | Status dan data tetap berita acara satu operasi mutasi | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/{id}/documents/{docId}/download` | `asset_document.view` | URL unduhan bertanda tangan | [M-06](../02-modules/m06-documents.md) |
| GET | `/assets/{id}/documents` | `asset_document.view` | Daftar dokumen aset beserta status pemindaian (tab Dokumen, langkah 1) | [M-06](../02-modules/m06-documents.md) |
| GET | `/assets/{id}/photos` | `asset.view` | Foto aset terpaginasi (page/per_page, maksimum 100), scope sama dengan detail; metadata id/file_id/urutan/is_primary/status; URL medium/thumbnail 15 menit hanya setelah berkas terkonfirmasi CLEAN, tanpa object key tersendiri atau identitas pengunggah (keputusan pemilik produk 12 Oktober 2026, PR-05-32) | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/{id}/service-history` | `asset.view` | Riwayat servis; juga mensyaratkan workorder.view, scope penugasan dan penyamaran biaya | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/assets/{id}/timeline` | `asset.view` | Linimasa riwayat aset terpaginasi: kondisi, mutasi, dan riwayat yang diisi modul lain (peminjaman, pemeliharaan, kerusakan, dokumen) — jenis sensitif disembunyikan bagi scope `restricted` (FR-04.2 langkah 5, A1) | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/{id}` | `asset.view` | Detail aset — identitas lengkap, QR, kategori & lokasi (FR-04.2 langkah 5) | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets` | `asset.view` | Daftar aset (filter & pencarian); tiap item membawa nama kategori dan lokasi (ruang, gedung) | [M-04](../02-modules/m04-assets.md) |
| GET | `/audit-sessions/mine` | `audit.execute` | Sesi penugasan saya | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/options` | `audit.manage` | Pilihan cakupan dan pelaksana aktif | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/context` | `audit.execute` | Kategori untuk temuan baru, khusus pelaksana | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/export` | `audit.view` | XLSX hasil disetujui dan dibekukan | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/findings` | `audit.view` | Temuan baru berhalaman | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/items` | `audit.execute` | Daftar aset target (filter lokasi) | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/material-items` | `audit.execute` | Target hitungan Bahan per lokasi, khusus pelaksana sesi | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/material-resolve` | `audit.execute` | Cari UUID jenis Bahan di lokasi target sesi | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/material-results` | `audit.view` | Hitungan/selisih Bahan sesuai scope, berhalaman | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/photos` | `audit.view` | Bukti berhalaman, URL sementara hanya CLEAN | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/report` | `audit.view` | Unduh berita acara PDF | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/resolve` | `audit.execute` | Pencarian kode persis/UUID dalam snapshot | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/results` | `audit.view` | Hasil pemeriksaan/selisih berhalaman | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}` | `audit.view` | Detail/progres dan kesiapan rekonsiliasi | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions` | `audit.view` | Daftar sesi dan progres berhalaman | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/auth/2fa/status` | Bearer | Status 2FA dan jumlah kode cadangan sendiri tanpa rahasia | 200 `{aktif,diaktifkan_pada,sisa_kode_cadangan,kode_cadangan_menipis}` | 401, 403 | [M-01](../02-modules/m01-auth.md) |
| GET | `/auth/password/requests` | `user.reset_password` | Antrean permintaan reset (filter status; memuat identitas pemohon untuk verifikasi luring) | 200 daftar terpaginasi | 401, 403 | [M-01](../02-modules/m01-auth.md) |
| GET | `/auth/sessions` | Bearer | Daftar sesi (perangkat) aktif milik pengguna | 200 `[{id, platform, ip, user_agent, dibuat_pada, terakhir_diperbarui, berlaku_sampai, saat_ini}]` | 401 | [M-01](../02-modules/m01-auth.md) |
| GET | `/chat/monitor` | `chat.monitor` | Statistik anonim dan sesi dilaporkan | [M-19](../02-modules/m19-chatbot.md) |
| GET | `/chat/reports/{id}` | `chat.monitor` | Isi sesi hanya setelah izin eksplisit pengguna; khusus Administrator (R-01) — Pimpinan hanya metrik agregat `/chat/monitor` | [M-19](../02-modules/m19-chatbot.md) |
| GET | `/chat/sessions/{id}` | `chat.use` | Riwayat sesi sendiri berhalaman | [M-19](../02-modules/m19-chatbot.md) |
| GET | `/chat/sessions` | `chat.use` | Riwayat percakapan sendiri | [M-19](../02-modules/m19-chatbot.md) |
| GET | `/chat/usage` | `chat.use` | Kuota/token akun sendiri dan waktu reset WIB | [M-19](../02-modules/m19-chatbot.md) |
| GET | `/damage-reports/open` | `damage.view` | Tiket terbuka untuk aset atau ruangan tertentu (`asset_id` atau `room_id`) — ringkasan tanpa identitas pelapor, juga bagi scope `own` (FR-11.1 A1) | [M-11](../02-modules/m11-damage-reports.md) |
| GET | `/damage-reports/{id}` | `damage.view` | Detail tiket beserta foto (foto yang unggahannya tertunda ditandai) dan garansi aktif aset (`BR-052`, bagi pemegang `asset_document.view`); scope `own` = tiket milik sendiri | [M-11](../02-modules/m11-damage-reports.md) |
| GET | `/damage-reports` | `damage.view` | Daftar tiket (tersaring sesuai role; scope `own` = tiket milik sendiri, A1) — saringan langkah 3 (status, urgensi, gedung/ruangan, kategori aset, rentang tanggal lapor, pelapor, `melampaui_sla`), jumlah per status (langkah 2), dan `batas_sla` + `melampaui_sla` per tiket (langkah 4) | [M-11](../02-modules/m11-damage-reports.md) |
| GET | `/dashboard/cards/{id}` | `dashboard.view` + permission kartu | Data satu kartu (rentang, muat ulang); kartu di luar templat role atau permission ditolak | [M-15](../02-modules/m15-dashboard.md) |
| GET | `/dashboard` | `dashboard.view` | Manifes kartu dashboard sesuai role pengguna — tanpa data; kartu di luar permission tidak tercantum | [M-15](../02-modules/m15-dashboard.md) |
| GET | `/fines/export` | `report.export` | Ekspor rekap kewajiban tersaring scope ke XLSX/PDF | [M-09](../02-modules/m09-loans.md) |
| GET | `/fines/filter-options` | `fine.view` | Pilihan peminjam berkewajiban dalam scope | [M-09](../02-modules/m09-loans.md) |
| GET | `/fines/{id}` | `fine.view` | Rincian kewajiban, sisa tagihan dan riwayat tindakan | [M-09](../02-modules/m09-loans.md) |
| GET | `/fines` | `fine.view` | Daftar denda | [M-09](../02-modules/m09-loans.md) |
| GET | `/health/live` | publik | Liveness probe — tanpa memeriksa dependensi (`OBS-04`) | [M-20](../02-modules/m20-settings.md) |
| GET | `/health/ready` | publik | Readiness probe — DB, Redis, storage siap | [M-20](../02-modules/m20-settings.md) |
| GET | `/health` | `setting.view` | Ringkasan kesehatan dependensi untuk kartu Kesehatan Integrasi (`OBS-06`) | [M-20](../02-modules/m20-settings.md) |
| GET | `/holidays` | `setting.view` | Daftar hari libur (filter tahun ajaran) | [M-20](../02-modules/m20-settings.md) |
| GET | `/loan-extensions/{id}` | `approval.view` | Konteks perpanjangan setelah otorisasi pembaca instance | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/borrowers` | `loan.manage` | Pemilih peminjam aktif, nama/role, berpaginasi; scope selain all hanya diri sendiri | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/by-asset/{uuid}` | `loan.manage` | Peminjaman aktif atas suatu unit | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/export` | `report.export` | Ekspor daftar peminjaman tersaring scope ke XLSX/PDF | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/filter-options` | `loan.view` | Pilihan peminjam/kategori yang mempunyai transaksi dalam scope | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/ready-checkout` | `loan.manage` | Reservasi siap diserahkan hari ini | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/units/resolve` | `loan.manage` | Verifikasi kode aset atau UUID: identitas minimum, kondisi dan kelayakan; tanpa nilai finansial | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/{id}` | `loan.view` | Detail dan bukti privat peminjaman, tersaring scope peminjam | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans` | `loan.view` | Daftar peminjaman (tab aktif/terlambat/selesai) | [M-09](../02-modules/m09-loans.md) |
| GET | `/locations/tree` | `location.view` | Pohon lokasi lengkap | [M-03](../02-modules/m03-locations.md) |
| GET | `/maintenance-schedules/assets` | `maintenance.manage` | Pemilih aset kategori, 100 aset per halaman | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/maintenance-schedules/options` | `maintenance.manage` | Kategori beserta usulan interval preventif dan Teknisi aktif | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/maintenance-schedules/{id}/work-orders` | `maintenance.manage` | WO yang diterbitkan jadwal, 20 per halaman | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/maintenance-schedules/{id}` | `maintenance.manage` | Detail jadwal, checklist, teknisi, jatuh tempo berikutnya | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/maintenance-schedules` | `maintenance.manage` | Daftar berhalaman; filter status dan jatuh tempo dalam jumlah hari | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/material-categories` | `material.view` | Daftar kategori bahan | [M-22](../02-modules/m22-materials.md) |
| GET | `/material-requests/{id}` | `material.view` | Detail scope, siklus approval dan histori penyerahan | [M-22](../02-modules/m22-materials.md) |
| GET | `/material-requests` | `material.view` | Daftar permintaan bahan | [M-22](../02-modules/m22-materials.md) |
| GET | `/material-units` | `setting.view` | Daftar satuan Bahan beserta status | [M-20](../02-modules/m20-settings.md) |
| GET | `/materials/by-uuid/{uuid}` | `material.view` | Detail jenis bahan dari QR privat; wajib login | [M-22](../02-modules/m22-materials.md) |
| GET | `/materials/options` | `material.view` | Pilihan kategori, satuan dan ruangan beserta status | [M-22](../02-modules/m22-materials.md) |
| GET | `/materials/{id}/receipts` | `material.view` | Bukti penerimaan langsung, pagination dan URL dokumen CLEAN | [M-22](../02-modules/m22-materials.md) |
| GET | `/materials/{id}/request-threshold` | `setting.view` | Batas bawaan, override dan batas efektif | [M-20](../02-modules/m20-settings.md) |
| GET | `/materials/{id}/transactions` | `material.view` | Kartu stok — riwayat transaksi | [M-22](../02-modules/m22-materials.md) |
| GET | `/materials/{id}` | `material.view` | Detail bahan beserta saldo per lokasi | [M-22](../02-modules/m22-materials.md) |
| GET | `/materials` | `material.view` | Daftar bahan + saldo (filter kategori, lokasi, status stok) | [M-22](../02-modules/m22-materials.md) |
| GET | `/me` | Bearer | Profil & permission pengguna; foto profil sebagai `foto_status` + `foto_url` (URL hanya bila berkas `CLEAN`, `SDD-FS-03`) | 200 `{user, permissions}` | 401 | [M-01](../02-modules/m01-auth.md) |
| GET | `/notifications/preferences` | `notification.manage_own` | Baca preferensi notifikasi sendiri (enam kelompok × dua kanal) | [M-17](../02-modules/m17-notifications.md) |
| GET | `/notifications/stream` | `notification.manage_own` | Aliran notifikasi real-time via SSE (NTF-01) | [M-17](../02-modules/m17-notifications.md) |
| GET | `/notifications` | `notification.manage_own` | Daftar notifikasi pengguna | [M-17](../02-modules/m17-notifications.md) |
| GET | `/permissions` | `role.view` | Katalog permission (kode, modul, aksi, deskripsi, penanda inti 🔒) untuk matriks | [M-02](../02-modules/m02-users.md) |
| GET | `/procurements/options` | `procurement.view` | Kategori aset dan unit kerja aktif | [M-14](../02-modules/m14-procurement.md) |
| GET | `/procurements/{id}/review` | `procurement.approve` | Konteks pemutus langkah aktif; juga memerlukan `approval.decide` | [M-14](../02-modules/m14-procurement.md) |
| GET | `/procurements/{id}` | `procurement.view` | Detail usulan sesuai scope | [M-14](../02-modules/m14-procurement.md) |
| GET | `/procurements` | `procurement.view` | Daftar usulan | [M-14](../02-modules/m14-procurement.md) |
| GET | `/public/assets/{uuid}` | Publik | Info dasar aset untuk scan kamera bawaan | [M-05](../02-modules/m05-qr.md) |
| GET | `/public/qr/config` | Publik | Domain resmi `APP_BASE_URL` yang sama dengan pencetak PDF, untuk validasi origin oleh pemindai (FR-05.1/FR-05.2) | [M-05](../02-modules/m05-qr.md) |
| GET | `/report-exports/{id}/download` | `report.export` | URL privat maksimal5menit | [M-16](../02-modules/m16-analytics.md) |
| GET | `/report-exports/{id}` | `report.export` | Status dengan revalidasi akses | [M-16](../02-modules/m16-analytics.md) |
| GET | `/report-exports` | `report.export` | 25 job terbaru milik pemohon; izin pemanggil dibaca ulang dari data pengguna saat ini (bukan dari sesi), Siswa (R-07) tidak, scope `report.export` own/all | [M-16](../02-modules/m16-analytics.md) |
| GET | `/reservations/{id}` | `reservation.view` | Detail reservasi + riwayat approval: tanggal turunan, penggunaan, aksi yang tersedia bagi pemanggil, dan riwayat perubahan dari activity log (penyajiannya tercatat, `AL-10`); di luar scope → 404 | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/reservations` | `reservation.view` | Daftar reservasi (tersaring sesuai role): satu baris per pengajuan; scope `restricted` hanya miliknya sendiri | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/roles` | `role.view` | Daftar role | [M-02](../02-modules/m02-users.md) |
| GET | `/room-fixed-schedules/import/template` | `reservation.fixed_schedule` | Template CSV dengan contoh (IMPT-05) | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/room-fixed-schedules/import/{id}` | `reservation.fixed_schedule` | Laporan hanya pengunggah, status/hitungan, alasan/isian baris gagal, tenggat retensi 30 hari | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/rooms/availability` | `reservation.view` | Ketersediaan ruangan pada rentang waktu | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/rooms/{id}/assets/export` | `report.export` | Inventaris ruangan XLSX/PDF, tercatat `AL-10` | [M-03](../02-modules/m03-locations.md) |
| GET | `/rooms/{id}/assets` | `asset.view` | Daftar aset terpaginasi dan ringkasan seluruh ruangan (`FR-03.2`); `q` digabung saringan lokasi | [M-04](../02-modules/m04-assets.md) |
| GET | `/rooms/{id}/blocks` | `reservation.fixed_schedule` | Jadwal tetap & blokade manual sebuah ruangan, aktif maupun nonaktif (`FR-07.5`) | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/rooms/{id}` | `location.view` | Detail ruangan | [M-03](../02-modules/m03-locations.md) |
| GET | `/settings` | `setting.view` | Baca parameter sistem | [M-20](../02-modules/m20-settings.md) |
| GET | `/users/import/template` | `user.create` | Unduh template XLSX E.5.2 beserta petunjuk dan contoh isian (`IMPT-05`) | [M-02](../02-modules/m02-users.md) |
| GET | `/users/import/{id}` | `user.create` | Status dan laporan per baris sebuah pekerjaan impor (`IMPT-02`) | [M-02](../02-modules/m02-users.md) |
| GET | `/users/{id}` | `user.view` | Detail pengguna | [M-02](../02-modules/m02-users.md) |
| GET | `/users` | `user.view` | Daftar pengguna (filter role, status, unit kerja) | [M-02](../02-modules/m02-users.md) |
| GET | `/work-days` | `setting.view` | Baca hari kerja sekolah | [M-20](../02-modules/m20-settings.md) |
| GET | `/work-orders/mine` | `workorder.execute` | Work order yang ditugaskan kepada saya | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/work-orders/technicians` | `workorder.create` | Teknisi aktif dan jumlah work order aktif untuk penugasan (FR-12.1 A1) | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/work-orders/{id}` | `workorder.view` | Detail; Teknisi hanya melihat penugasannya, objek asing 404 | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/work-orders` | `workorder.view` | Daftar berhalaman sesuai scope; urut prioritas lalu target selesai | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/work-units` | `setting.view` | Daftar unit kerja (filter jenis, status) — Lampiran E.3 | [M-20](../02-modules/m20-settings.md) |
| PATCH | `/academic-years/{id}/activate` | `setting.manage` | Jadikan tahun ajaran aktif; tepat satu yang aktif (`AC-YR-02`) | [M-20](../02-modules/m20-settings.md) |
| PATCH | `/approval-rules/{id}/status` | `approval_rule.manage` | Aktifkan / nonaktifkan aturan (FR-10.1 A4); menonaktifkan wajib menyertakan `alasan` (UX-04), tercatat pada entri log | [M-10](../02-modules/m10-approval.md) |
| PATCH | `/assets/qr-terpasang` | `asset.qr_print` | Menandai label QR terpasang (atau dilepas) untuk 1–200 aset sekaligus (FR-05.1 langkah 5) | [M-05](../02-modules/m05-qr.md) |
| PATCH | `/assets/{id}/condition` | `asset.update` | Ubah kondisi + alasan | [M-04](../02-modules/m04-assets.md) |
| PATCH | `/buildings/{id}/status` · `/rooms/{id}/status` | `location.manage` | Aktifkan/nonaktifkan berjenjang (`BR-015`) | [M-03](../02-modules/m03-locations.md) |
| PATCH | `/fines/{id}/pay` | `fine.manage` | Tandai lunas | [M-09](../02-modules/m09-loans.md) |
| PATCH | `/fines/{id}/reopen` | `fine.manage` | Administrator mengoreksi status lunas beralasan | [M-09](../02-modules/m09-loans.md) |
| PATCH | `/fines/{id}/waive-compensation` | `fine.waive_compensation` | Bebaskan ganti rugi penuh/sebagian + alasan | [M-09](../02-modules/m09-loans.md) |
| PATCH | `/fines/{id}/waive` | `fine.waive` | Bebaskan denda keterlambatan + alasan | [M-09](../02-modules/m09-loans.md) |
| PATCH | `/material-units/{id}/status` | `setting.manage` | Administrator mengaktifkan/nonaktifkan satuan Bahan | [M-20](../02-modules/m20-settings.md) |
| PATCH | `/materials/{id}` | `material.manage` | Ubah data bahan | [M-22](../02-modules/m22-materials.md) |
| PATCH | `/notifications/read-all` | `notification.manage_own` | Tandai semua terbaca | [M-17](../02-modules/m17-notifications.md) |
| PATCH | `/notifications/{id}/read` | `notification.manage_own` | Tandai terbaca | [M-17](../02-modules/m17-notifications.md) |
| PATCH | `/room-fixed-schedules/{id}/status` | `reservation.fixed_schedule` | Nonaktifkan jadwal tetap; slot yang belum dimulai dilepas (A3). Aturan tidak dapat disunting — nonaktifkan lalu buat baru | [M-07](../02-modules/m07-reservation-room.md) |
| PATCH | `/room-manual-blocks/{id}/status` | `reservation.fixed_schedule` | Nonaktifkan blokade manual; slot yang belum dimulai dilepas (A3) | [M-07](../02-modules/m07-reservation-room.md) |
| PATCH | `/users/{id}/status` | `user.update` | Aktifkan/nonaktifkan | [M-02](../02-modules/m02-users.md) |
| PATCH | `/work-orders/{id}/progress` | `workorder.execute` | Perbarui catatan, checklist dan rincian biaya | [M-12](../02-modules/m12-maintenance.md) |
| PATCH | `/work-orders/{id}/start` | `workorder.execute` | Mulai kerjakan | [M-12](../02-modules/m12-maintenance.md) |
| PATCH | `/work-units/{id}/status` | `setting.manage` | Aktifkan atau nonaktifkan unit kerja; tidak ada hapus (`WU-02`) | [M-20](../02-modules/m20-settings.md) |
| POST | `/academic-years` | `setting.manage` | Buat tahun ajaran beserta semesternya; tahun ajaran pertama otomatis aktif (`AC-YR-01`) | [M-20](../02-modules/m20-settings.md) |
| POST | `/analytics/{jenis}/export` | `report.export` | Ekspor worker, HTTP202 | [M-16](../02-modules/m16-analytics.md) |
| POST | `/approval-rules/preview` | `approval_rule.manage` | Pratinjau aturan yang akan berlaku | [M-10](../02-modules/m10-approval.md) |
| POST | `/approval-rules` | `approval_rule.manage` | Buat aturan + langkah | [M-10](../02-modules/m10-approval.md) |
| POST | `/approvals/delegate` | `approval.delegate` | Tetapkan approver pengganti | [M-10](../02-modules/m10-approval.md) |
| POST | `/approvals/{id}/decide` | `approval.decide` | Setujui/tolak/minta revisi | [M-10](../02-modules/m10-approval.md) |
| POST | `/asset-categories` | `category.manage` | Buat kategori | [M-04](../02-modules/m04-assets.md) |
| POST | `/asset-disposals/{id}/cancel` | `disposal.create` | Pengusul/Admin, alasan wajib sebelum eksekusi | [M-21](../02-modules/m21-disposal.md) |
| POST | `/asset-disposals/{id}/execute` | `disposal.execute` | Catat pelaksanaan fisik & hapuskan aset | [M-21](../02-modules/m21-disposal.md) |
| POST | `/asset-disposals/{id}/report/retry` | `disposal.execute` | Ulangi worker berita acara gagal | [M-21](../02-modules/m21-disposal.md) |
| POST | `/asset-disposals` | `disposal.create` | Buat usulan penghapusan aset | [M-21](../02-modules/m21-disposal.md) |
| POST | `/assets/import` | `asset.create` | Impor CSV/XLSX (`filename`, `content_base64`): ≤200 baris sinkron, >200 asinkron; replay hash 24 jam per pengunggah (`IMPT-03/04`) | [M-04](../02-modules/m04-assets.md) |
| POST | `/assets/move` | `asset.update` | Mutasi lokasi (massal) | [M-04](../02-modules/m04-assets.md) |
| POST | `/assets/qr/print` | `asset.qr_print` | Hasilkan PDF label QR massal (1–200 aset; FR-05.1 langkah 2–4, A1) | [M-05](../02-modules/m05-qr.md) |
| POST | `/assets/{id}/documents` | `asset_document.manage` | Tautkan dokumen aset dari berkas terdaftar; `asset_ids_tambahan` untuk A3 | [M-06](../02-modules/m06-documents.md) |
| POST | `/assets/{id}/qr/regenerate` | `asset.qr_regenerate` | Regenerasi UUID aset — QR lama otomatis tidak berlaku; alasan wajib (FR-05.1 A2, UX-04) | [M-05](../02-modules/m05-qr.md) |
| POST | `/assets/{id}/reinstate` | `disposal.reinstate` | Pulihkan aset yang telah dihapuskan | [M-21](../02-modules/m21-disposal.md) |
| POST | `/assets` | `asset.create` | Buat aset (mendukung `jumlah_unit` untuk N record) | [M-04](../02-modules/m04-assets.md) |
| POST | `/audit-sessions/{id}/approve` | `audit.approve` | Setujui & terapkan penyesuaian | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/cancel` | `audit.manage` | Batalkan dengan alasan, Administrator saja | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/complete-location` | `audit.execute` | Tandai satu lokasi selesai diperiksa | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/finalize` | `audit.manage` | Hasilkan rekonsiliasi | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/findings` | `audit.execute` | Catat temuan baru dengan UUID | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/material-counts` | `audit.execute` | Catat jumlah fisik, basis saldo/ledger, versi dan UUID pemeriksaan | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/photos/{itemId}/remove` | `audit.manage` | Tarik foto gagal/belum siap dengan alasan | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/report/retry` | `audit.manage` | Antrekan ulang pembuatan PDF gagal | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/scan` | `audit.execute` | Catat hasil pemindaian | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/submit` | `audit.manage` | Kirim untuk persetujuan | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions` | `audit.manage` | Buat sesi opname | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/auth/2fa/backup-codes/regenerate` | Bearer (2FA terverifikasi) | Membuat ulang seluruh kode cadangan; yang lama, terpakai atau tidak, tak berlaku lagi | 200 `{kode_cadangan}` | 401, 403, 422 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/2fa/enroll/confirm` | Bearer | Konfirmasi pendaftaran dengan kode 6 digit; 2FA berlaku dan sesi ini naik ke `amr` `["pwd","otp"]`. Terjangkau oleh sesi yang belum lolos 2FA. Mencabut seluruh sesi lain pemilik akun (`BR-070e`) | 200 `{access_token}` (null pada WEB) | 400, 401, 422 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/2fa/enroll` | Bearer | Mulai pendaftaran 2FA: secret TOTP, URI `otpauth://`, dan 10 kode cadangan — tampil **satu kali**. Terjangkau oleh sesi yang belum lolos 2FA. Role wajib 2FA: body memuat `kode_aktivasi` (`BR-070d`) | 200 `{secret, otpauth_uri, kode_cadangan}` | 401, 422 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/2fa/verify` | Challenge token | Verifikasi faktor kedua — kode TOTP 6 digit atau kode cadangan — dengan challenge token dari login; menerbitkan sesi | 200 `{tokens, expires_in, user, permissions, sisa_kode_cadangan, kode_cadangan_menipis}` (`tokens` null pada WEB) | 400, 401, 423 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/login` | Publik | Login email + password + `platform` (`WEB`, `ANDROID`, `IOS`) | 200 `{tokens, expires_in, user, permissions}` (`tokens` null pada WEB: token hanya di cookie httpOnly) atau `{requires_2fa, challenge_token, expires_in}` (akun ber-2FA: sesi belum terbit) | 400, 401, 403, 429 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/logout-all` | Bearer | Keluar dari semua perangkat: mencabut seluruh sesi pengguna | 204 | 401 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/logout` | Bearer | Mencabut sesi yang membawa permintaan ini | 204 | 401 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/password/change` | Bearer | Ganti password sendiri | 200 | 401, 422 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/password/forgot` | Publik | Ajukan permintaan reset; jawaban netral untuk email apa pun (`FR-01.3 A1`) | 202 `{message}` | 400, 429 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/password/requests/{id}/issue` | `user.reset_password` | Terbitkan password sementara; `metode_verifikasi` wajib; password tampil **satu kali** pada respons | 200 `{permintaan, password_sementara}` | 400, 401, 403, 404, 422 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/password/requests/{id}/reject` | `user.reset_password` | Tolak permintaan; `alasan` wajib (`FR-01.3 A2`) | 200 `{permintaan}` | 400, 401, 403, 404, 422 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/refresh` | Refresh token | Menukar refresh token (rotasi; refresh token baru ikut diterbitkan, pemakaian ulang mencabut seluruh rantai) | 200 `{tokens, expires_in}` (`tokens` null pada WEB) | 401 | [M-01](../02-modules/m01-auth.md) |
| POST | `/buildings` · `/areas` · `/rooms` | `location.manage` | Buat entitas lokasi | [M-03](../02-modules/m03-locations.md) |
| POST | `/chat/messages/{id}/feedback` | `chat.use` | Beri umpan balik jawaban | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/chat/messages` | `chat.use` | Kirim pesan ke chatbot | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/chat/reports/{id}/access` | `setting.manage` | Admin R-01 membatasi/memulihkan akses chatbot pemilik sesi dilaporkan; alasan wajib | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/chat/sessions/{id}/report` | `chat.use` | Laporkan masalah dengan izin berbagi sesi | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/chat/sessions` | `chat.use` | Mulai sesi chatbot | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/class-promotions` | `user.update` | Kenaikan kelas massal: tetapkan kelas atau tandai lulus per siswa pada satu tahun ajaran (`SL-02`) | [M-02](../02-modules/m02-users.md) |
| POST | `/damage-reports/export` | `report.export` | Ekspor P-39 melalui worker M-16, irisan damage.view | [M-11](../02-modules/m11-damage-reports.md) |
| POST | `/damage-reports/{id}/notes` | `damage.create` | Tambahkan informasi ke tiket yang masih terbuka (Dilaporkan/Diverifikasi/Dalam Perbaikan): keterangan wajib + 0–5 foto milik penulis; terbuka bagi setiap pemegang `damage.create`, termasuk penemu kedua yang ditawari tiket lewat `/open` (FR-11.1 A1) | [M-11](../02-modules/m11-damage-reports.md) |
| POST | `/damage-reports/{id}/verify` | `damage.verify` | Verifikasi / tolak tiket dari status `Dilaporkan`: `keputusan` Tindak Lanjut (→ `Diverifikasi`) · Perbaikan Ringan (→ `Selesai`, catatan wajib) · Tolak (→ `Ditolak`, alasan wajib); `kondisi_aset` opsional menuntut juga `asset.update_condition` (langkah 4, A1) | [M-11](../02-modules/m11-damage-reports.md) |
| POST | `/damage-reports` | `damage.create` | Buat tiket kerusakan; `reservation_id` opsional menautkan laporan pasca-kegiatan ke reservasi ruangan yang sama berstatus Berlangsung/Selesai — hanya pemegang `reservation.record_usage` (FR-07.4 A2) | [M-11](../02-modules/m11-damage-reports.md) |
| POST | `/device-tokens` | `notification.manage_own` | Daftarkan token perangkat FCM | [M-17](../02-modules/m17-notifications.md) |
| POST | `/files/confirm` | Bearer | Daftarkan berkas terunggah & antrekan pemindaian AV | [M-06](../02-modules/m06-documents.md) |
| POST | `/files/presign` | Bearer | Minta URL unggah bertanda tangan ke object storage | [M-06](../02-modules/m06-documents.md) |
| POST | `/files/{id}/presign` | Bearer | URL unggah baru (300 detik) bagi pesanan milik pemanggil yang belum dikonfirmasi; object key, MIME dan ukuran tetap, tanpa baris baru. 200 respons presign; 404 berkas asing/tidak ada, 422 sudah dikonfirmasi | [M-06](../02-modules/m06-documents.md) |
| POST | `/fines/{id}/replacement-proposals/{proposalId}/decide` | `approval.decide` | Pimpinan memutus usulan nilai penggantian | [M-09](../02-modules/m09-loans.md) |
| POST | `/fines/{id}/replacement-proposals` | `fine.manage` | Usulkan nilai penggantian beralasan | [M-09](../02-modules/m09-loans.md) |
| POST | `/holidays` | `setting.manage` | Tambah hari libur | [M-20](../02-modules/m20-settings.md) |
| POST | `/loans/checkout` | `loan.manage` | Proses serah terima | [M-09](../02-modules/m09-loans.md) |
| POST | `/loans/{id}/checkin/preview` | `loan.manage` | Tinjauan pengembalian/kewajiban per unit tanpa efek tulis | [M-09](../02-modules/m09-loans.md) |
| POST | `/loans/{id}/checkin` | `loan.manage` | Proses pengembalian | [M-09](../02-modules/m09-loans.md) |
| POST | `/loans/{id}/extend` | `loan.extend` | Ajukan perpanjangan | [M-09](../02-modules/m09-loans.md) |
| POST | `/maintenance-schedules/{id}/deactivate` | `maintenance.manage` | Nonaktifkan dengan alasan wajib; WO yang terbit tetap berjalan | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/maintenance-schedules/{id}/skip` | `maintenance.manage` | Lewati sekali dengan alasan wajib; ditolak bila ada WO siklus terbuka | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/maintenance-schedules` | `maintenance.manage` | Buat jadwal preventif | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/material-categories` | `material.manage` | Buat kategori bahan | [M-22](../02-modules/m22-materials.md) |
| POST | `/material-requests/{id}/cancel` | `material.request` | Batalkan permintaan sebelum diserahkan | [M-22](../02-modules/m22-materials.md) |
| POST | `/material-requests/{id}/close` | `material.issue` | Tutup sisa setelah penyerahan sebagian dengan alasan | [M-22](../02-modules/m22-materials.md) |
| POST | `/material-requests/{id}/issue` | `material.issue` | Catat penyerahan bahan | [M-22](../02-modules/m22-materials.md) |
| POST | `/material-requests` | `material.request` | Ajukan permintaan bahan | [M-22](../02-modules/m22-materials.md) |
| POST | `/material-units` | `setting.manage` | Administrator menambah satuan Bahan | [M-20](../02-modules/m20-settings.md) |
| POST | `/materials/qr/print` | `material.qr_print` | PDF label untuk 1–200 jenis Bahan berbeda, tanpa kode aset; A4 3×8 / 4×10 / 2×5 | [M-05](../02-modules/m05-qr.md) |
| POST | `/materials/{id}/adjustments` | `material.adjust` | Catat penyesuaian saldo | [M-22](../02-modules/m22-materials.md) |
| POST | `/materials/{id}/receipts` | `material.receive` | Catat penerimaan bahan | [M-22](../02-modules/m22-materials.md) |
| POST | `/materials` | `material.manage` | Daftarkan bahan baru | [M-22](../02-modules/m22-materials.md) |
| POST | `/procurements/{id}/close` | `procurement.receive` | Tutup usulan Tidak Direalisasikan dengan alasan | [M-14](../02-modules/m14-procurement.md) |
| POST | `/procurements/{id}/receipts` | `procurement.receive` | Catat penerimaan & buat aset | [M-14](../02-modules/m14-procurement.md) |
| POST | `/procurements/{id}/submit` | `procurement.create` | Ajukan draf/revisi; instance baru dari awal | [M-14](../02-modules/m14-procurement.md) |
| POST | `/procurements` | `procurement.create` | Buat usulan pengadaan | [M-14](../02-modules/m14-procurement.md) |
| POST | `/reservations/export` | `report.export` | Ekspor P-30 melalui worker M-16, irisan reservation.view | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/reservations/preview` | `reservation.create` | Pratinjau pengajuan tanpa menyimpan apa pun: tanggal turunan beserta yang bentrok atau tidak sah, kuota pengajuan tertunda (`BR-023a`), dan jalur persetujuan yang akan berlaku (`RE-07`) — bahan langkah Tinjau wizard (UXD-04) | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/reservations/{id}/cancel` | `reservation.cancel_own` · `reservation.cancel_any` | Batalkan reservasi + alasan. Pemilik reservasi cukup `cancel_own`; membatalkan reservasi pihak lain wajib `cancel_any` (`FR-07.3 A2`). Kepemilikan diperiksa di server, bukan disimpulkan dari role | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/reservations/{id}/usage` | `reservation.record_usage` | Catat penggunaan ruangan pasca-kegiatan per tanggal, sekali (`FR-07.4` langkah 3, A1): kondisi `Baik`/`Perlu Perhatian` + catatan bagi yang `Selesai`, atau `Tidak Digunakan` dari `Berlangsung`/`Selesai` — slotnya dilepas | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/reservations` | `reservation.create` | Ajukan reservasi ruangan/aset | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/roles` | `role.update` | Buat role kustom dengan menyalin role sumber sebagai template (`FR-02.2 A2`, `BR-069a`); kode `RK-{id}` dibangkitkan sistem; nama unik | [M-02](../02-modules/m02-users.md) |
| POST | `/room-fixed-schedules/import` | `reservation.fixed_schedule` | CSV E.5.3 (`filename`, `content_base64`), 200 selesai / 202 menunggu, replay hash per pengunggah 24 jam | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/rooms/{id}/blocks/preview` | `reservation.fixed_schedule` | Pratinjau blokade tanpa efek: kemunculan dalam horizon, hari libur yang dilewati (A4), reservasi yang beririsan (A1), dan blokade/pemeliharaan lain yang beririsan | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/rooms/{id}/blocks` | `reservation.fixed_schedule` | Buat jadwal tetap (pola mingguan; satu aturan per hari) atau blokade manual (rentang tunggal). Beririsan reservasi → ditolak kecuali pengguna memilih eksplisit membatalkannya beserta alasan (A1, NT-08); beririsan blokade lain → ditolak | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/users/import` | `user.create` | Impor massal CSV/XLSX: ≤ 200 baris diproses sinkron, lebih dari itu asinkron (`IMPT-04`); berkas identik dalam 24 jam mengembalikan hasil sebelumnya (`IMPT-03`) | [M-02](../02-modules/m02-users.md) |
| POST | `/users/{id}/2fa-activation-code` | `user.reset_2fa` | Terbitkan kode aktivasi 2FA bagi akun role wajib yang belum ber-2FA (`FR-01.5 A7`, `BR-070d`); `metode_verifikasi` wajib; kode tampil satu kali; tidak untuk akun sendiri | [M-02](../02-modules/m02-users.md) |
| POST | `/users/{id}/pseudonymize` | `user.update` | Khusus Administrator R-01 berscope all: pseudonimisasi permanen akun lain yang NONAKTIF dan tanpa kewajiban; alasan, referensi permintaan terverifikasi dan metode verifikasi wajib (`DP-04`, `SL-05`) | [M-02](../02-modules/m02-users.md) |
| POST | `/users/{id}/reset-2fa` | `user.reset_2fa` | Reset 2FA pengguna (`FR-01.5 A3`): menonaktifkan 2FA, menghapus kode cadangan, mencabut seluruh sesi; `metode_verifikasi` wajib; untuk role wajib 2FA menerbitkan kode aktivasi baru, tampil satu kali (`BR-070d`) | [M-02](../02-modules/m02-users.md) |
| POST | `/users/{id}/reset-password` | `user.reset_password` | Terbitkan password sementara langsung dari detail pengguna (`FR-01.3 A5`); `metode_verifikasi` wajib; password tampil satu kali; sesi dicabut dan kunci login dibuka. Logikanya milik M-01 | [M-02](../02-modules/m02-users.md) |
| POST | `/users` | `user.create` | Buat pengguna baru | [M-02](../02-modules/m02-users.md) |
| POST | `/work-orders/{id}/complete` | `workorder.execute` | Ajukan penyelesaian | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders/{id}/estimate/decide` | `workorder.verify` | Setujui/tolak estimasi dengan catatan di detail WO | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders/{id}/estimate` | `workorder.execute` | Ajukan estimasi revisi; ambang konfigurasi wajib | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders/{id}/irreparable` | `workorder.execute` | Tidak dapat diperbaiki dengan rekomendasi dan bukti | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders/{id}/pause` | `workorder.execute` | Tertunda dengan alasan dan tanggal lanjut | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders/{id}/photos` | `workorder.execute` | Tautkan unggahan hasil milik Teknisi; pending ditandai | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders/{id}/verify` | `workorder.verify` | Verifikasi & tutup | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders` | `workorder.create` | Buat work order | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-units` | `setting.manage` | Buat unit kerja | [M-20](../02-modules/m20-settings.md) |
| PUT | `/academic-years/{id}` | `setting.manage` | Sunting nama, rentang tanggal, dan semester tahun ajaran | [M-20](../02-modules/m20-settings.md) |
| PUT | `/approval-rules/{id}` | `approval_rule.manage` | Ganti definisi aturan utuh; `versi` naik, instance berjalan tetap memakai snapshot (FR-10.1 A4, BR-040) | [M-10](../02-modules/m10-approval.md) |
| PUT | `/asset-categories/{id}` | `category.manage` | Perbarui kategori | [M-04](../02-modules/m04-assets.md) |
| PUT | `/asset-disposals/{id}` | `disposal.create` | Revisi usulan dan mulai approval baru | [M-21](../02-modules/m21-disposal.md) |
| PUT | `/assets/{id}` | `asset.update` | Perbarui atribut deskriptif aset (nama, merek, model, nomor seri, tahun, kelayakan pinjam, penanggung jawab; perolehan hanya bagi `asset.view_financial`) — kategori, lokasi, kode, status tetap. `kondisi` opsional: bila berubah, `alasan` wajib, menuntut juga `asset.update_condition`, dan dijalankan atomik bersama atribut (FR-04.3) | [M-04](../02-modules/m04-assets.md) |
| PUT | `/audit-sessions/{id}/findings/{itemId}` | `audit.manage` | Lengkapi pendaftaran temuan baru | [M-13](../02-modules/m13-audit-stocktake.md) |
| PUT | `/audit-sessions/{id}/items/{itemId}/reconcile` | `audit.manage` | Keterangan/tindakan dan basis data terbaru | [M-13](../02-modules/m13-audit-stocktake.md) |
| PUT | `/audit-sessions/{id}/material-items/{itemId}/reconcile` | `audit.manage` | Lengkapi keterangan selisih pada versi hitungan yang ditinjau | [M-13](../02-modules/m13-audit-stocktake.md) |
| PUT | `/holidays/{id}` | `setting.manage` | Sunting hari libur | [M-20](../02-modules/m20-settings.md) |
| PUT | `/maintenance-schedules/{id}` | `maintenance.manage` | Ubah konfigurasi jadwal; cakupan tetap | [M-12](../02-modules/m12-maintenance.md) |
| PUT | `/material-categories/{id}` | `material.manage` | Ubah kategori bahan beserta status | [M-22](../02-modules/m22-materials.md) |
| PUT | `/material-requests/{id}` | `material.request` | Pemohon merevisi Perlu Revisi sebelum penyerahan | [M-22](../02-modules/m22-materials.md) |
| PUT | `/materials/{id}/request-threshold` | `setting.manage` | Override batas bulat nonnegatif dengan body batas | [M-20](../02-modules/m20-settings.md) |
| PUT | `/me` | Bearer | Perbarui profil sendiri — nama, telepon, `foto_file_id` (berkas `USER_PHOTO` milik pemanggil yang sudah dikonfirmasi; `null` menghapus foto) | 200 | 401, 422 | [M-01](../02-modules/m01-auth.md) |
| PUT | `/notifications/preferences` | `notification.manage_own` | Atur preferensi notifikasi | [M-17](../02-modules/m17-notifications.md) |
| PUT | `/procurements/{id}` | `procurement.create` | Sunting draf/revisi milik sendiri, simpan atau ajukan | [M-14](../02-modules/m14-procurement.md) |
| PUT | `/roles/{id}/permissions` | `role.update` | Perbarui matriks permission | [M-02](../02-modules/m02-users.md) |
| PUT | `/rooms/{id}` | `location.manage` | Perbarui ruangan | [M-03](../02-modules/m03-locations.md) |
| PUT | `/settings` | `setting.manage` | Perbarui parameter sistem | [M-20](../02-modules/m20-settings.md) |
| PUT | `/users/{id}` | `user.update` | Perbarui pengguna | [M-02](../02-modules/m02-users.md) |
| PUT | `/work-days` | `setting.manage` | Perbarui hari kerja sekolah | [M-20](../02-modules/m20-settings.md) |
| PUT | `/work-units/{id}` | `setting.manage` | Sunting unit kerja | [M-20](../02-modules/m20-settings.md) |
