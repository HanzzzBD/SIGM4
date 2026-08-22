<!-- DIGENERATE OTOMATIS oleh scripts/gen_indexes.py — JANGAN SUNTING BERKAS INI.
     Sumber kebenaran setiap baris ada di berkas modul terkait (docs/02-modules/).
     Menyunting di sini akan hilang saat regenerasi berikutnya. -->

# Indeks Endpoint API

> Setiap endpoint dimiliki satu modul. Konvensi umum di `../03-architecture/api-conventions.md`.
> Total: **106** baris, dikumpulkan dari 21 berkas modul.

| Method | Endpoint | Permission | Deskripsi | Pemilik |
|---|---|---|---|---|
| DELETE | `/device-tokens/{token}` | Bearer | Cabut token perangkat | [M-17](../02-modules/m17-notifications.md) |
| GET | `/activity-logs/export` | `activity_log.export` | Ekspor log | [M-18](../02-modules/m18-activity-log.md) |
| GET | `/activity-logs` | `activity_log.view` | Telusuri activity log | [M-18](../02-modules/m18-activity-log.md) |
| GET | `/analytics/{jenis}` | `report.view` | Data laporan analitik | [M-16](../02-modules/m16-analytics.md) |
| GET | `/approval-rules` | `approval_rule.view` | Daftar aturan | [M-10](../02-modules/m10-approval.md) |
| GET | `/approvals/pending` | `approval.decide` | Pengajuan menunggu keputusan saya | [M-10](../02-modules/m10-approval.md) |
| GET | `/approvals/{id}/history` | `approval.view` | Linimasa persetujuan | [M-10](../02-modules/m10-approval.md) |
| GET | `/asset-categories` | `asset.view` | Daftar kategori | [M-04](../02-modules/m04-assets.md) |
| GET | `/asset-disposals/{id}/report` | `disposal.view` | Unduh berita acara penghapusan PDF | [M-21](../02-modules/m21-disposal.md) |
| GET | `/asset-disposals` | `disposal.view` | Daftar & arsip penghapusan | [M-21](../02-modules/m21-disposal.md) |
| GET | `/assets/availability` | `reservation.view` | Ketersediaan unit barang pada rentang waktu | [M-08](../02-modules/m08-reservation-item.md) |
| GET | `/assets/by-uuid/{uuid}` | `asset.view` | Detail aset dari hasil scan QR | [M-05](../02-modules/m05-qr.md) |
| GET | `/assets/export` | `asset.export` | Ekspor XLSX/PDF | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets/{id}/documents/{docId}/download` | `asset_document.view` | URL unduhan bertanda tangan | [M-06](../02-modules/m06-documents.md) |
| GET | `/assets/{id}/service-history` | `asset.view` | Riwayat servis aset | [M-12](../02-modules/m12-maintenance.md) |
| GET | `/assets/{id}` | `asset.view` | Detail aset | [M-04](../02-modules/m04-assets.md) |
| GET | `/assets` | `asset.view` | Daftar aset (filter & pencarian) | [M-04](../02-modules/m04-assets.md) |
| GET | `/audit-sessions/{id}/items` | `audit.execute` | Daftar aset target (filter lokasi) | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/audit-sessions/{id}/report` | `audit.view` | Unduh berita acara PDF | [M-13](../02-modules/m13-audit-stocktake.md) |
| GET | `/chat/sessions` | Bearer | Riwayat percakapan sendiri | [M-19](../02-modules/m19-chatbot.md) |
| GET | `/damage-reports/open` | `damage.view` | Tiket terbuka untuk aset tertentu | [M-11](../02-modules/m11-damage-reports.md) |
| GET | `/damage-reports` | `damage.view` | Daftar tiket (tersaring sesuai role) | [M-11](../02-modules/m11-damage-reports.md) |
| GET | `/dashboard` | Sesuai role | Data dashboard sesuai role pengguna | [M-15](../02-modules/m15-dashboard.md) |
| GET | `/fines` | `fine.view` | Daftar denda | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/by-asset/{uuid}` | `loan.manage` | Peminjaman aktif atas suatu unit | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans/ready-checkout` | `loan.manage` | Reservasi siap diserahkan hari ini | [M-09](../02-modules/m09-loans.md) |
| GET | `/loans` | `loan.view` | Daftar peminjaman (tab aktif/terlambat/selesai) | [M-09](../02-modules/m09-loans.md) |
| GET | `/locations/tree` | `location.view` | Pohon lokasi lengkap | [M-03](../02-modules/m03-locations.md) |
| GET | `/me` | Bearer | Profil & permission pengguna | 200 `{user, permissions}` | 401 | [M-01](../02-modules/m01-auth.md) |
| GET | `/notifications/stream` | Bearer | Aliran notifikasi real-time via SSE (NTF-01) | [M-17](../02-modules/m17-notifications.md) |
| GET | `/notifications` | Bearer | Daftar notifikasi pengguna | [M-17](../02-modules/m17-notifications.md) |
| GET | `/procurements` | `procurement.view` | Daftar usulan | [M-14](../02-modules/m14-procurement.md) |
| GET | `/public/assets/{uuid}` | Publik | Info dasar aset untuk scan kamera bawaan | [M-05](../02-modules/m05-qr.md) |
| GET | `/reservations/{id}` | `reservation.view` | Detail reservasi + riwayat approval | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/reservations` | `reservation.view` | Daftar reservasi (tersaring sesuai role) | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/roles` | `role.view` | Daftar role | [M-02](../02-modules/m02-users.md) |
| GET | `/rooms/availability` | `reservation.view` | Ketersediaan ruangan pada rentang waktu | [M-07](../02-modules/m07-reservation-room.md) |
| GET | `/rooms/{id}/assets` | `asset.view` | Aset dalam satu ruangan | [M-04](../02-modules/m04-assets.md) |
| GET | `/settings` | `setting.view` | Baca parameter sistem | [M-20](../02-modules/m20-settings.md) |
| GET | `/users/{id}` | `user.view` | Detail pengguna | [M-02](../02-modules/m02-users.md) |
| GET | `/users` | `user.view` | Daftar pengguna (filter role, status, unit kerja) | [M-02](../02-modules/m02-users.md) |
| GET | `/work-orders/mine` | `workorder.execute` | Work order yang ditugaskan kepada saya | [M-12](../02-modules/m12-maintenance.md) |
| PATCH | `/assets/{id}/condition` | `asset.update` | Ubah kondisi + alasan | [M-04](../02-modules/m04-assets.md) |
| PATCH | `/fines/{id}/pay` | `fine.manage` | Tandai lunas | [M-09](../02-modules/m09-loans.md) |
| PATCH | `/fines/{id}/waive-compensation` | `fine.waive_compensation` | Bebaskan ganti rugi penuh/sebagian + alasan | [M-09](../02-modules/m09-loans.md) |
| PATCH | `/fines/{id}/waive` | `fine.waive` | Bebaskan denda keterlambatan + alasan | [M-09](../02-modules/m09-loans.md) |
| PATCH | `/notifications/read-all` | Bearer | Tandai semua terbaca | [M-17](../02-modules/m17-notifications.md) |
| PATCH | `/notifications/{id}/read` | Bearer | Tandai terbaca | [M-17](../02-modules/m17-notifications.md) |
| PATCH | `/users/{id}/status` | `user.update` | Aktifkan/nonaktifkan | [M-02](../02-modules/m02-users.md) |
| PATCH | `/work-orders/{id}/progress` | `workorder.execute` | Perbarui progres, biaya, foto | [M-12](../02-modules/m12-maintenance.md) |
| PATCH | `/work-orders/{id}/start` | `workorder.execute` | Mulai kerjakan | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/analytics/{jenis}/export` | `report.export` | Ekspor (asinkron bila berat) | [M-16](../02-modules/m16-analytics.md) |
| POST | `/approval-rules/preview` | `approval_rule.manage` | Pratinjau aturan yang akan berlaku | [M-10](../02-modules/m10-approval.md) |
| POST | `/approval-rules` | `approval_rule.manage` | Buat aturan + langkah | [M-10](../02-modules/m10-approval.md) |
| POST | `/approvals/delegate` | `approval.delegate` | Tetapkan approver pengganti | [M-10](../02-modules/m10-approval.md) |
| POST | `/approvals/{id}/decide` | `approval.decide` | Setujui/tolak/minta revisi | [M-10](../02-modules/m10-approval.md) |
| POST | `/asset-disposals/{id}/execute` | `disposal.execute` | Catat pelaksanaan fisik & hapuskan aset | [M-21](../02-modules/m21-disposal.md) |
| POST | `/asset-disposals` | `disposal.create` | Buat usulan penghapusan aset | [M-21](../02-modules/m21-disposal.md) |
| POST | `/assets/import` | `asset.create` | Impor massal | [M-04](../02-modules/m04-assets.md) |
| POST | `/assets/move` | `asset.update` | Mutasi lokasi (massal) | [M-04](../02-modules/m04-assets.md) |
| POST | `/assets/qr/print` | `asset.update` | Hasilkan PDF label QR massal | [M-05](../02-modules/m05-qr.md) |
| POST | `/assets/{id}/documents` | `asset_document.manage` | Tautkan dokumen aset dari berkas terdaftar | [M-06](../02-modules/m06-documents.md) |
| POST | `/assets/{id}/reinstate` | `disposal.reinstate` | Pulihkan aset yang telah dihapuskan | [M-21](../02-modules/m21-disposal.md) |
| POST | `/assets` | `asset.create` | Buat aset (mendukung `jumlah_unit` untuk N record) | [M-04](../02-modules/m04-assets.md) |
| POST | `/audit-sessions/{id}/approve` | `audit.approve` | Setujui & terapkan penyesuaian | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/finalize` | `audit.manage` | Hasilkan rekonsiliasi | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/scan` | `audit.execute` | Catat hasil pemindaian | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions/{id}/submit` | `audit.manage` | Kirim untuk persetujuan | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/audit-sessions` | `audit.manage` | Buat sesi opname | [M-13](../02-modules/m13-audit-stocktake.md) |
| POST | `/auth/2fa/verify` | Challenge token | Verifikasi kode TOTP | 200 `{tokens, user}` | 401, 423 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/login` | Publik | Login email + password | 200 `{tokens, user, permissions}` atau `{requires_2fa}` | 401, 423, 429 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/logout` | Bearer | Mencabut sesi | 204 | 401 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/password/change` | Bearer | Ganti password sendiri | 200 | 401, 422 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/password/forgot` | Publik | Ajukan permintaan reset | 202 `{message}` | 429 | [M-01](../02-modules/m01-auth.md) |
| POST | `/auth/refresh` | Refresh token | Menukar refresh token | 200 `{access_token}` | 401 | [M-01](../02-modules/m01-auth.md) |
| POST | `/buildings` · `/areas` · `/rooms` | `location.manage` | Buat entitas lokasi | [M-03](../02-modules/m03-locations.md) |
| POST | `/chat/messages/{id}/feedback` | Bearer | Beri umpan balik jawaban | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/chat/messages` | Bearer | Kirim pesan ke chatbot | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/chat/sessions` | Bearer | Mulai sesi chatbot | [M-19](../02-modules/m19-chatbot.md) |
| POST | `/damage-reports/{id}/verify` | `damage.verify` | Verifikasi / tolak tiket | [M-11](../02-modules/m11-damage-reports.md) |
| POST | `/damage-reports` | `damage.create` | Buat tiket kerusakan | [M-11](../02-modules/m11-damage-reports.md) |
| POST | `/device-tokens` | Bearer | Daftarkan token perangkat FCM | [M-17](../02-modules/m17-notifications.md) |
| POST | `/files/confirm` | Bearer | Daftarkan berkas terunggah & antrekan pemindaian AV | [M-06](../02-modules/m06-documents.md) |
| POST | `/files/presign` | Bearer | Minta URL unggah bertanda tangan ke object storage | [M-06](../02-modules/m06-documents.md) |
| POST | `/loans/checkout` | `loan.manage` | Proses serah terima | [M-09](../02-modules/m09-loans.md) |
| POST | `/loans/{id}/checkin` | `loan.manage` | Proses pengembalian | [M-09](../02-modules/m09-loans.md) |
| POST | `/loans/{id}/extend` | `loan.extend` | Ajukan perpanjangan | [M-09](../02-modules/m09-loans.md) |
| POST | `/maintenance-schedules` | `maintenance.manage` | Buat jadwal preventif | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/procurements/{id}/receipts` | `procurement.receive` | Catat penerimaan & buat aset | [M-14](../02-modules/m14-procurement.md) |
| POST | `/procurements` | `procurement.create` | Buat usulan pengadaan | [M-14](../02-modules/m14-procurement.md) |
| POST | `/reservations/{id}/cancel` | `reservation.cancel` | Batalkan reservasi + alasan | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/reservations` | `reservation.create` | Ajukan reservasi ruangan/barang | [M-07](../02-modules/m07-reservation-room.md) |
| POST | `/users/import` | `user.create` | Impor massal CSV/XLSX | [M-02](../02-modules/m02-users.md) |
| POST | `/users/{id}/reset-2fa` | `user.reset_2fa` | Reset 2FA pengguna | [M-02](../02-modules/m02-users.md) |
| POST | `/users/{id}/reset-password` | `user.reset_password` | Terbitkan password sementara | [M-02](../02-modules/m02-users.md) |
| POST | `/users` | `user.create` | Buat pengguna baru | [M-02](../02-modules/m02-users.md) |
| POST | `/work-orders/{id}/complete` | `workorder.execute` | Ajukan penyelesaian | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders/{id}/verify` | `workorder.verify` | Verifikasi & tutup | [M-12](../02-modules/m12-maintenance.md) |
| POST | `/work-orders` | `workorder.create` | Buat work order | [M-12](../02-modules/m12-maintenance.md) |
| PUT | `/assets/{id}` | `asset.update` | Perbarui aset | [M-04](../02-modules/m04-assets.md) |
| PUT | `/me` | Bearer | Perbarui profil sendiri | 200 | 401, 422 | [M-01](../02-modules/m01-auth.md) |
| PUT | `/notifications/preferences` | Bearer | Atur preferensi notifikasi | [M-17](../02-modules/m17-notifications.md) |
| PUT | `/roles/{id}/permissions` | `role.update` | Perbarui matriks permission | [M-02](../02-modules/m02-users.md) |
| PUT | `/rooms/{id}` | `location.manage` | Perbarui ruangan | [M-03](../02-modules/m03-locations.md) |
| PUT | `/settings` | `setting.manage` | Perbarui parameter sistem | [M-20](../02-modules/m20-settings.md) |
| PUT | `/users/{id}` | `user.update` | Perbarui pengguna | [M-02](../02-modules/m02-users.md) |
