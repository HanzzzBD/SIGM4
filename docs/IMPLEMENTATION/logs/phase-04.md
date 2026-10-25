# Log Phase 04 — Siklus Hidup Aset

| | |
|---|---|
| **Phase** | [`phases/phase-04.md`](../phases/phase-04.md) |
| **Milestone PRD** | `M2 — **menutup M2**` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | — |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-04.md`](../phases/phase-04.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 13 Oktober 2026 | Backend ketersediaan aset dan UI P-28 diimplementasikan serta diuji lokal; keputusan produk melalui fitur pertanyaan, rincian dan bukti di catatan PR-04-01/04 di bawah. Belum ada PR remote atau penggabungan. | `PR-04-01`, `PR-04-04` |
| 14 Oktober 2026 | Implementasi lokal work order korektif dan jembatan verifikasi; teknisi/tenggat dipilih saat verifikasi, prioritas mengikuti urgensi tiket. Rincian dan validasi pada catatan PR-04-05/06 di bawah. | `PR-04-05`, `PR-04-06` |
| 14 Oktober 2026 | Jadwal preventif, job H-7 dan P-45/P-46 diimplementasikan lokal; pembagian dua sesi dan keputusan tanggal/kategori/akses dikonfirmasi melalui pertanyaan interaktif. Rincian pada catatan PR-04-07 di bawah. | `PR-04-07` |
| 14 Oktober 2026 | Eksekusi WO mobile/API, verifikasi atomik, riwayat servis dan P-42/P-43/P-44 diimplementasikan bersama. Keputusan pengguna: transaksi daring/foto luring, ambang estimasi wajib diisi dan persetujuan Petugas/Admin, perluasan NT-24. | `PR-04-08`, `PR-04-09`, `PR-04-10`, `PR-04-18` |
| 24 Oktober 2026 | PR Phase 04 dari pekerjaan lokal dibuka bersama Phase 03–06 sebagai satu PR [#182](https://github.com/HanzzzBD/SIGM4/pull/182) — penyimpangan, keputusan, masalah, dan hasil ukur dicatat sekali di [log phase-03](phase-03.md) §1–§3, §7, §8 (keputusan 26–29). | #182 |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | Cakupan hanya `PR-04-01` dan `PR-04-04`; katalog menyediakan pemilihan unit, sedangkan pengajuan menunggu `PR-04-02`. | Pemilik produk melalui fitur pertanyaan (pengganti `AskUserQuestion`), 13 Oktober 2026. | Tidak; batas implementasi mengikuti rencana phase dan dependensi pengajuan. |
| 2 | Pertahankan `SlotService` dan dua exclusion constraint per jenis sumber daya; selaraskan acceptance Phase 04 yang sebelumnya menyebut satu constraint. | Pemilik produk memilih mengikuti `CI-01` / `SDD-AVL-02`; skema yang sudah ada sesuai PRD Bab 26.3. | Tidak ada perubahan aturan; hanya koreksi turunan IMPLEMENTATION. |
| 3 | Teknisi dipilih saat verifikasi; worker membentuk WO dari event, bukan memilih teknisi otomatis. | Jawaban pemilik produk melalui pertanyaan interaktif pengganti AskUserQuestion, 14 Oktober 2026. | Ya, kontrak M-11/M-12 dan SDD-07/05 diperbarui. |
| 4 | Prioritas mengikuti urgensi tiket; target selesai diisi petugas. | Jawaban pemilik produk, tanpa menetapkan durasi buatan per tingkat kerusakan. | Ya, kontrak M-12; turunan phase diperbaiki. |
| 5 | **Pengecualian SCA terbatas** (pemilik produk, 24 Oktober 2026): advisory tanpa tambalan upstream boleh dikecualikan per GHSA + path paket, paling lama 30 hari (High) / 7 hari (Critical). Mekanisme dibangun PR chore tersendiri dengan daftar kosong; entri pertama (`node-forge`, `zod` milik `@expo/cli`) ikut `PR-04-16` | Fondasi mobile Expo 57 (`SDD-MOB-10`) membawa `node-forge` GHSA-86w9-cpqp-85rv tanpa versi tertambal; `CD-02` tanpa pengecualian akan menahan seluruh rantai mobile tanpa tanggal | Ya — `CD-02`, `SDD-SEC-13` |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| Satu PR per PR rencana (`CLAUDE.md`, `BRANCHING §2`) | `PR-04-16`, `PR-05-32`, `PR-04-17`, `PR-05-35`, `PR-05-34` sebagai satu PR paket rantai mobile (#181), commit per PR rencana tetap terpisah | Keputusan pemilik produk 24 Oktober 2026: pekerjaan lokal Phase 03–06 dikerjakan Codex beberapa PR sekaligus dan dipecah **per paket**; lima PR mobile ini berurutan dan saling bergantung | Sisa pekerjaan lokal Phase 03–06 juga masuk per paket (peta pemecahan); tiap PR paket mencatat baris ini |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-04.md` §7](../phases/phase-04.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Apakah `SlotService` perlu diubah untuk melayani reservasi aset. **Perubahan apa pun di sini wajib melalui tinjauan arsitek** — ia menandakan abstraksi Phase 02 kurang umum
- [ ] Kriteria keluar `M2` terverifikasi: 50 permintaan simultan atas slot sama → tepat 1 sukses

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| — | — | — | — |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-04.md` §9 dan §12](../phases/phase-04.md).

- [ ] Seluruh 14 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| — | — | — |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*

### PR-04-15: URL unggah ulang - 12 Oktober 2026

Pendahulu PR-04-16 disetujui pemilik produk melalui fitur pertanyaan. Kontrak POST /files/{id}/presign ditetapkan dalam PRD m06 sebelum kode: 200 presign 300 detik pada object key/MIME/ukuran lama, tidak membuat baris baru; hanya milik pemanggil yang checksum-nya masih null. Anonim 401, berkas asing/tidak ada 404, sudah dikonfirmasi 422. Tidak ada perubahan data atau entri aktivitas baru; log unggah tetap saat confirm. Tanpa migration. TypeScript API dan uji lulus; 13 uji integrasi file dengan PostgreSQL/MinIO nyata pada DB terisolasi lulus. Cabang lokal feature/PR-04-15-url-unggah-ulang; belum dipublikasikan.

### PR-04-16: fondasi mobile - 12 Oktober 2026

Keputusan pemilik produk melalui fitur pertanyaan: Expo SDK 57, minimum iOS 16.4 (perubahan NFR-C-03), Android 8 tetap; PR-04-15 pendahulu terpisah; cabang berurutan dari develop. Antrean SQLite menyimpan hanya berkas tertunda dan metadata pemilik akun; token/URL presign tidak disimpan. Lima uji Node SQLite nyata lulus: persistensi buka ulang DB, retensi 50 berkas/72 jam, backoff, pengiriman tunggal dan pembatalan aktif/pemisahan akun. Belum merupakan bukti native expo-sqlite atau build perangkat. Integrasi SDK/auth/unggah sedang dikerjakan. PR-05-32 mengikuti fondasi; keputusan aksi yang layarnya belum ada nonaktif dengan alasan, API baca foto CLEAN ditambahkan pada PR-05-32.

Validasi PR-04-16 lokal: 15 uji pada tiga berkas lulus (SQLite nyata, token/refresh/sesi, pemulihan unggah); TypeScript mobile dan lint lulus. Expo export menghasilkan Hermes Android/iOS. Ini belum bukti APK/IPA/perangkat nyata: host Windows tidak menyediakan adb/Android SDK terdeteksi atau Xcode. Native Keychain/Keystore, kamera, force-stop SQLite, cold start dan app switcher tetap memerlukan development build perangkat. SCA terhalang dua advisory HIGH transitif tanpa patch upstream saat verifikasi 12 Oktober: GHSA-vfj7-8cjw-p6xm (braces <=3.0.3; registry terbaru 3.0.3), GHSA-86w9-cpqp-85rv (node-forge <=1.4.0; registry terbaru 1.4.0). Audit melaporkan 20 HIGH karena propagasi paket Expo/Metro, bukan 20 advisory berbeda. Tidak menjalankan npm audit fix --force (menawarkan downgrade Expo44/RN0.72 yang tidak kompatibel). Gerbang CI/SCA belum dinyatakan hijau. Tidak ada publikasi EAS, store, GitHub atau deploy.


### Review ulang PR-04-15 - 13 Oktober 2026

Pemilik produk memilih review dan validasi ulang implementasi lokal melalui fitur pertanyaan.
Commit yang ditinjau 7aeffc7, branch feature/PR-04-15-url-unggah-ulang. Cabang aktif tetap
feature/PR-05-32-pemindai-mobile; git diff 7aeffc7..HEAD pada m06-documents dan m06-files.test.ts
kosong, sehingga kode fitur yang diuji identik dengan PR-04-15. Tidak ada perubahan kode produksi.
Review kontrak, registry route, autentikasi, filter uploaded_by, penolakan checksum terisi,
metadata/TTL dari registri dan tidak adanya mutasi tidak menemukan masalah yang perlu diperbaiki.

PostgreSQL uji awal tidak tersedia (ECONNREFUSED 127.0.0.1:55432); Docker Desktop dimulai
secara tersembunyi, container lokal yang sudah ada otomatis kembali hidup. Uji memakai DB baru
terisolasi yang dihapus setelah selesai, bukan basis data aplikasi. Validasi ulang 13 integrasi
PostgreSQL/MinIO dan 11 registry/OpenAPI lulus. Uji registry memakai maxWorkers2/testTimeout30000;
integrasi testTimeout30000. Tidak ada publish, merge atau deployment. Status PR tetap lokal.

Typecheck API (termasuk source uji) dan lint m06-documents lulus setelah pengujian ulang.


### PR-04-17: beranda, tugas, push dan deep link - 13 Oktober 2026

Keputusan produk melalui fitur pertanyaan: cabang sesudah PR-05-32, dua PR terpisah berurutan;
API tersedia dipakai, antrean/tujuan yang belum ada nonaktif dengan alasan; Firebase native
Android/iOS dan fallback in-app jika konfigurasi sekolah belum ada. Konteks keputusan PR-05-35
harus berhasil dimuat sebelum aksi aktif. Tidak menambahkan backend domain, migration atau
mengubah permission/mesin approval. Skala produksi L: lima tab, lifecycle SDK push/auth, tiga
layar dan kontrak bersama adalah satu fondasi navigasi/push; pemisahan fungsional berikutnya
ada di PR-05-35 sesuai keputusan pengguna, bukan menambah PR domain tanpa permintaan.

Implementasi: manifest/rentang dashboard dan tren lazy, antrean berbasis permission, notifikasi
berpaginasi/read-all/badge, React Native Firebase26.4/ExpoNotifications57, FID sesuai backend,
kanal/izin, listener foreground/background/initial tap, headless guard, logout hook/gerbang LOGOUT,
route groups/tab induk, tujuan relatif tervalidasi dan memori akun. Runtime 0.2.0 untuk modul native.
Konfigurasi native diuji memakai fixture sintetis lokal,
bukan kredensial atau pengiriman Google. SDK minimum tetap Android8/iOS16.4.

Validasi: 29 uji mobile, 48 integrasi PostgreSQL dashboard/push/in-app, 11 registry/OpenAPI,
TypeScript produksi/uji mobile dan lint lulus. Export Hermes Android/iOS lulus; introspect konfigurasi
native tanpa Firebase dan dengan fixture Firebase lulus (minSdk26, iOS16.4, static frameworks).
Bukan bukti APK/IPA/perangkat atau delivery cloud. SCA Firebase awal membawa gRPC1.9.16
(GHSA-m9gg-hp2v-232j, fixed1.13.6/1.14.5); scoped override Firestore ~1.14.5 dan resolusi npm
membuang versi rentan, memakai1.14.6. Dua HIGH fondasi braces/node-forge tetap tanpa patch,
SCA belum hijau. Tidak melakukan audit fix --force, publishing Firebase/EAS/GitHub atau deploy.

Audit setelah patch menghapus advisory gRPC; HIGH upstream braces/node-forge tetap tercatat. File .env mobile muncul selama pekerjaan dan tidak disentuh/dimasukkan commit; validasi cloud tetap tidak dilakukan.

### PR-04-01 / PR-04-04: ketersediaan dan katalog aset — 13 Oktober 2026

Pekerjaan lokal pada cabang yang sudah ada `feature/PR-04-01-ketersediaan-aset`, mencakup
backend PR-04-01 dan konsumen UI PR-04-04 sesuai cakupan pengguna. Belum dibuat commit,
PR remote, merge atau deployment; kedua bagian tetap berstatus In Progress sampai proses review.
Tidak mengubah shared/booking, skema booking_slots, permission, atau mesin approval.

PR-04-01: modul m08-reservation-item dan kontrak Zod bersama untuk GET /assets/availability
(reservation.view). Kelayakan, batas siswa, penghapusan, kategori, pencarian, paginasi kelompok,
jumlah tersedia dan foto CLEAN terkonfirmasi diterapkan. Slot dibaca lewat permukaan publik
shared/booking; DIPINJAM/DIRESERVASI tidak menutup rentang mendatang. Celah terdekat mempertahankan
durasi, menghormati batas [) dan horizon konfigurasi dalam WIB. Tanpa cache HTTP atau perubahan data.
Kontrak endpoint didokumentasikan di PRD m08 §7; acceptance Phase 04 diselaraskan dengan CI-01.

PR-04-04: P-28 /katalog-aset dimuat malas, terdaftar pada sidebar/router dengan reservation.view.
Rentang WIB dan saringan hidup dalam URL; kategori tidak membutuhkan asset.view. Rincian unit
berpaginasi 20 unit, pemilihan melalui checkbox C-10, tautan detail hanya bagi asset.view. Aksi
pengajuan belum aktif dengan alasan yang terlihat, sesuai keputusan produk. Pemilihan direset saat
rentang/saringan/data berubah; saat memuat ulang atau luring tidak bisa memilih. Data dimuat ulang
saat fokus kembali. Keadaan memuat, kosong, galat dan luring disediakan dengan aksi yang sesuai.

Validasi lokal: 10 integrasi PostgreSQL nyata, 5 uji logika/registrasi endpoint/OpenAPI, 37 uji
registry/OpenAPI yang ada, 8 uji UI P-28 termasuk axe WCAG 2.1 AA, dan 13 uji label/navigasi lulus.
Uji konkurensi memanggil SlotService dalam 50 transaksi nyata: tepat 1 commit dan 49 galat yang
ErrorMapper petakan ke 409 ASSET_NOT_AVAILABLE (bukan uji endpoint pengajuan PR-04-02).
Pengukuran terakhir AV-03: 5.000 aset, rentang 30 hari, 84,7 ms HTTP lokal; foto memakai storage
stub dalam integrasi. Ini bukan pengukuran staging atau bukti unduh MinIO/B2.
PostgreSQL uji memakai database baru terisolasi melalui scripts/pr0238-test-db.mjs dan dihapus
setelah setiap run. Docker Desktop dimulai tersembunyi dan container SIGM4 PostgreSQL/Redis
lokal yang sebelumnya berhenti dihidupkan; tidak menggunakan DB aplikasi untuk fixture.

Typecheck produksi/API/web beserta source uji, lint berkas terkait, build web, dan penjaga batas
impor lulus. Build masih menampilkan peringatan dynamic/static import NotificationCenterPage yang
sudah ada di modul lain. Pemeriksaan Chrome headless atas build produksi dengan fixture 5.000
unit lulus pada 320/768/1024/1440 px, tanpa overflow horizontal/pageerror; Enter membuka rincian
unit dan Space memilih. DOM membatasi rincian menjadi 20 unit per halaman. Screenshot dan runner
browser tersimpan lokal di tmp/pr0404-*.png dan tmp/pr0404-browser.mjs.

### PR-04-02 / PR-04-03: pengajuan dan pembatalan aset — 13 Oktober 2026

Cakupan dikonfirmasi pengguna melalui tool pertanyaan yang tersedia: backend dan UI
pengajuan/pembatalan; gabungan memakai satu `RESERVASI_ASET` dengan fakta aset/ruangan;
pengganti otomatis cukup sekategori; penggunaan ruangan dicatat terpisah dari serah terima aset.
Implementasi lokal pada cabang PR-04-01 yang sudah ada, tanpa commit/PR remote/merge/deploy.
Status tetap In Progress sampai review. Perubahan mobile/EAS di workspace tidak termasuk pekerjaan ini.

PR-04-02: migration expand 0053 menambah reservation_items (satu unit per baris, confirmed_at),
lokasi penggunaan, status penggunaan ruangan gabungan dan setting durasi role. Rumpun API M-07
menerima muatan ASET serta ruangan dengan aset_pendukung; pratinjau tidak menyimpan, pengajuan
idempoten. Kuota lintas jenis dikunci bersama, kelayakan/durasi/horizon/H-1 diperiksa di server.
Alokasi otomatis mengunci unit menaik dengan SKIP LOCKED, manual memerlukan cancel_any,
dan seluruh aset/ruangan/approval/audit/outbox berada dalam transaksi yang sama. SlotService
dan exclusion constraint tidak berubah. Approval memeriksa semua unit/slot lalu mengonfirmasi
seluruhnya; penolakan, revisi, SLA auto_reject dan TTL melepas seluruh alokasi. Identitas unit
ditampilkan hanya untuk tanggal yang pernah disetujui, termasuk setelah pembatalan.

PR-04-03: pembatalan beralasan mempertahankan slot RELEASED, memeriksa pemilik/permission
dan menolak aset ACTIVE. Aset belum diserahkan boleh dibatalkan setelah waktu mulai; gabungan
yang ruangannya telah dimulai tidak dapat dibatalkan seluruhnya, termasuk sebelum job berjalan.
No-show 24 jam dicatat KEDALUWARSA dengan alasan TIDAK_DIAMBIL dan NT-09, berbeda dari TTL
NT-46. Verifikasi kerusakan yang membuat aset TIDAK_TERSEDIA membatalkan reservasi mendatang
secara atomik dengan perubahan kondisi. Efek internal tersebut tidak memerlukan permission
pembatalan manual tambahan. Scope detail selain all dibatasi milik pemohon; akses asing 404.

P-28 mengaktifkan pengajuan ke wizard aset P-29 tiga langkah, dengan kategori/jumlah, pemilihan
manual bagi pengelola, beberapa kategori otomatis, pola mingguan/tanggal dilewati, keperluan/lokasi,
ruangan opsional dan tinjauan approval/kuota. Wizard ruangan meneruskan rincian dan pengulangan
saat beralih ke gabungan. P-31 menampilkan alokasi, lokasi, penggunaan ruangan terpisah, dan dialog
pembatalan serta pengajuan ulang. Konflik menyediakan tautan kembali ke ketersediaan/alternatif.

Validasi lokal: 77 integrasi PostgreSQL nyata (17 alur aset/gabungan, 10 ketersediaan, 50 regresi
pengajuan/pembatalan/penggunaan/detail ruangan), 52 uji logika/registry/OpenAPI, dan 44 UI
P-28/P-29/P-31 lulus. Uji 50 HTTP pada unit terakhir menghasilkan satu sukses/49 respons
409 ASSET_NOT_AVAILABLE; tiga pemohon atas lima unit menghasilkan satu alokasi lengkap dan
dua konflik. Worker nyata + dispatcher outbox menguji TTL, SLA, no-show dan notifikasi. Fixture
berada pada database baru terisolasi yang dihapus setelah run. Migration up/down/up pada DB
kosong terisolasi lulus; bukan izin rollback DB berisi histori penggunaan gabungan.

Typecheck produksi/source uji, lint berkas terkait, batas impor, build web dan audit dokumen lulus.
Build masih memperingatkan dynamic/static import NotificationCenterPage yang sudah ada.
Browser Chrome headless atas build produksi menguji katalog 5.000 unit, keyboard, wizard,
pengajuan/detail/pembatalan pada 320/768/1024/1440 px, tanpa overflow/pageerror. Runner dan
screenshot lokal: tmp/pr040203-browser.mjs dan tmp/pr040203-*.png; API browser memakai fixture,
bukan bukti staging/cloud push/perangkat mobile. Migration 0053 tetap membutuhkan tinjauan arsitek
sebelum merge sesuai CLAUDE.md. Serah terima fisik/pengembalian dan penyedia blokir peminjaman
terlambat/denda riil mengikuti Phase 05; titik ekstensi blokir yang ada dipakai dan diuji.

### PR-04-05/06 — Work order korektif dan jembatan verifikasi (14 Oktober 2026)

Dikerjakan bersama sesuai instruksi pengguna, di workspace yang sudah mempunyai perubahan
Phase 04/05. Belum dibuat commit/PR remote maupun merge. Status tetap In Progress sebagai
pekerjaan lokal; migration 0058 membutuhkan tinjauan arsitek sebelum merge.

0058 menambahkan work_orders dan damage_reports.work_order_assignment. Nomor memakai
DocumentNumberService; satu tiket dijaga unique FK dan kunci baris. POST /work-orders
memakai Idempotency-Key; daftar/detail tersaring penugasan, daftar teknisi memuat beban
pekerjaan aktif. Teknisi wajib aktif/R-04, tenggat tanggal WIB, objek tepat satu aset/ruangan;
prioritas/deskripsi/objek dari tiket dibaca ulang. Garansi mengikuti M-06, biaya disamarkan
tanpa maintenance.view_cost. Aset yang masih Dipinjam tidak dinonaktifkan untuk perbaikan.

Verifikasi Tindak Lanjut sekarang memerlukan workorder.create dan pilihan penugasan.
Drawer P-41 memuat teknisi, beban aktif, tenggat, estimasi biaya dan opsi perawatan ringan.
Work order dibentuk konsumen DamageReportVerified pada worker sesudah commit. Pembuatan WO,
status aset Dalam Perbaikan, pembatalan/pelepasan slot mendatang, tiket Dalam Perbaikan,
WORKORDER_CREATED/WORKORDER_ASSIGNED, dan WorkOrderAssigned atomik. NT-22/NT-27 memakai
dispatcher notifikasi yang ada, dengan push setelah commit. SlotService tidak diubah.

Scope ASSIGNED perubahan kondisi aset kini memerlukan WO aktif milik Teknisi. Scope tiket
Teknisi memenuhi FR-11.3 A2 di daftar dan detail; role pelapor lain tetap own. Rujukan
BR-052 pada rencana jembatan dikoreksi: BR-052 adalah peringatan garansi, sedangkan jembatan
melayani FR-11.2/FR-12.1/BR-045. Alur UX F-16 diselaraskan dengan keputusan pengguna.

Validasi: 1.395 uji backend lulus (laporan tmp/pr040506-api-tests.json), termasuk tiga uji
baru keamanan biaya, batas tanggal WIB dan pemasangan konsumen worker; 14 uji UI kerusakan
lulus, termasuk penugasan/tenggat dan axe. 41 integrasi PostgreSQL (6 work order, 11 verifikasi,
17 reservasi aset, 7 kondisi aset) lulus pada database terisolasi. Migration 0058 up/down/up
lulus pada database kosong terisolasi (tmp/pr040506-migration.mjs). Typecheck produksi dan
source uji API/web, lint berkas terkait, batas impor, build web, audit_docs dan validate_impl
lulus. Build masih memberi peringatan dynamic/static import NotificationCenterPage yang ada.

Pada verifikasi akhir layanan database Docker lokal berhenti; runner PostgreSQL sementara
localhost tersedia di tmp/pr040506-local-db.mjs untuk pengujian terisolasi. Fixture dibersihkan
agar uji aset tidak terhalang FK work_orders. Snapshot registri/OpenAPI diperbarui untuk endpoint
baru serta endpoint Phase 04/05 yang sudah ada di workspace. Uji Clock dijalankan dengan satu
worker untuk menghindari timeout pemeriksaan lint paralel. Ini bukti lokal, bukan pipeline CI,
staging, atau pengiriman push perangkat nyata. Eksekusi mobile/penutupan dan UI P-42–P-44 tetap
milik PR-04-08/09/18; tidak dilaporkan selesai oleh pekerjaan ini.

### PR-04-07 — Jadwal preventif, job H-7, P-45/P-46 (14 Oktober 2026)

Implementasi lokal mengikuti keputusan pengguna melalui pertanyaan interaktif: tanggal mulai
menjadi jatuh tempo pertama; interval hari (preset 1/7/30/90/365) dapat menggantikan usulan
kategori; jatuh tempo bergeser melewati hari nonoperasional/libur; H-7 hari kalender WIB.
Kategori dievaluasi dinamis dan setiap aset mempunyai siklus sendiri dari tanggal pekerjaan
selesai. Akses daftar/detail/pengelolaan dikonfirmasi maintenance.manage. Kontrak normatif
dicatat pada PRD M-12 §8, endpoint §7, dan izin P-45 diselaraskan sebelum penutupan pekerjaan.

Migration expand 0059 membentuk jadwal, siklus per aset dan catatan dilewati; relasi jadwal,
tanggal siklus, checklist snapshot dan penanda menunggu tersedia ditambahkan pada WO.
Checklist berbentuk {id,label,selesai}; 0060 milik sesi PR-04-08/09/10/18 memakai IF NOT EXISTS
pada kolom bersama. POST/PUT/skip/deactivate memakai Idempotency-Key. WO preventif terbit
harian 06.00 WIB, memiliki nomor WO dan prioritas Sedang, tanpa menonaktifkan aset saat terbit.
Penguncian jadwal, aset, serta indeks unik siklus mencegah duplikasi. WO Tidak Dapat Diperbaiki
masih menunggu verifikasi, sehingga tidak dianggap akhir siklus oleh pembangkit.

Snapshot checklist tidak berubah ketika jadwal diubah. WO menunggu aset ditolak saat mulai;
job melepaskan penanda dan menotifikasi teknisi saat aset kembali Tersedia, termasuk ketika
jadwal dinonaktifkan. finishPreventiveWorkOrder terdaftar pada completion-hooks sesi lain;
hook memperbarui siklus dalam transaksi verifikasi, dari waktu_selesai pekerjaan (fallback
waktu penutupan), dan tidak maju dua kali ketika dipanggil ulang. Lewati dengan alasan
tersimpan pada audit, riwayat per aset, serta jenis linimasa PREVENTIF_DILEWATI.

P-45 memiliki daftar/filter URL/paginasi dan formulir buat; kategori mengusulkan interval
namun dapat ditimpa. P-46 memuat detail, ubah, checklist, daftar WO terbit, serta dialog alasan
untuk lewati/nonaktifkan. Komponen mengikuti token dan primitif UI yang ada; modul dimuat
secara lazy. Integrasi bersama dipertahankan dan handoff tersedia di tmp/pr0407-handoff.md.

Validasi lokal: 7 integrasi PostgreSQL lulus (tmp/pr0407-integration.json), termasuk HTTP
403/422/replay, H-7 vs H-8, hari libur, anggota kategori baru, job konkuren, checklist snapshot,
hook idempoten, skip/nonaktif, WO menunggu pada jadwal nonaktif dan replay NT-28. 51 uji API
terarah (3 kalender + registri/HTTP/OpenAPI) dan 17 uji web (4 jadwal + navigasi) lulus; axe
lulus pada daftar, detail dan formulir. Chrome build produksi pada 320/768/1024/1440 lulus,
keyboard/dialog berfungsi, tanpa overflow/error JS (tmp/pr0407-browser.json). Migration
0059 bersama 0060 up/down/down/up lulus pada PostgreSQL/database sementara terisolasi.
Typecheck produksi dan source uji API/web, lint berkas terkait, batas impor, build web,
audit_docs serta validate_impl lulus. Snapshot registri/OpenAPI diperbarui mengikuti endpoint
dua sesi yang kini terpasang. Peringatan build dynamic/static NotificationCenterPage tetap
berasal dari kode sebelumnya. Tidak ada PR remote, staging, atau push perangkat nyata;
status kanonik tetap In Progress sampai alur review/merge selesai.

### PR-04-08/09/10/18 — Eksekusi, verifikasi, riwayat dan UI WO (14 Oktober 2026)

Pengguna meminta empat PR bersama dan membuka sesi lain untuk PR-04-07 pada folder yang sama.
Pembagian dikonfirmasi melalui pertanyaan: 0059 milik jadwal preventif, 0060 milik eksekusi;
perubahan routes/schema/notifikasi dipertahankan secara aditif. Implementasi dikerjakan lokal,
tanpa commit/PR remote/merge. Gabungan implementasi L diminta pengguna karena kontrak eksekusi,
penutupan, riwayat dan layar menggunakan detail WO yang sama; batas layanan tetap dipisahkan.

Keputusan melalui pertanyaan telah dinaikkan ke PRD M-12/M-20/M-06, SDD-05, UX dan acceptance
phase ini sebelum laporan selesai. Mulai/progres/tertunda/revisi/selesai wajib daring; hanya
foto boleh diantrekan luring. Revisi estimasi melebihi ambang rupiah membutuhkan keputusan
Petugas/Admin di detail WO; ambang awal null, wajib dikonfigurasi. NT-24 diperluas menjadi
notifikasi tindakan Petugas/Admin (hasil selesai, Tertunda, atau estimasi menunggu); judul/isi
mengikuti kejadian. NT-25 tetap pengembalian dan NT-26 penutupan terverifikasi.

0060 menambah rincian biaya dan relasi foto hasil, metadata penundaan, verifikasi dan estimasi,
serta dua setting nullable tanpa angka operasional buatan. Checklist bersama 0059 menggunakan
IF NOT EXISTS dan tidak dihapus oleh down 0060. Constraint setting menjaga pengecualian denda
yang sudah ada dan dipulihkan saat down. Mutation mengunci WO sesuai scope dan memakai
Idempotency-Key; biaya dihitung per baris dengan nominal presisi tetap. Penyelesaian memerlukan
checklist normal lengkap, minimal satu foto CLEAN terkonfirmasi dan tidak ada foto tertaut
belum siap maupun estimasi menunggu. Foto gagal scan dapat dilepas/diganti sebelum pengajuan.

Penutupan memilih kondisi pasca-perbaikan, mencatat riwayat kondisi/status M-04, menutup tiket
M-11 dan menjalankan hook siklus PR-04-07 dalam transaksi yang sama dengan audit/outbox.
WO ruangan tidak memerlukan kondisi aset; Tidak Dapat Diperbaiki membutuhkan Rusak Berat.
Pengembalian wajib catatan dan menghapus waktu selesai untuk pengajuan ulang. Pemulihan status
aset memperhitungkan WO lain, pinjaman dan slot berjalan; notifikasi diproses setelah commit.
Riwayat menyertakan semua status, biaya/durasi/interval, rekomendasi dari setting dan jenis
linimasa PEMELIHARAAN. Pembacaan biaya mengikuti scope permission sendiri, bukan hanya
workorder.view; ringkasan Teknisi diberi keterangan penugasan sendiri.

P-42 memakai filter URL termasuk teknisi berscope, daftar/paginasi; P-43 memilih objek/teknisi
serta garansi; P-44 mencakup progres/biaya/foto, estimasi, penundaan, penyelesaian dan verifikasi.
P-41 menautkan WO terbit dan P-18 menautkan formulir aset terpilih. MS-16/MS-17 menggunakan
API yang sama, daftar prioritas dan master-detail tablet. QR aset membuka penugasan/riwayat;
foto hasil terkompresi masuk SQLite sebelum presign, menaut setelah confirm secara idempoten,
terpisah per akun. Catatan/checklist/biaya/token tidak disimpan dalam antrean. Foto lokal WO
yang belum tertaut menghalangi pengajuan hasil; percobaan mutasi belum pasti dapat diulang
memakai payload dan kunci yang sama. UI preventif menampilkan penjelasan menunggu tersedia.

Validasi PostgreSQL: 23 integrasi M-12 lulus (10 eksekusi, 6 pembentukan WO, 7 jadwal), termasuk
penolakan scope/permission, replay, checklist/foto, revisi estimasi, kondisi/tiket, biaya dan
hook siklus sesudah aset kembali. Migration 0060 up/down/up dan 0059+0060 down/down/up lulus
pada database sementara acak; database aplikasi tidak digunakan. Bukti:
tmp/pr0408-integration-final.json dan tmp/pr0408-migration.mjs. Browser Chrome produksi
320/768/1024/1440 lulus daftar/formulir/detail/verifikasi, navigasi keyboard, tanpa overflow
atau error JS (tmp/pr0408-browser.json); pagination 320px yang semula meluber diperbaiki.

Uji unit API awal: 1.460 lulus, dua timeout lint Clock saat beban pemeriksaan bersamaan.
Pengulangan terpisah lima uji Clock lulus dengan default timeout CLI 60 detik (timeout eksplisit
15 detik scan sumber tetap berlaku); tidak ada pelanggaran Clock dan tes tidak dilonggarkan
pada source. Bukti tmp/pr0408-api-unit.json dan tmp/pr0408-clock-final.json. Build web dan
ekspor Hermes Android/iOS lulus; peringatan dynamic/static NotificationCenterPage berasal dari
kode sebelumnya. Ini bukti lokal; QA perangkat nyata, staging, push fisik, CI dan tinjauan
arsitek migration sebelum merge belum diklaim selesai. Status kanonik tetap In Progress.

Validasi akhir perubahan scope biaya dan antrean: 10 integrasi eksekusi diulang dan lulus
(tmp/pr0408-integration-scope-final.json); 44 uji terarah API (keamanan biaya, aturan eksekusi,
registri dan OpenAPI) lulus. 65 uji mobile lulus, termasuk antrean SQLite bertahan setelah
restart, pemisahan akun dan pengajuan menunggu foto lokal. Web: 10 uji WO serta 14 uji kerusakan
lulus, termasuk axe, keputusan estimasi, replay payload/key, dan catatan/checklist yang tidak
hilang saat foto dilepas. Typecheck produksi/source uji API/web, lint perubahan, batas impor,
audit_docs dan validate_impl lulus. Bukti tambahan tmp/pr0408-api-targeted-final.json,
tmp/pr0408-mobile-final.json dan tmp/pr0408-web-wo-final.json. Layar detail mobile memakai key
per akun/WO untuk membuang draft memori saat akun berganti.

### 14 Oktober 2026 — PR-04-11/12/13/14/19: opname aset

Implementasi lokal M-13 dan P-47 sampai P-50 tersedia; status kanonik In Progress.
Keputusan AskUserQuestion telah dinaikkan ke PRD M-13 §6, PRD mobile, SDD-05/07/09/12
serta UX sebelum laporan implementasi. Snapshot/klaim aset aktif, scan/temuan/foto SQLite,
identitas minimum 72 jam, persetujuan langsung audit.approve dan PDF/XLSX dibangun bersama.
Hasil belum tersinkron tetap dipertahankan sesudah cache kedaluwarsa; logout menghapus
cache/antrean akun. Lokasi fisik tanpa target termasuk dalam cakupan inspeksi temuan.

Bukti dan batas validasi ada pada
[audit lokal PR-04-11/12/13/14/19](../audits/pr-04-11-12-13-14-19-local-2026-10-14.md).
9 integrasi PostgreSQL, 40 uji shared API, 73 uji mobile, dan 17 uji web lulus.
Migration 0061 up/down/up hanya menggunakan database sementara acak; PDF Chromium nyata,
XLSX frozen, 200 scan SQLite bertahan restart, konflik dua operator, rollback perubahan
aset terbaru, pinjaman dan penarikan foto gagal diuji. Chrome produksi 16 kombinasi
halaman/lebar lulus; bundle Hermes Android/iOS berhasil. Lint/batas impor/dokumen lulus.
QA perangkat nyata 1.000 unit, force-close native, staging, push fisik dan CI belum
terverifikasi; hasil lokal ini belum dikomit/push atau dibuat PR remote.
