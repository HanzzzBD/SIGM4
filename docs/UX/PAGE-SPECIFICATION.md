# Page Specification — SIGM4 UX

> **Dokumentasi UX SIGM4** — [Overview](UX-SPEC.md) · [Information Architecture](INFORMATION-ARCHITECTURE.md) · [Navigation](NAVIGATION.md) · **Page Specification** · [User Flows](USER-FLOWS.md) · [Decisions](DECISIONS.md)

**Berkas ini memuat:**

| § | Bagian | Isi |
|---|---|---|
| [6](#6-page-inventory) | Page Inventory | 87 halaman web (`P-01`…`P-87`) + 23 layar mobile (`MS-01`…`MS-23`), lengkap dengan entry point & exit point |
| [7](#7-page-specification) | Page Specification | Empat arketipe layout, pola aksi destruktif, pola lima keadaan global, pola pencarian/filter, pola drawer, spesifikasi halaman kunci |
| [8](#8-dashboard-specification) | Dashboard Specification | Zonasi, sasaran drill-down per kartu untuk enam varian dashboard, keadaan kosong |
| [10](#10-responsive-ux) | Responsive UX | Empat titik henti, perilaku per komponen, tata letak tablet |
| [11](#11-accessibility-ux) | Accessibility UX | Penjabaran `NFR-AC-01`…`NFR-AC-09` dan daftar periksa `DS-06` |

Penomoran bagian dipertahankan dari UX-SPEC v1.0 agar seluruh rujukan silang tetap sahih — peta lengkap ada di [Peta bagian → berkas](UX-SPEC.md#peta-bagian--berkas). §9 (User Flows) berada di [`USER-FLOWS.md`](USER-FLOWS.md).

| Berkas tetangga | Kaitan |
|---|---|
| [`INFORMATION-ARCHITECTURE.md`](INFORMATION-ARCHITECTURE.md) | §4 sitemap memetakan seluruh route yang diinventarisasi §6 |
| [`NAVIGATION.md`](NAVIGATION.md) | §5 menetapkan bagaimana pengguna berpindah antar halaman yang dispesifikasikan di sini |
| [`USER-FLOWS.md`](USER-FLOWS.md) | §9 merangkai halaman-halaman ini menjadi 25 alur ujung-ke-ujung |
| [`DECISIONS.md`](DECISIONS.md) | **UXD-02**, **UXD-04**, **UXD-05**, **UXD-06**, **UXD-07**, **UXD-11**, **UXD-12** membentuk bagian-bagian di berkas ini |

---

# 6. Page Inventory

## 6.1 Cara membaca

| Kolom | Ketentuan |
|---|---|
| **ID** | `P-xx` untuk halaman web, `MS-xx` untuk layar mobile. Dipakai sebagai rujukan pada §7, §9, dan §13 |
| **Route** | Path web. `{id}` = pengenal numerik; `{uuid}` = UUIDv4 aset (`FR-05.1`) |
| **Permission** | Kode Lampiran C yang mengendalikan visibilitas. `Bearer` = cukup terautentikasi. `Publik` = tanpa autentikasi |
| **Entry point** | Dari mana pengguna sampai. Setiap halaman memiliki **minimal satu** |
| **Exit point** | Ke mana pengguna melanjutkan. Setiap halaman memiliki **minimal satu** — tanpa pengecualian (`UX-05`) |

Total: **87 halaman web** · **23 layar mobile**.

## 6.2 Halaman publik & gerbang sesi (M-01, M-05)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-01 | Login | `/login` | Membuktikan identitas (`FR-01.1`) | Publik | Buka aplikasi · sesi berakhir · logout · deep link belum login | Dashboard · Verifikasi 2FA · Ganti Password Wajib · Lupa Password · Pemberitahuan Privasi |
| P-02 | Verifikasi 2FA | `/login/2fa` | Faktor kedua TOTP atau kode cadangan (`FR-01.5`) | Challenge token, 5 menit (`SDD-SESS-10`) | Login berhasil pada akun ber-2FA | Dashboard · Ganti Password Wajib · kembali ke Login bila challenge kedaluwarsa |
| P-03 | Aktivasi 2FA | `/login/2fa/aktivasi` | Mendaftarkan TOTP + menerbitkan 10 kode cadangan (`FR-01.5`) | Sesi terautentikasi, 2FA belum aktif | Login pertama role wajib 2FA (`BR-070`) | Dashboard (setelah 6 digit terverifikasi) |
| P-04 | Lupa Password | `/lupa-password` | Mengajukan permintaan reset ke Administrator (`FR-01.3`) | Publik | Tautan pada Login | Login — selalu dengan pesan netral (`FR-01.3 A1`) |
| P-05 | Ganti Password Wajib | `/ganti-password` | Mengganti password sementara sebelum menu apa pun dapat diakses (`FR-01.1 A4`) | Sesi ber-`must_change_password` | Login dengan password hasil reset · pemulihan break-glass | Dashboard. **Tidak ada exit lain** — gerbang `mustChangePassword` (`SDD-AUTH-09`) memblokir seluruh route lain |
| P-06 | Halaman Publik Aset | `/a/{uuid}` | Menampilkan identitas dasar aset hasil scan kamera bawaan (`FR-05.2 A3`) | Publik, rate limit 20/menit per IP | Scan QR dengan aplikasi kamera bawaan | Login untuk aksi lanjutan · tutup halaman. **Tidak pernah** menampilkan nilai, biaya, dokumen, foto berwajah, atau identitas peminjam (`DP-05`) |
| P-07 | Pemberitahuan Privasi | `/privasi` | Memenuhi kewajiban publikasi kebijakan privasi (`DP-01`) | Publik | Tautan pada Login dan pada Profil | Kembali ke halaman asal |
| P-08 | Tanpa Hak Akses | `/tidak-punya-akses` | Menjelaskan pembatasan tanpa mengonfirmasi keberadaan data (31.5) | Bearer | `403` dari endpoint mana pun · deep link ke objek di luar akses | Dashboard · saran menghubungi Administrator |
| P-09 | Data Tidak Lagi Tersedia | `/data-tidak-tersedia` | Objek rujukan sudah dihapus/dibatalkan (`FR-17.1 A1`) | Bearer | Notifikasi lama · deep link basi | Dashboard · Pusat Notifikasi |
| P-10 | Gangguan Sistem | `/gangguan` | Galat 5xx/503 dengan `request_id` yang dapat disalin (`NFR-R-10`) | — | Kegagalan server · `LLM_UNAVAILABLE` · `STORAGE_UNAVAILABLE` | Tombol "Coba lagi" · Dashboard |
| P-11 | Halaman Tidak Ditemukan | `/tidak-ditemukan` | Route tidak dikenali | — | URL salah | Dashboard · Pencarian global |

## 6.3 Batas lingkup web ↔ mobile

| Alur | Web | Mobile | Dasar |
|---|:---:|:---:|---|
| Login, 2FA, profil, notifikasi | ✅ | ✅ | `FR-01.1` |
| Dashboard | ✅ | ✅ ringkas | `FR-15.1` |
| CRUD aset, kategori, lokasi, impor massal | ✅ | — | `UX-01` administratif |
| Cetak label QR | ✅ | — | `FR-05.1` memerlukan printer |
| Scan QR + aksi kontekstual | ✅ kamera peramban | ✅ **utama** | `FR-05.2` · `NFR-C-05` |
| Kalender ruangan & pengajuan reservasi | ✅ **utama** | ✅ | `CAL-UI-07` |
| Serah terima & pengembalian | ✅ | ✅ **utama** | `FR-09.1` · `SDD-MOB` §4.1 |
| Perpanjangan peminjaman | ✅ | ✅ | `FR-09.5 AC` mewajibkan mobile |
| Lapor kerusakan berfoto | ✅ | ✅ **utama** | `FR-11.1` · `MOB-MED-01` |
| Verifikasi kerusakan & buat work order | ✅ | ✅ | `FR-11.2` |
| Eksekusi work order | 🔍 | ✅ **utama** | `FR-12.3 AC`: "seluruh alur dapat diselesaikan dari mobile" |
| Verifikasi & tutup work order | ✅ **utama** | ✅ | `FR-12.4` |
| Stock opname | ✅ sesi & rekonsiliasi | ✅ **pelaksanaan** | `FR-13.2 AC` |
| Persetujuan | ✅ | ✅ **wajib** | `FR-10.2 AC` · `FR-14.2 AC` |
| Pengadaan, penghapusan, analitik, activity log, pengaturan | ✅ | — | `UX-01` administratif |
| Chatbot | ✅ | ✅ | `FR-19.1` |

**Konsekuensi:** aplikasi mobile tidak memiliki entri untuk 9 dari 22 modul. Itu **disengaja** — `SDD-MOB` §4.1 menyatakannya secara eksplisit. Pengguna mobile yang membutuhkan alur administratif diarahkan ke web responsif melalui tautan pada layar terkait, bukan dibiarkan buntu.

## 6.4 Beranda (M-15, M-17, M-19)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-12 | Dashboard | `/` | Ringkasan visual + antrean tindakan sesuai role (`FR-15.1`, Bab 19) | `dashboard.view` | Login berhasil · logo topbar · entri sidebar | Drill-down tiap kartu KPI ke daftar sumbernya (19.1) · Aksi Cepat |
| P-13 | Pusat Notifikasi | `/notifikasi` | Seluruh pemberitahuan pengguna, terfilter & dapat ditandai terbaca (`FR-17.1`) | `notification.manage_own` | Ikon lonceng · sidebar · push notification | Deep link ke objek terkait · `/data-tidak-tersedia` bila objek hilang · Preferensi Notifikasi |
| P-14 | Riwayat Chatbot | `/chat` | Daftar sesi percakapan sendiri; lanjutkan atau mulai baru (`FR-19.2`) | `chat.use` | Panel chatbot → "Lihat riwayat" | Buka sesi · panel chatbot · tautan aksi dalam jawaban |

> Panel chatbot sendiri **bukan halaman**: ia overlay global yang dapat dibuka dari layar mana pun (`FR-19.1` langkah 1). Ia menutup diri saat pengguna mengikuti tautan aksi pada jawaban.

## 6.5 Aset & Bahan (M-03, M-04, M-05, M-06, M-22)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-15 | Inventaris Aset | `/aset` | Katalog aset terpaginasi dengan pencarian & filter gabungan (`FR-04.2`) | `asset.view` | Sidebar · drill-down kartu dashboard · pencarian global · hasil chatbot | Detail Aset · Tambah Aset · Impor Aset · Mutasi Lokasi · Cetak Label QR · Ekspor |
| P-16 | Tambah Aset | `/aset/baru` | Mendaftarkan 1–N unit sekaligus, masing-masing berkode & QR unik (`FR-04.1`) | `asset.create` | Tombol pada Inventaris · status kosong Detail Ruangan (`FR-03.2 A1`) | Daftar N aset yang terbentuk + tombol Cetak QR · batal kembali ke Inventaris |
| P-17 | Impor Aset | `/aset/impor` | Impor massal CSV/XLSX dengan laporan galat per baris (`FR-04.1 A2`, `E.5.1`) | `asset.create` | Tombol pada Inventaris | Laporan hasil impor → Inventaris terfilter pada aset baru · unduh templat |
| P-18 | Detail Aset | `/aset/{id}` | Profil unit beserta seluruh riwayatnya (`FR-04.2` langkah 5) | `asset.view` | Baris Inventaris · scan QR · Detail Ruangan · notifikasi · chatbot | Ubah · Mutasi · Ubah Kondisi · Lapor Kerusakan · Cetak QR · Usulkan Penghapusan · Riwayat Perubahan |
| P-19 | Ubah Aset | `/aset/{id}/ubah` | Memperbarui atribut aset (`FR-04.3`) | `asset.update` | Tombol pada Detail Aset | Detail Aset (simpan atau batal) |
| P-20 | Mutasi Lokasi | `/aset/mutasi` | Memindahkan hingga 50 unit secara atomik + berita acara (`FR-04.4`) | `asset.update` | Pemilihan massal pada Inventaris · tombol pada Detail Aset | Berita acara PDF · Inventaris terfilter lokasi tujuan |
| P-21 | Kategori Aset | `/kategori-aset` | CRUD kategori dua tingkat + interval preventif (`FR-04.5`) | `category.manage` | Sidebar · tautan "Kategori belum ada" pada form aset (`FR-04.1 A4`) | Kembali ke form aset · Jadwal Pemeliharaan |
| P-22 | Lokasi | `/lokasi` | Pohon Gedung → Area → Ruangan yang dapat diperluas (`FR-03.1`) | `location.view` | Sidebar | Detail Ruangan · tambah Gedung/Area/Ruangan |
| P-23 | Detail Ruangan | `/lokasi/ruangan/{id}` | Aset di dalam ruangan + ringkasan kondisi + jadwal tetap (`FR-03.2`, `FR-07.5`) | `location.view` | Pohon Lokasi · scan QR ruangan · Detail Aset | Detail Aset · Tambah Aset ke Lokasi Ini · tab Jadwal Tetap · Ekspor berita acara lokasi |
| P-24 | Label QR | `/label-qr` | Menyusun & mengunduh PDF label massal (`FR-05.1`) | `asset.qr_print` | Sidebar · Detail Aset · setelah Tambah Aset · setelah Penerimaan Pengadaan · kartu "Aset Belum Berlabel QR" | Unduh PDF · tandai `qr_terpasang` · Inventaris |
| P-25 | Scan QR (web) | `/scan` | Memindai lewat kamera peramban + input kode manual (`FR-05.2`, `NFR-C-05`) | `asset.view` | Sidebar | Detail Aset · aksi kontekstual sesuai role & status · input manual bila izin kamera ditolak |
| P-26 | Dokumen Aset | `/dokumen-aset` | Daftar lintas-aset: faktur, garansi, sertifikat, manual, berita acara (`FR-06.1`) | `asset_document.view` | Sidebar · drill-down kartu "Garansi Akan Berakhir" (19.3) | Detail Aset pemilik dokumen · unduh berkas (URL bertanda tangan 15 menit) |

| P-80 | Bahan | `/bahan` | Daftar bahan + saldo total + penanda stok menipis (`FR-22.2`) | `material.view` | Sidebar · drill-down kartu "Stok Bahan Menipis" | Detail Bahan · Tambah Bahan |
| P-81 | Tambah / Ubah Bahan | `/bahan/baru` · `/bahan/{id}/ubah` | Master jenis bahan: kategori, satuan, stok minimum (`FR-22.1`) | `material.manage` | Tombol pada P-80 | Detail Bahan (simpan atau batal) |
| P-82 | Detail Bahan | `/bahan/{id}` | Saldo per lokasi + kartu stok seluruh transaksi (`FR-22.2`) | `material.view` | Baris P-80 · scan QR bahan · notifikasi `NT-49` | Penyesuaian · Penerimaan · P-80 |
| P-83 | Kategori Bahan | `/kategori-bahan` | CRUD kategori bahan, terpisah dari kategori aset (`FR-22.1 A1`) | `material.manage` | Sidebar · tautan "Kategori belum ada" pada P-81 | P-80 |

## 6.6 Pemanfaatan (M-07, M-08, M-09, M-10)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-27 | Kalender Ruangan | `/kalender-ruangan` | Ketersediaan seluruh ruangan: harian, mingguan, bulanan (`FR-07.1`, `CAL-UI-01`) | `reservation.view` | Sidebar · dashboard "Ketersediaan Ruangan Hari Ini" · chatbot | Wizard Reservasi (klik slot kosong) · Detail Reservasi (klik slot terisi, bila berhak) · Detail Ruangan |
| P-28 | Katalog Aset | `/katalog-aset` | Aset yang dapat dipinjam + jumlah tersedia pada rentang tanggal (`FR-08.1`) | `reservation.view` | Sidebar · dashboard Aksi Cepat · chatbot | Wizard Reservasi · Detail Aset · saran tanggal bebas terdekat bila 0 (`FR-08.1 A2`) |
| P-29 | Wizard Pengajuan Reservasi | `/reservasi/baru` | Tiga langkah: pilih slot → detail → tinjau & ajukan (`FR-07.2`, `FR-08.2`) | `reservation.create` | Kalender Ruangan · Katalog Aset · Aksi Cepat dashboard | Detail Reservasi dengan nomor pengajuan · batal kembali ke asal · saran slot alternatif bila `409` |
| P-30 | Daftar Reservasi | `/reservasi` | Seluruh pengajuan reservasi, tersaring scope role (`FR-07.3`) | `reservation.view` | Sidebar · drill-down kartu "Pengajuan Saya" | Detail Reservasi · Wizard Pengajuan · Ekspor |
| P-31 | Detail Reservasi | `/reservasi/{id}` | Objek, jadwal, tanggal turunan, linimasa approval (`FR-10.3`) | `reservation.view` | Daftar Reservasi · notifikasi `NT-01`…`NT-09`, `NT-46` · kalender · chatbot | Batalkan (drawer beralasan) · Ajukan Ulang bila `Perlu Revisi` · Detail Peminjaman bila sudah diserahkan · Riwayat Perubahan |
| P-32 | Daftar Peminjaman | `/peminjaman` | Empat tab: Aktif · Akan Jatuh Tempo · Terlambat · Selesai (`FR-09.3`) | `loan.view` | Sidebar · drill-down kartu "Peminjaman Terlambat" & "Pengembalian Jatuh Tempo" | Detail Peminjaman · Antrean Serah Terima · Ekspor daftar keterlambatan |
| P-33 | Antrean Serah Terima | `/peminjaman/serah-terima` | Reservasi yang dijadwalkan diserahkan hari ini (`FR-09.1` langkah 1) | `loan.manage` | Sidebar · kartu "Serah Terima Hari Ini" (19.3) · scan QR aset `Direservasi` | Layar Serah Terima per reservasi · Detail Reservasi |
| P-34 | Detail Peminjaman | `/peminjaman/{id}` | Transaksi, unit, kondisi awal & akhir, jatuh tempo, denda terkait (`FR-09.2`) | `loan.view` | Antrean Serah Terima · Daftar Peminjaman · scan QR aset `Dipinjam` · notifikasi `NT-10`…`NT-14` | Proses Pengembalian · Ajukan Perpanjangan · Detail Kewajiban · Tandai Hilang · Riwayat Perubahan |
| P-35 | Denda & Kewajiban | `/denda` | Denda keterlambatan dan ganti rugi, tersaring scope role (`FR-09.4`) | `fine.view` | Sidebar · kartu "Denda Saya" · notifikasi `NT-15`…`NT-18` | Detail Kewajiban · Ekspor rekap per periode |
| P-36 | Detail Kewajiban | `/denda/{id}` | Rincian perhitungan: hari terlambat × tarif, penerapan cap, dan `jumlah_dibebaskan` bila ada (`BR-028`, `BR-028b`, `BR-028e`) | `fine.view` | Daftar Denda · Detail Peminjaman | Tandai Lunas (drawer) · Bebaskan (drawer beralasan — jenis `Keterlambatan` bagi `fine.waive`, jenis `Ganti Rugi` bagi `fine.waive_compensation` dengan isian nilai yang dibebaskan) · Detail Peminjaman asal |
| P-37 | Persetujuan Saya | `/persetujuan` | Kotak masuk lintas jenis pengajuan, terurut waktu & urgensi (`FR-10.2`) | `approval.decide` | Sidebar · notifikasi `NT-01`, `NT-05`, `NT-07` · kartu dashboard | Detail Keputusan · Delegasikan (drawer) |
| P-38 | Detail Keputusan | `/persetujuan/{id}` | Konteks lengkap + riwayat pemohon + ketersediaan objek, lalu keputusan (`FR-10.2` langkah 3) | `approval.decide` | Persetujuan Saya · deep link notifikasi | Setujui · Setujui Sebagian *(pengadaan & penghapusan saja)* · Tolak · Perlu Revisi — seluruhnya kembali ke Persetujuan Saya · tautan ke detail objek asal |

| P-84 | Katalog Bahan | `/katalog-bahan` | Bahan aktif + saldo tersedia per lokasi (`FR-22.4` langkah 1) | `material.view` | Sidebar · dashboard | Ajukan Permintaan Bahan |
| P-85 | Ajukan Permintaan Bahan | `/permintaan-bahan/baru` | Pilih bahan, jumlah, keperluan; ambang approval dievaluasi saat kirim (`FR-22.4`, `BR-086`) | `material.request` | Tombol pada P-84 | Detail Permintaan Bahan |
| P-86 | Daftar Permintaan Bahan | `/permintaan-bahan` | Permintaan tersaring scope role; tab menurut status (`FR-22.4`) | `material.view` | Sidebar · notifikasi `NT-50` | Detail Permintaan Bahan |
| P-87 | Detail Permintaan Bahan | `/permintaan-bahan/{id}` | Baris permintaan, linimasa approval, aksi penyerahan (`FR-22.5`) | `material.view` | P-86 · notifikasi `NT-50`/`NT-51` | P-86 · Penyerahan |

## 6.7 Perawatan (M-11, M-12)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-39 | Laporan Kerusakan | `/kerusakan` | Tiket dikelompokkan per status, dengan penanda pelanggaran SLA (`FR-11.3`) | `damage.view` | Sidebar · kartu "Laporan Kerusakan Baru" & "Kerusakan Kritis" · notifikasi `NT-19`, `NT-20` | Detail Tiket · Lapor Kerusakan · Ekspor |
| P-40 | Lapor Kerusakan | `/kerusakan/baru` | Membuat tiket: objek, deskripsi, urgensi, 1–5 foto (`FR-11.1`) | `damage.create` | Aksi Cepat dashboard · Detail Aset · hasil scan QR · Detail Ruangan | Detail Tiket dengan nomor · tiket eksisting bila sudah ada yang terbuka (`FR-11.1 A1`) |
| P-41 | Detail Tiket Kerusakan | `/kerusakan/{id}` | Deskripsi, foto, status, peringatan garansi, tiket & WO terkait (`FR-11.2`) | `damage.view` | Daftar Kerusakan · Detail Aset · notifikasi `NT-21` · deep link | Verifikasi (drawer) · Tolak (drawer beralasan) · Buat Work Order · Detail Work Order · Detail Aset |
| P-42 | Daftar Work Order | `/work-order` | Seluruh WO preventif & korektif, tersaring scope (`FR-12.1`) | `workorder.view` | Sidebar · kartu "Work Order Aktif" · notifikasi `NT-22`…`NT-28` | Detail Work Order · Buat Work Order |
| P-43 | Buat Work Order | `/work-order/baru` | Menugaskan pekerjaan ke teknisi beserta target & estimasi biaya (`FR-12.1`) | `workorder.create` | Tombol pada Detail Tiket · Daftar Work Order · Detail Aset | Detail Work Order dengan nomor · batal kembali ke asal |
| P-44 | Detail Work Order | `/work-order/{id}` | Deskripsi, foto pelapor, checklist, riwayat servis aset, biaya (`FR-12.3`, `FR-12.4`) | `workorder.view` | Daftar WO · Detail Tiket · scan QR aset dalam perbaikan · notifikasi | Mulai Kerjakan · Perbarui Progres · Tandai Tertunda · Ajukan Penyelesaian · Verifikasi & Tutup · Kembalikan ke Teknisi · Detail Aset |
| P-45 | Jadwal Pemeliharaan | `/jadwal-pemeliharaan` | Daftar jadwal preventif + jatuh tempo berikutnya (`FR-12.2`) | `maintenance.view_cost` / `maintenance.manage` | Sidebar · kartu "Jadwal Pemeliharaan Mendatang" (19.3) | Detail Jadwal · Buat Jadwal |
| P-46 | Detail Jadwal Pemeliharaan | `/jadwal-pemeliharaan/{id}` | Cakupan aset/kategori, interval, checklist, teknisi bawaan (`FR-12.2`) | `maintenance.manage` | Daftar Jadwal · Kategori Aset | Ubah · Nonaktifkan (drawer beralasan) · Lewati Sekali (drawer beralasan, `FR-12.2 A3`) · Work Order yang terbit dari jadwal ini |

## 6.8 Pengawasan (M-13, M-14, M-16, M-21)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-47 | Stock Opname | `/opname` | Daftar sesi opname beserta status dan progresnya (`FR-13.1`) | `audit.view` | Sidebar · kartu "Ringkasan Stock Opname" (19.4) · notifikasi `NT-30`…`NT-32` | Detail Sesi · Buat Sesi |
| P-48 | Buat Sesi Opname | `/opname/baru` | Menetapkan nama, periode, cakupan, pelaksana; membekukan snapshot (`FR-13.1`) | `audit.manage` | Tombol pada Stock Opname | Detail Sesi · peringatan bila cakupan menghasilkan 0 aset (`FR-13.1 A2`) |
| P-49 | Detail Sesi Opname | `/opname/{id}` | Progres per lokasi, daftar aset target, hasil pemeriksaan (`FR-13.2`) | `audit.view` | Daftar Opname · notifikasi | Rekonsiliasi · Batalkan Sesi (drawer beralasan) · Unduh Berita Acara bila `Selesai` · petunjuk melanjutkan pemindaian di aplikasi mobile |
| P-50 | Rekonsiliasi Opname | `/opname/{id}/rekonsiliasi` | Laporan selisih + keterangan wajib per selisih + pengiriman (`FR-13.3`) | `audit.manage` | Tombol "Selesaikan Sesi" pada Detail Sesi | Kirim ke Pimpinan · kembali ke Detail Sesi. Pengiriman diblokir sampai setiap `Tidak Ditemukan` diberi keterangan (`BR-058`) |
| P-51 | Pengadaan | `/pengadaan` | Daftar usulan, tersaring scope role (`FR-14.1`) | `procurement.view` | Sidebar · kartu "Status Pengadaan" (19.4) · notifikasi `NT-34`…`NT-36` | Detail Usulan · Buat Usulan |
| P-52 | Buat Usulan Pengadaan | `/pengadaan/baru` | Kepala usulan + baris item + lampiran; total dihitung sistem (`FR-14.1`, `BR-061`) | `procurement.create` | Tombol pada Pengadaan · rekomendasi penggantian dari Riwayat Servis (`FR-14.1 A2`) | Simpan sebagai Draf · Ajukan ke Detail Usulan · batal ke Pengadaan |
| P-53 | Detail Usulan Pengadaan | `/pengadaan/{id}` | Justifikasi, item, total, lampiran, linimasa approval (`FR-14.2`) | `procurement.view` | Daftar Pengadaan · notifikasi · Persetujuan Saya | Catat Penerimaan · Sunting bila `Perlu Revisi` · Tutup sebagai `Tidak Direalisasikan` (drawer beralasan) · Analitik pemanfaatan kategori (`FR-14.2 A3`) |
| P-54 | Catat Penerimaan | `/pengadaan/{id}/penerimaan` | Mencatat jumlah diterima dan mengonversinya menjadi N record aset (`FR-14.3`) | `procurement.receive` | Tombol pada Detail Usulan | Daftar aset yang terbentuk + Cetak QR massal · kembali ke Detail Usulan |
| P-55 | Penghapusan Aset | `/penghapusan` | Dua tab: usulan berjalan dan arsip aset terhapus (`FR-21.1`, `FR-21.3`) | `disposal.view` | Sidebar · notifikasi `NT-43`…`NT-45` | Detail Usulan · Buat Usulan · Ekspor rekapitulasi per tahun anggaran |
| P-56 | Buat Usulan Penghapusan | `/penghapusan/baru` | Memilih aset + alasan + justifikasi + tindak lanjut fisik (`FR-21.1`) | `disposal.create` | Tombol pada Penghapusan · Detail Aset · Work Order `Tidak Dapat Diperbaiki` (`FR-21.1 A4`) | Detail Usulan bernomor `HPS-…` · batal ke Penghapusan |
| P-57 | Detail Usulan Penghapusan | `/penghapusan/{id}` | Data pendukung otomatis per aset + linimasa approval (`FR-21.2`) | `disposal.view` | Daftar Penghapusan · notifikasi · Persetujuan Saya | Catat Pelaksanaan Fisik · Unduh Berita Acara · Pulihkan Aset 🔒 (`disposal.reinstate`) · Detail Aset |
| P-58 | Statistik & Analitik | `/analitik` | Pemilih tujuh jenis laporan + filter bersama (`FR-16.1`) | `report.view` | Sidebar · drill-down kartu dashboard Pimpinan | Laporan spesifik |
| P-59 | Laporan Analitik | `/analitik/{jenis}` | Grafik + tabel satu jenis laporan (`FR-16.1`) | `report.view` | Halaman Analitik · Detail Usulan Pengadaan (`FR-14.2 A3`) | Ekspor XLSX/PDF · mode perbandingan antar-periode · drill-down ke daftar sumber · notifikasi `NT-42` saat ekspor asinkron siap |

## 6.9 Sistem (M-01, M-02, M-10, M-18, M-19, M-20)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-60 | Pengguna | `/pengguna` | Daftar akun dengan filter role, status, unit kerja (`FR-02.1`) | `user.view` | Sidebar · kartu "Total Pengguna Aktif" (19.2) | Detail Pengguna · Tambah · Impor · Kenaikan Kelas Massal |
| P-61 | Tambah Pengguna | `/pengguna/baru` | Membuat akun + password sementara (`FR-02.1`) | `user.create` | Tombol pada Pengguna | Detail Pengguna dengan password sementara tampil **satu kali** · batal ke Pengguna |
| P-62 | Impor Pengguna | `/pengguna/impor` | Impor massal CSV/XLSX dengan laporan per baris (`FR-02.1 A4`, `E.5.2`) | `user.create` | Tombol pada Pengguna | Laporan hasil ke Pengguna · unduh templat |
| P-63 | Detail Pengguna | `/pengguna/{id}` | Profil, role, unit kerja, status, riwayat login | `user.view` | Daftar Pengguna · pencarian global | Ubah · Aktifkan/Nonaktifkan (drawer beralasan) · Reset Password 🔒 · Reset 2FA 🔒 · Riwayat Perubahan |
| P-64 | Kenaikan Kelas Massal | `/pengguna/kenaikan-kelas` | Menetapkan kelas baru atau menandai lulus pada pergantian tahun ajaran (`SL-02`) | `user.update` | Tombol pada Pengguna · pemicu setelah `AC-YR-02` | Laporan hasil ke Pengguna. Siswa dengan peminjaman aktif atau kewajiban belum lunas ditampilkan sebagai daftar terblokir (`SL-04`) |
| P-65 | Role & Permission | `/role` | Daftar role + jumlah pengguna & permission aktif (`FR-02.2`) | `role.view` | Sidebar | Matriks Permission · Salin Role sebagai templat (`FR-02.2 A2`) |
| P-66 | Matriks Permission | `/role/{id}` | Matriks domain × aksi untuk satu role (`FR-02.2`) | `role.view` / `role.update` | Daftar Role | Simpan ke Daftar Role · penolakan eksplisit saat mencabut permission inti 🔒 (`FR-02.2 A1`) |
| P-67 | Permintaan Reset Password | `/permintaan-reset-password` | Antrean permintaan + pencatatan metode verifikasi identitas (`FR-01.3`) | `user.reset_password` | Sidebar · kartu "Permintaan Reset Password" (19.2) · notifikasi `NT-37` | Terbitkan Password Sementara (tampil **satu kali**) · Tolak (drawer beralasan) |
| P-68 | Approval Rules | `/approval-rules` | Daftar aturan per jenis pengajuan beserta prioritasnya (`FR-10.1`) | `approval_rule.view` | Sidebar · kartu "Status Konfigurasi" (19.2) | Detail Aturan · Buat Aturan |
| P-69 | Editor Approval Rule | `/approval-rules/baru` · `/approval-rules/{id}` | Menyusun kondisi DSL + langkah berurutan + perilaku SLA (`FR-10.1`, Lampiran D) | `approval_rule.manage` | Daftar Approval Rules | Pratinjau (`RE-07`) · Simpan & Aktifkan ke Daftar · batal ke Daftar · penolakan `422 INVALID_RULE_DEFINITION` ditampilkan per node kondisi |
| P-70 | Parameter Sistem | `/pengaturan` | Sepuluh kelompok parameter global sebagai tab (`FR-20.1`) | `setting.view` / `setting.manage` | Sidebar | Simpan per kelompok · Kalender Akademik · Unit Kerja · peringatan dampak (`FR-20.1 A2`, `A3`) |
| P-71 | Kalender Akademik | `/pengaturan/kalender-akademik` | Tahun ajaran, semester, hari libur, hari kerja (`E.2`) | `setting.manage` | Tab pada Parameter Sistem | Simpan · picu Kenaikan Kelas Massal saat tahun ajaran aktif berganti (`AC-YR-02`) |
| P-72 | Unit Kerja | `/pengaturan/unit-kerja` | Master unit kerja & kelas (`E.3`) | `setting.manage` | Tab pada Parameter Sistem | Simpan · Nonaktifkan; penghapusan ditolak bila masih ada pengguna aktif (`WU-02`) |
| P-73 | Activity Log | `/activity-log` | Penelusuran jejak audit dengan filter gabungan (`FR-18.2`) | `activity_log.view` | Sidebar · kartu "Aktivitas Terbaru" (19.2) · tombol Riwayat Perubahan pada detail entitas | Detail Entri · Ekspor 🔒 (`activity_log.export`) · kembali ke entitas terkait |
| P-74 | Detail Entri Log | `/activity-log/{id}` | Perbandingan nilai sebelum/sesudah sebagai dua kolom berlabel Bahasa Indonesia (`FR-18.2 AC`) | `activity_log.view` | Baris Activity Log | Entitas terdampak · kembali ke Activity Log |
| P-75 | Monitoring Chatbot | `/monitoring-chatbot` | Metrik agregat: volume, pertanyaan tersering, rasio umpan balik, pertanyaan gagal (`FR-19.2`) | `chat.monitor` | Sidebar · kartu "Kesehatan Integrasi" (19.2) | Parameter Sistem kelompok Chatbot AI · daftar percakapan bertanda bermasalah |

## 6.10 Akun Saya (M-01, M-17)

| ID | Halaman | Route | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|---|
| P-76 | Profil | `/profil` | Menyunting nama, telepon, foto (`FR-01.4`) | Bearer | Menu pengguna topbar | Simpan · Keamanan & 2FA · Preferensi Notifikasi · Pemberitahuan Privasi. Email dan role **tidak dapat diubah sendiri** (`BR-069`) |
| P-77 | Keamanan & 2FA | `/profil/keamanan` | Ganti password, kelola 2FA & kode cadangan, keluar dari semua perangkat (`FR-01.4`, `FR-01.5`) | Bearer | Profil · menu pengguna | Simpan; sesi lain dicabut sementara perangkat ini tetap masuk · buat ulang kode cadangan saat tersisa 2 atau kurang |
| P-78 | Preferensi Notifikasi | `/profil/notifikasi` | Enam kelompok x dua kanal (`FR-17.3`, **UXD-05**) | `notification.manage_own` | Profil · Pusat Notifikasi · menu pengguna | Simpan, berlaku seketika. Kelompok wajib ditampilkan terkunci beserta penjelasannya (`FR-17.3 A1`) |
| P-79 | Perangkat Terhubung | `/profil/keamanan#perangkat` | Daftar sesi aktif per platform + pencabutan (`FR-01.2 A1`) | Bearer | Keamanan & 2FA | Cabut satu perangkat · Keluar dari semua perangkat ke Login |

## 6.11 Layar mobile

| ID | Layar | Tujuan | Permission | Entry point | Exit point |
|---|---|---|---|---|---|
| MS-01 | Login | Identitas + gerbang startup (`SDD-MOB` §4.5) | Publik | Buka aplikasi · sesi berakhir · deep link belum login | Verifikasi 2FA · Ganti Password Wajib · Beranda · tujuan deep link tersimpan |
| MS-02 | Verifikasi 2FA | TOTP / kode cadangan (`FR-01.5`) | Challenge token | Login pada akun ber-2FA | Beranda · kembali ke Login bila kedaluwarsa |
| MS-03 | Ganti Password Wajib | `FR-01.1 A4` | Sesi ber-`must_change_password` | Login dengan password sementara | Beranda. Tidak ada exit lain |
| MS-04 | Pembaruan Wajib | Layar `426` yang tidak dapat dilewati (`MOB-VER-03`) | — | Respons `426` pada permintaan mana pun | Tautan ke store. **Sengaja tanpa exit lain** |
| MS-05 | Beranda | Dashboard ringkas + Aksi Cepat (19.5–19.7) | `dashboard.view` | Tab Beranda · setelah login | Seluruh tab · Aksi Cepat · drill-down kartu |
| MS-06 | Tugas | Antrean kerja adaptif per permission (**UXD-03**) | Bervariasi | Tab Tugas · deep link notifikasi | Layar kerja terkait per seksi |
| MS-07 | Pemindai QR | Kamera native + mode beruntun + input manual (`FR-05.2`, `MOB-MED-05`…`07`) | `asset.view` | Tab Scan · tombol Scan dalam alur opname/mutasi/serah terima | Hasil Scan · input kode manual · panduan izin kamera (`MOB-MED-06`) |
| MS-08 | Hasil Scan | Profil aset + aksi kontekstual sesuai role dan status (`FR-05.2` langkah 4) | `asset.view` | Pemindai QR | Detail Aset · Serah Terima · Pengembalian · Catat Opname · Lapor Kerusakan · Perbarui Work Order · pindai lagi |
| MS-09 | Detail Aset | Profil, foto, riwayat; field finansial disaring server (`FR-04.2 A1`) | `asset.view` | Hasil Scan · Katalog · Chatbot · deep link | Lapor Kerusakan · Riwayat Servis · Ajukan Reservasi · kembali |
| MS-10 | Serah Terima | Verifikasi unit, kondisi awal, foto, konfirmasi digital (`FR-09.1`, 31.6) | `loan.manage` | Tab Tugas · Hasil Scan · Antrean Serah Terima | Bukti serah terima → Detail Peminjaman · substitusi unit (beralasan, `FR-09.1 A1`) |
| MS-11 | Pengembalian | Kondisi kembali, foto akhir, perhitungan denda (`FR-09.2`) | `loan.manage` | Tab Tugas · Hasil Scan aset `Dipinjam` | Ringkasan pengembalian · Detail Kewajiban bila denda terbit · Tiket Kerusakan bila kembali rusak |
| MS-12 | Peminjaman Saya | Peminjaman aktif + jatuh tempo (19.6, 19.7) | `loan.view` | Tab Tugas · Beranda | Detail Peminjaman · Ajukan Perpanjangan |
| MS-13 | Ajukan Perpanjangan | Tanggal baru + alasan (`FR-09.5`, wajib tersedia di mobile) | `loan.extend` | Detail Peminjaman | Detail Peminjaman + linimasa approval · tanggal maksimum yang masih mungkin bila `409` (`FR-09.5 A1`) |
| MS-14 | Denda Saya | Rincian kewajiban pribadi + status blokir (19.7) | `fine.view` | Tab Tugas · Beranda · notifikasi `NT-15`…`NT-18` | Detail Kewajiban · petunjuk pembayaran luring |
| MS-15 | Lapor Kerusakan | Deskripsi, urgensi, 1–5 foto terkompresi (`FR-11.1`, `MOB-MED-01`) | `damage.create` | Aksi Cepat · Hasil Scan · Detail Aset | Detail Tiket · tiket eksisting bila sudah ada (`FR-11.1 A1`) |
| MS-16 | Work Order Saya | Daftar berprioritas + target selesai (`FR-12.3`, 19.5) | `workorder.execute` | Tab Tugas · notifikasi `NT-22` | Detail Work Order |
| MS-17 | Eksekusi Work Order | Mulai, checklist, biaya, sparepart, foto hasil, selesai (`FR-12.3`) | `workorder.execute` | Work Order Saya · Hasil Scan | Ajukan Penyelesaian · Tandai Tertunda (beralasan) · Tandai Tidak Dapat Diperbaiki |
| MS-18 | Sesi Opname | Progres per lokasi + daftar aset target (`FR-13.2`) | `audit.execute` | Tab Tugas · notifikasi `NT-30` | Scan Opname per lokasi · Selesaikan Lokasi Ini |
| MS-19 | Scan Opname | Pemindaian beruntun + penetapan kondisi aktual (`FR-13.2`, `MOB-PERF-03`) | `audit.execute` | Sesi Opname | Sesi Opname · Temuan Baru · pilih dari daftar target bila QR rusak (`FR-13.2 A4`) |
| MS-20 | Persetujuan Saya | Kotak masuk approver di ponsel (`FR-10.2 AC`) | `approval.decide` | Tab Tugas · push `NT-01`, `NT-05`, `NT-07` | Detail Keputusan · Setujui · Tolak · Perlu Revisi |
| MS-21 | Chatbot | Percakapan streaming + tautan aksi (`FR-19.1`) | `chat.use` | Aksi Cepat · Beranda | Tautan aksi ke layar terkait · riwayat sesi · pesan gangguan bila `503` (`FR-19.1 A4`) |
| MS-22 | Sesi Opname Bahan | Progres per lokasi penyimpanan + daftar bahan target (`FR-13.4`, `MOB-PERF-06`) | `audit.execute` | Tab Tugas · notifikasi `NT-30` | Input Hitungan Fisik · Sesi Opname |
| MS-23 | Input Hitungan Fisik | Mencatat jumlah fisik per bahan; QR bahan melompat ke barisnya (`FR-13.4`, `BR-090`) | `audit.execute` | MS-22 · Pemindai QR | MS-22 |

---

# 7. Page Specification

Spesifikasi disusun dua lapis: **pola** (§7.1–§7.5) yang berlaku bagi banyak halaman, lalu **spesifikasi halaman kunci** (§7.6) yang hanya memuat hal-hal khas halaman itu. Pola tidak diulang pada tiap halaman.

## 7.1 Empat arketipe layout

Seluruh 87 halaman jatuh ke salah satu dari empat arketipe.

### A. Halaman Daftar

```
BREADCRUMB
JUDUL                                          [Aksi utama]  [... aksi lain]
+----------------------------------------------------------------------+
| PANEL FILTER                                                          |
| [ Cari ]  [ Kategori v ] [ Lokasi v ] [ Kondisi v ] [ Status v ]     |
| Filter aktif:  (Kategori: Komputer x)  (Kondisi: Baik x)  Hapus semua |
+----------------------------------------------------------------------+
| [ ] | Kode Aset ^ | Nama | Kategori | Lokasi | Kondisi | Status |     |
| [x] | LAB-KOM-0001  | ...  | ...      | ...    | Baik    | Tersedia |  |
| ...                                                                   |
+----------------------------------------------------------------------+
| 3 dipilih:  [Cetak QR]  [Mutasi Lokasi]  [Ekspor]                    |
| Menampilkan 1-25 dari 4.820        [< 1 2 3 ... 193 >]  [25 v]       |
+----------------------------------------------------------------------+
```

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| Paginasi | Server-side, bawaan 25, maksimum 100. Menampilkan total & jumlah halaman | 17.1 · `SDD-API-05` |
| Filter di URL | Seluruh filter, pengurutan, dan halaman tercermin di URL agar tautan dapat dibagikan | `FR-04.2` · `SDD-FE-10` |
| Chip filter aktif | Setiap filter aktif tampil sebagai chip yang dapat dihapus satu per satu | 31.3 |
| Pemilihan massal | Hanya pada daftar yang memiliki aksi massal (Inventaris, Label QR, Penghapusan) | `FR-04.4` · `FR-05.1` |
| Pengurutan | Klik kepala kolom; arah ditandai ikon **dan** `aria-sort` | `NFR-AC-06` |
| Ekspor | Mengekspor **hasil filter saat ini**, bukan seluruh tabel; > 5 detik diproses asinkron | `FR-04.2 A3` · `NFR-P-08` |
| Baris | Seluruh baris dapat diklik menuju detail; kolom aksi tetap ada untuk papan ketik | `NFR-AC-03` |

### B. Halaman Detail

```
BREADCRUMB
LAB-KOM-0002 · Komputer Lab 1        [Baik] [Tersedia]      [Ubah] [...]
Kategori Komputer · Lab Komputer 1 · Diperoleh 2024
+----------------------------------------------------------------------+
| [Informasi] [Foto] [Dokumen] [Peminjaman] [Pemeliharaan] [Riwayat]   |
+----------------------------------------------------------------------+
| ...konten tab...                                                      |
+----------------------------------------------------------------------+
```

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| Kepala halaman | Identitas yang dikenali pengguna (kode aset / nomor dokumen) + lencana status + aksi utama | `UX-03` |
| Tab | Tab tercermin di URL sebagai segmen (`/aset/3021/servis`) agar dapat ditautkan | `UXP-01` |
| Aksi utama | Maksimum dua tombol terlihat; sisanya di menu "..." | — |
| Aksi singkat | Membuka drawer di atas halaman; route menerima parameter `?aksi=` sehingga dapat ditautkan | **UXD-02** |
| Riwayat Perubahan | Tombol pada setiap detail entitas, membuka Activity Log terfilter entitas ini | `FR-18.2 A2` |
| Field terbatas | Field di luar permission **tidak dirender**, bukan disamarkan — server memang tidak mengirimkannya | `SDD-AUTH-06` · `SEC-T-02` |

### C. Halaman Formulir & Wizard

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| Label | Eksplisit di atas field, tidak pernah hanya placeholder | `NFR-AC-05` |
| Validasi | Inline saat blur; pesan galat di bawah field, ditautkan `aria-describedby` | 31.3 · `SDD-FE` §4.6 |
| Skema | Aturan validasi klien identik dengan server karena berasal dari skema bersama | `SDD-FE-05` · `SDD-REPO-05` |
| Pengiriman ganda | Tombol simpan dinonaktifkan selama permintaan berjalan; endpoint transaksional mengirim `Idempotency-Key` | `ID-01` · 31.3 |
| Field wajib | Ditandai teks "wajib", bukan hanya tanda bintang berwarna | `NFR-AC-06` |
| Angka uang | Diformat rupiah saat tampil, dikirim sebagai string desimal | `SDD-API` §4.3 |
| Wizard | Indikator langkah, dapat mundur tanpa kehilangan isian, langkah terakhir selalu **Tinjau** | **UXD-04** |
| Batal | Konfirmasi bila ada perubahan belum tersimpan | `UX-04` |
| Draf | Hanya pada Usulan Pengadaan — satu-satunya entitas yang PRD nyatakan punya status `Draf` bagi pemohon | `FR-14.1 A1` |

### D. Halaman Papan & Kalender

Hanya dua halaman: Kalender Ruangan (P-27) dan Katalog Aset (P-28). Spesifikasi penuh pada §7.6.1.

## 7.2 Pola aksi destruktif

`UX-04` mewajibkan konfirmasi **dan alasan**. Tabel berikut adalah daftar tertutup — tidak ada aksi destruktif lain di sistem ini.

| Aksi | Halaman | Alasan wajib | Dasar |
|---|---|---|---|
| Batalkan reservasi | P-31 | ✅ | `BR-025` |
| Batalkan reservasi milik orang lain | P-31 | ✅ | `FR-07.3 A2` · `reservation.cancel_any` |
| Ubah kondisi aset | P-18 | ✅ | `BR-007` |
| Nonaktifkan aset | P-18 | ✅ | `BR-008` |
| Bebaskan denda keterlambatan | P-36 | ✅ | `BR-031` |
| Bebaskan ganti rugi (penuh/sebagian) | P-36 | ✅ | `BR-028e` |
| Tandai aset hilang | P-34 | ✅ | `FR-09.2 A2` · `BR-012` |
| Tolak tiket kerusakan | P-41 | ✅ | `FR-11.2 AC` |
| Kembalikan work order ke teknisi | P-44 | ✅ | `FR-12.4 A1` |
| Tandai work order tertunda / tidak dapat diperbaiki | P-44 · MS-17 | ✅ | `FR-12.3 A1`, `A2` |
| Lewati pemeliharaan preventif | P-46 | ✅ | `FR-12.2 A3` |
| Batalkan sesi opname | P-49 | ✅ | `FR-13.3 A3` |
| Tolak pengajuan (approval) | P-38 · MS-20 | ✅ | `BR-042` |
| Tutup usulan sebagai Tidak Direalisasikan | P-53 | ✅ | `FR-14.3 A4` |
| Tolak item saat penerimaan | P-54 | ✅ + foto | `FR-14.3 A2` |
| Eksekusi penghapusan aset | P-57 | ✅ + saksi + foto | `FR-21.2` langkah 3 |
| Pulihkan aset terhapus | P-57 | ✅ | `BR-065g` |
| Nonaktifkan pengguna | P-63 | ✅ | `FR-02.1` langkah 7 |
| Reset 2FA pengguna lain | P-63 | ✅ | `FR-01.5 A3` |
| Tolak permintaan reset password | P-67 | ✅ | `FR-01.3 A2` |
| Nonaktifkan approval rule | P-69 | ✅ | `FR-10.1 A4` |
| Nonaktifkan lokasi / kategori / unit kerja | P-21 · P-22 · P-72 | ✅ | `BR-015` · `FR-04.5 A2` · `WU-02` |
| Regenerasi UUID QR 🔒 | P-18 | ✅ | `FR-05.1 A2` |
| Keluar dari semua perangkat | P-77 · P-79 | — konfirmasi saja | `FR-01.2 A1` |

**Bentuk dialog destruktif:** judul menyatakan konsekuensi konkret ("Batalkan reservasi RSV-RG-2026-0087?"), badan menyebutkan dampak turunan (slot dibebaskan, pemohon dinotifikasi), field alasan wajib terisi sebelum tombol aktif, dan tombol utama diberi label kata kerjanya — bukan "OK".

## 7.3 Pola lima keadaan global

Ditetapkan `ui-foundation.md §31.5`. Tabel berikut menjabarkannya menjadi ketentuan yang dapat di-wireframe, dan **berlaku pada setiap halaman** tanpa perlu diulang di §7.6.

| Keadaan | Bentuk | Aksi berikutnya wajib | Rujukan |
|---|---|---|---|
| **Memuat** | *Skeleton* menyerupai bentuk konten akhir — baris tabel, kartu, atau kisi kalender. **Bukan** spinner layar penuh. Tiap kartu dashboard memuat mandiri | — | 19.1 A2 · `SDD-FE` §4.7 |
| **Kosong** | Ikon/ilustrasi + satu kalimat penjelas + **tombol aksi berikutnya** | Ya — mis. "Tambah Aset ke Lokasi Ini" pada ruangan kosong (`FR-03.2 A1`); "Sesuaikan filter" pada hasil pencarian nihil (`FR-04.2 A2`); "Coba rentang lain" pada laporan kosong (`FR-16.1 A1`) | 31.5 · `UX-05` |
| **Galat** | Pesan yang dapat dimengerti pengguna, tanpa detail teknis, + `request_id` yang dapat disalin | Ya — tombol "Coba lagi" | `NFR-R-10` · 31.5 |
| **Tanpa hak akses** | Menjelaskan akses dibatasi + saran menghubungi Administrator. **Tidak** mengonfirmasi apakah datanya ada | Ya — kembali ke Dashboard | 17.5 poin 3 · `SDD-AUTH-08` |
| **Luring / koneksi putus** | Banner persisten; aksi yang memerlukan koneksi dinonaktifkan **beserta penjelasan mengapa** | Ya — "Coba lagi setelah tersambung" | `NO-07` · `MOB-OFF-05` |

### Keadaan sukses

`31.5` tidak menyebutkannya, sehingga ditetapkan di sini sebagai konsekuensi `UX-05` (**UXD-06**):

| Jenis operasi | Umpan balik | Contoh |
|---|---|---|
| Perubahan in-place (simpan, tandai terbaca, ubah preferensi) | Toast singkat + keadaan baru langsung terlihat | Preferensi notifikasi tersimpan |
| Operasi menghasilkan objek bernomor | **Berpindah** ke halaman detail objek, menampilkan nomornya sebagai bukti | `RSV-RG-2026-0001` terbentuk (`FR-07.2` langkah 7) |
| Operasi massal | Halaman ringkasan hasil: jumlah sukses, jumlah gagal, alasan per baris — **bukan** toast | Impor 500 aset (`IMPT-02`) |
| Operasi menghasilkan berkas | Tautan unduh langsung bila sinkron; notifikasi `NT-42` bila asinkron | Berita acara PDF · ekspor 1 tahun |
| Aksi lapangan bermakna hukum | Layar bukti yang dapat ditunjukkan kepada pihak lain | Bukti serah terima (31.6) |

### Keadaan khas yang wajib ditangani

| Keadaan | Halaman terdampak | Rujukan |
|---|---|---|
| Konflik slot / unit habis saat submit | P-29 · MS-13 | `409 RESERVATION_CONFLICT` / `409 ASSET_NOT_AVAILABLE` · `CI-04`. Wajib menampilkan **saran slot alternatif terdekat** (`FR-07.2 A1`) atau **tanggal bebas terdekat** (`FR-08.1 A2`), bukan sekadar pesan gagal |
| Pengajuan sudah diputuskan approver lain | P-38 · MS-20 | `409 APPROVAL_ALREADY_DECIDED` — menampilkan **siapa** memutuskan dan **kapan** (`RE-09`) |
| Pemohon terblokir kewajiban | P-29 | `422 BORROWER_BLOCKED` — menampilkan daftar kewajiban + tautan ke Denda Saya (`BR-030`) |
| Kuota pengajuan tertunda terlampaui | P-29 | `BR-023a` — menampilkan jumlah berjalan dan batasnya, + tautan ke Daftar Reservasi |
| Durasi melebihi batas role | P-29 · MS-13 | `422 DURATION_EXCEEDED` — menampilkan batas yang berlaku (`BR-021`) |
| Slot tentative kedaluwarsa | P-31 | `BR-023b` · `NT-46` — status `Kedaluwarsa` + tombol "Ajukan Ulang" |
| Aset masih bergaransi | P-41 · P-56 | `BR-052` · `FR-21.1 A2` — peringatan + tautan ke dokumen garansi |
| Berkas belum lolos pemindaian AV | P-18 · P-26 | `NFR-S-18` — status "Sedang diperiksa", tombol unduh nonaktif dengan penjelasan |
| Foto belum terunggah (mobile) | MS-10 · MS-11 · MS-15 · MS-17 | `MOB-OFF-04` — penanda pada entitas + daftar tindak lanjut Petugas Sarpras |
| Layanan LLM tidak tersedia | MS-21 · panel chatbot | `503 LLM_UNAVAILABLE` — arahkan ke pencarian manual (`FR-19.1 A4`); **tidak boleh** memengaruhi layar lain (`NFR-A-05`) |
| Batas percakapan harian tercapai | MS-21 | `FR-19.1 A5` — tampilkan waktu ketersediaan berikutnya |
| Versi aplikasi tidak didukung | MS-04 | `426 UPGRADE_REQUIRED` (`MOB-VER-03`) |
| Izin kamera ditolak | MS-07 · P-25 | `MOB-MED-06` · `FR-05.2 A4` — panduan mengaktifkan + input kode manual |
| Akun terkunci | P-01 · MS-01 | `423 ACCOUNT_LOCKED` — menampilkan sisa waktu penguncian (`FR-01.1 A2`) |
| Batas laju terlampaui | seluruh halaman | `429 RATE_LIMIT_EXCEEDED` — menampilkan waktu tunggu dari header `X-RateLimit-*` (`NFR-S-07`) |

## 7.4 Pola pencarian, filter, dan pengurutan

| Halaman | Cari | Filter | Urutkan | Rujukan |
|---|---|---|---|---|
| P-15 Inventaris Aset | Kode aset, nama, merek, nomor seri | Kategori, lokasi, kondisi, status, tahun perolehan, kelayakan pinjam | Kode aset, nama, tahun, kondisi | `FR-04.2` |
| P-23 Detail Ruangan | Nama aset | Kategori, kondisi, status | Kode aset | `FR-03.2` |
| P-26 Dokumen Aset | Nama berkas, kode aset | Jenis dokumen, masa garansi, kategori | Tanggal unggah, tanggal berakhir garansi | `FR-06.1` |
| P-27 Kalender Ruangan | Nama ruangan | Gedung, jenis ruangan, kapasitas minimum | — (dimensi waktu) | `FR-07.1` |
| P-80 Bahan | Nama bahan | Kategori bahan, lokasi penyimpanan, status stok (menipis/aman), status bahan | Nama, saldo total | `FR-22.2` |
| P-84 Katalog Bahan | Nama, kategori | Kategori bahan, lokasi penyimpanan, hanya yang bersaldo | Nama, saldo tersedia | `FR-22.4` |
| P-86 Daftar Permintaan Bahan | Nomor, pemohon | Tab status, pemohon, rentang tanggal | Tanggal pengajuan | `FR-22.4` |
| P-28 Katalog Aset | Nama, kategori | Kategori, rentang tanggal, hanya yang tersedia | Nama, jumlah tersedia | `FR-08.1` |
| P-30 Daftar Reservasi | Nomor pengajuan, nama kegiatan | Jenis, status, pemohon, rentang tanggal | Tanggal pengajuan, waktu mulai | `FR-07.3` |
| P-32 Daftar Peminjaman | Nomor, nama peminjam, kode aset | Tab status, peminjam, kategori, rentang tanggal | Jatuh tempo, lama keterlambatan | `FR-09.3` |
| P-35 Denda & Kewajiban | Nomor peminjaman, nama | Jenis (`Keterlambatan`/`Ganti Rugi`), status, periode | Jumlah, tanggal terbit | `FR-09.4` |
| P-37 Persetujuan Saya | Nomor pengajuan, pemohon | Jenis pengajuan, urgensi, sisa SLA | Waktu pengajuan, sisa SLA | `FR-10.2` |
| P-39 Laporan Kerusakan | Nomor tiket, kode aset | Status, urgensi, lokasi, kategori, pelapor, rentang tanggal | Waktu lapor, urgensi | `FR-11.3` |
| P-42 Work Order | Nomor WO, kode aset | Jenis, status, prioritas, teknisi, rentang tanggal | Target selesai, prioritas | `FR-12.1` |
| P-51 Pengadaan | Nomor, judul | Status, prioritas, tahun anggaran, unit kerja | Total estimasi, tanggal | `FR-14.1` |
| P-55 Penghapusan | Nomor, kode aset | Tab, alasan, periode, kategori, lokasi terakhir | Tanggal, nilai perolehan | `FR-21.3` |
| P-60 Pengguna | Nama, email, NIP/NIS | Role, status, unit kerja | Nama, terakhir login | `FR-02.1` |
| P-73 Activity Log | Nama pelaku, entitas | Rentang tanggal, pengguna, role, modul, jenis aksi, entitas | Waktu | `FR-18.2` |

**Aturan bersama:** panel filter memakai komponen yang sama di seluruh modul; filter aktif tampil sebagai chip yang dapat dihapus (31.3); filter tak dikenal ditolak `400`, tidak diabaikan diam-diam (`SDD-API` §4.5); rentang tanggal selalu menyediakan pintasan **7 hari · 30 hari · Semester Berjalan · Tahun Ajaran** yang identik dengan pemilih rentang dashboard (19.1, `AC-YR-03`).

## 7.5 Pola drawer aksi

Drawer dipakai untuk aksi singkat berformulir pendek di atas halaman detail (**UXD-02**). Ia **tidak pernah** dipakai untuk menampilkan entitas.

| Aturan | Ketentuan |
|---|---|
| Alamat | Route halaman tetap; drawer ditandai `?aksi=<nama>` sehingga dapat ditautkan dan dapat ditutup dengan tombol kembali peramban |
| Ukuran | Maksimum satu layar tanpa gulir vertikal pada 1366 px; bila isian melebihi itu, ia bukan drawer melainkan halaman formulir |
| Fokus | Fokus berpindah ke drawer saat terbuka dan kembali ke tombol pemicu saat tertutup; fokus terkunci di dalamnya (`NFR-AC-03`) |
| Penutupan | Esc, tombol tutup, dan klik latar — kecuali bila ada perubahan belum tersimpan, yang meminta konfirmasi |
| Pada layar < 768 px | Drawer berubah menjadi *bottom sheet* setinggi konten |

**Daftar drawer:** Verifikasi Tiket · Tolak Tiket · Ubah Kondisi Aset · Tandai Lunas · Bebaskan Denda Keterlambatan · Bebaskan Ganti Rugi · Batalkan Reservasi · Delegasikan Approver · Aktifkan/Nonaktifkan Pengguna · Reset Password · Reset 2FA · Tolak Permintaan Reset · Lewati Pemeliharaan · Tandai WO Tertunda · Batalkan Sesi Opname · Substitusi Unit · Cabut Perangkat.

## 7.6 Spesifikasi halaman kunci

Hanya halaman yang punya ketentuan khas di luar §7.1–§7.5.

### 7.6.1 P-27 Kalender Ruangan

Komponen paling kompleks di sistem (`SDD-FE-06`).

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| **Layout** | Grid: baris = ruangan, kolom = slot 30 menit. Tiga tampilan: **Harian** (ruangan × jam), **Mingguan** (hari sebagai kolom), **Bulanan** (ringkasan kepadatan per hari) | `CAL-UI-01`, `CAL-UI-02` |
| **Konten** | Kepala baris: nama ruangan, kapasitas, gedung. Sel: label kegiatan + lencana keadaan | `FR-07.1` |
| **Lima keadaan slot** | Kosong · Menunggu Persetujuan · Disetujui · Jadwal Tetap (dengan label) · Dalam Pemeliharaan / Libur — dibedakan warna **dan** pola **dan** teks | `CAL-UI-05` · `NFR-AC-06` |
| **Aksi utama** | Klik slot kosong membuka wizard pengajuan dengan slot terisi otomatis | `CAL-UI-03` |
| **Aksi sekunder** | *Drag-select* lintas slot berdampingan (desktop) · ketuk-dan-geser (mobile) · Kelola Jadwal Tetap 🔒 (`reservation.fixed_schedule`) · Blokade Manual 🔒 | `CAL-UI-03` · `FR-07.5` |
| **Filter** | Gedung, jenis ruangan, kapasitas minimum | `FR-07.1` langkah 3 |
| **Performa** | Baris divirtualisasi; hanya baris dalam viewport dirender; target ≤ 2 detik untuk 30 ruangan × 1 bulan | `CAL-UI-04` · `FR-07.1 AC` |
| **Kesegaran data** | Tidak boleh di-*cache*; dimuat ulang saat jendela kembali fokus | `AV-04` · `UXP-04` |
| **Zona waktu** | Selalu WIB, tidak mengikuti perangkat; ditegaskan pada kepala kolom | `CAL-UI-09` |
| **Papan ketik** | Panah berpindah antar-slot, Enter memilih, Shift+Panah memperluas pilihan | `CAL-UI-08` · `NFR-AC-03` |
| **Layar < 768 px** | Beralih ke **daftar per hari**; matriks ruangan × jam tidak dipaksakan | `CAL-UI-07` |
| **Role Siswa/OSIS** | Hanya ruangan `boleh_direservasi_siswa`; slot terisi tampil "Terpakai" tanpa identitas pemohon | `CAL-UI-06` · `FR-07.1 A1` |
| **Hari libur** | Seluruh slot pada tanggal libur ditandai beserta keterangannya | `FR-07.1 A5` · `E.2` |
| **Keadaan kosong** | "Belum ada ruangan yang dapat direservasi" + tautan ke Lokasi bila berhak (`location.manage`) | `BR-016` · `UX-05` |

### 7.6.2 P-29 Wizard Pengajuan Reservasi

Tiga langkah (**UXD-04**). Langkah 3 wajib ada — ia satu-satunya tempat konsekuensi `BR-024b` dan tanggal bentrok `BR-024a` terlihat sebelum pengajuan terbentuk.

| Langkah | Konten | Validasi saat lanjut | Rujukan |
|---|---|---|---|
| **1 — Pilih Objek & Waktu** | Ruangan dari kalender **atau** aset dari katalog; tanggal & jam mulai–selesai | Dalam jam operasional (`BR-018`) · minimal H-1 kecuali `reservation.urgent` (`BR-020`) · dalam horizon pemesanan (`BR-023c`) | `FR-07.2` · `FR-08.2` |
| **2 — Detail Kegiatan** | Nama & jenis kegiatan, jumlah peserta, keperluan, keterangan · **Aset pendukung** (opsional) · **Pola pengulangan** (opsional) | Peserta ≤ kapasitas ruangan (`BR-019`) · durasi ≤ batas role (`BR-021`) · kuota pengajuan tertunda (`BR-023a`) | `FR-07.2` langkah 2–3 |
| **3 — Tinjau & Ajukan** | Ringkasan seluruh objek · daftar tanggal turunan beserta tanggal bentrok yang akan dilewati · **peringatan eksplisit** bahwa pengajuan bersifat *all-or-nothing* · pratinjau jalur persetujuan yang akan berlaku | Pemeriksaan ketersediaan terakhir sebelum kirim | `BR-024a` · `BR-024b` · `RE-07` |

| Aspek | Ketentuan |
|---|---|
| Aksi utama | **Ajukan** — hanya pada langkah 3 |
| Aksi sekunder | Kembali · Batal (dengan konfirmasi bila ada isian) |
| Keadaan galat `409` | Tetap di langkah 3, menampilkan objek mana yang bentrok + **saran alternatif terdekat**, bukan sekadar penolakan (`FR-07.2 A1`, `FR-08.1 A2`) |
| Keadaan `422 BORROWER_BLOCKED` | Wizard dihentikan pada langkah 1 dengan daftar kewajiban + tautan ke Denda Saya (`BR-030`, `FR-08.2 A3`) |
| Idempotensi | `Idempotency-Key` dikirim saat submit; pengiriman ganda mengembalikan pengajuan yang sama, bukan dua (`ID-01`, `ID-03`) |
| Mobile | Tiga langkah menjadi tiga layar penuh dengan indikator langkah; kalender langkah 1 memakai tampilan daftar per hari (`CAL-UI-07`) |

### 7.6.3 P-18 Detail Aset

| Tab | Konten | Permission | Rujukan |
|---|---|---|---|
| Informasi | Identitas, kategori, merek, model, nomor seri, lokasi, kondisi, status, penanggung jawab, penanda `dapat_dipinjam` & `boleh_dipinjam_siswa`, **nilai & sumber perolehan** | Blok finansial hanya bila `asset.view_financial` — **tidak dirender** bila tidak, karena server tidak mengirimkannya | `FR-04.2` · `BR-073` · `SDD-AUTH-06` |
| Foto | Galeri `asset_photos` dengan foto utama; memakai turunan `thumb`/`medium` | `asset.view` | `SDD-FS-07` |
| Dokumen | Faktur, garansi, sertifikat, manual, berita acara + masa garansi | `asset_document.view`; **tidak dirender** bagi Siswa/OSIS | `FR-06.1` · `BR-073` |
| Peminjaman | Riwayat peminjaman unit ini | `loan.view` (scope berlaku) | `FR-04.2` langkah 5 |
| Pemeliharaan | Work order kronologis + **akumulasi biaya** + rata-rata interval antar-kerusakan + rekomendasi penggantian bila ambang terlampaui | Blok biaya hanya bila `maintenance.view_cost` | `FR-12.5` · `BR-053` |
| Riwayat | Riwayat kondisi (nilai lama → baru, alasan, pelaku) + riwayat mutasi lokasi | `asset.view` | `BR-007` · `FR-04.4 AC` |

| Aspek | Ketentuan |
|---|---|
| Aksi utama | **Ubah** · **Cetak Label QR** |
| Aksi sekunder (menu) | Ubah Kondisi (drawer beralasan) · Mutasi Lokasi · Lapor Kerusakan · Buat Work Order · Usulkan Penghapusan · Nonaktifkan · Regenerasi UUID QR 🔒 · Riwayat Perubahan |
| Aksi yang **hilang** bergantung keadaan | Mutasi diblokir saat `Dipinjam` (`BR-010`); Usulkan Penghapusan diblokir bila ada slot aktif (`BR-065b`); tombol yang diblokir tetap terlihat namun dinonaktifkan **beserta alasannya**, bukan hilang tanpa penjelasan (`UX-05`) |
| Aset dihapuskan | Spanduk permanen "Aset telah dihapuskan pada {tanggal}" + tautan berita acara; seluruh aksi transaksional disembunyikan; halaman **tetap dapat diakses** (`BR-065d`) |
| Aset dinonaktifkan | Penanda "Aset tidak aktif"; aksi transaksional disembunyikan (`FR-05.2 A2`) |

### 7.6.4 P-38 Detail Keputusan (Approval)

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| **Konten wajib** | Pemohon & role · objek yang diminta · jadwal · keperluan · **riwayat pemohon** (keterlambatan sebelumnya, kewajiban tertunggak) · **ketersediaan objek saat ini** | `FR-10.2` langkah 3 |
| **Linimasa approval** | Seluruh langkah termasuk yang belum aktif dan yang dilewati, beserta alasan; penanda khusus untuk eskalasi dan delegasi; sisa waktu SLA pada langkah aktif | `FR-10.3` · `RE-12` |
| **Langkah dilewati** | Ditampilkan sebagai langkah nyata berlabel "Dilewati — konflik kepentingan", bukan disembunyikan | `BR-039` · `SDD-APR-12` |
| **Pelaku `SYSTEM`** | Dirender sebagai "Sistem" beserta nama pekerjaannya | `AL-06` · `UX-06` |
| **Aksi utama** | Setujui · Tolak (alasan wajib) · Perlu Revisi (catatan wajib) | `BR-042` |
| **Setujui Sebagian** | Hanya untuk **Pengadaan** (`FR-14.2` langkah 5) dan **Penghapusan** (`FR-21.2 A2`) — tidak ditawarkan pada jenis pengajuan lain | `FR-14.2` · `FR-21.2` |
| **Delegasi** | Drawer: pengganti + rentang tanggal berlaku | `FR-10.2 A3` |
| **Keadaan sudah diputuskan** | `409 APPROVAL_ALREADY_DECIDED` menampilkan **siapa** memutuskan dan **kapan**, lalu mengarahkan ke linimasa | `RE-09` · `BR-041` |
| **Keadaan objek tak tersedia** | Persetujuan ditolak sistem, penyebabnya ditampilkan kepada approver — bukan galat generik | `BR-043` · `FR-10.2 A5` |
| **Mobile** | Seluruh aksi keputusan wajib tersedia; linimasa dapat diciutkan | `FR-10.2 AC` · `FR-14.2 AC` |

### 7.6.5 P-69 Editor Approval Rule

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| **Layout** | Dua kolom: kiri = penyusun aturan, kanan = panel **Pratinjau** yang tetap terlihat | `RE-07` |
| **Kondisi** | Penyusun visual node grup (`AND`/`OR`) dan node predikat (`field` · `op` · `value`); kedalaman dibatasi 3 tingkat dan tingkat keempat ditolak di antarmuka | Lampiran D.1 |
| **Kamus field** | Hanya field yang berlaku bagi jenis pengajuan terpilih yang ditawarkan; field tak berlaku tidak muncul, bukan muncul lalu gagal | Lampiran D.2 · `RE-02` |
| **Operator** | Dibatasi per tipe field: numerik, enum, boolean | Lampiran D.3 |
| **Langkah** | Daftar berurutan: approver (role atau pengguna), SLA jam, perilaku saat SLA terlampaui, tujuan eskalasi | Lampiran D.5 |
| **Perilaku terminal** | Pilihan `hold_and_alert` (bawaan) atau `auto_reject`. **`auto_approve` tidak pernah ditawarkan** | `BR-039a` · `SDD-APR` §4.5 |
| **Pratinjau** | Pengguna memasukkan skenario contoh; panel menampilkan aturan yang akan terpilih, seluruh aturan yang cocok beserta prioritasnya, dan rangkaian langkah yang akan terbentuk | `RE-07` · `FR-10.1 AC` |
| **Validasi** | `422 INVALID_RULE_DEFINITION` ditampilkan **pada node yang bermasalah**, bukan sebagai pesan tunggal di atas formulir | `RE-08` |
| **Aturan bawaan** | Ditampilkan sebagai baris terkunci yang tidak dapat disunting maupun dihapus — ia konstanta kode, bukan baris basis data | `BR-036` · `RE-06` · `SDD-APR` §4.3 |
| **Menonaktifkan aturan** | Peringatan bahwa instance berjalan tetap memakai snapshot lama hingga selesai | `BR-040` · `FR-10.1 A4` |
| **`fallback_approver`** | Satu pemilih **opsional** setingkat aturan — bukan di dalam daftar langkah — berlabel *Approver cadangan* dengan teks bawaan **"bawaan: Administrator"** saat kosong. Menerima role atau pengguna, sepola dengan pemilih approver langkah. Aturan tetap dapat disimpan tanpa mengisinya | `RE-11` · `SDD-APR-13` · **UXD-09** |
| **Approver nonaktif** | Panel Pratinjau menandai langkah yang approver-nya bertipe pengguna dan pengguna itu **sedang nonaktif** — supaya penyusun aturan melihatnya saat menyusun, bukan saat pengajuan pertama gagal. Penandaan bersifat peringatan; ia tidak memblokir penyimpanan, karena status pengguna dapat berubah kapan saja setelah aturan disimpan | `RE-13` · `SDD-APR-14` |

### 7.6.6 MS-10 Serah Terima & MS-11 Pengembalian (mobile)

| Aspek | Serah Terima (`FR-09.1`) | Pengembalian (`FR-09.2`) |
|---|---|---|
| **Langkah 1** | Pindai QR unit — atau masukkan kode aset manual | Pindai QR unit yang dikembalikan |
| **Verifikasi** | Sistem memeriksa kesamaan unit dengan alokasi reservasi. Bila berbeda: peringatan + drawer **Substitusi Unit** beralasan (`FR-09.1 A1`) | Sistem menampilkan peminjam, tanggal pinjam, jatuh tempo, **kondisi awal + foto serah terima** sebagai pembanding |
| **Konten** | Kondisi awal + minimal **1 foto** (wajib, `BR-027`) | Kondisi kembali: Baik / Rusak Ringan / Rusak Berat / Tidak Lengkap + minimal **1 foto** |
| **Bukti** | Kanvas tanda tangan minimum 300×150 px **atau** konfirmasi dari akun peminjam sendiri (31.6). Bila peminjam diwakilkan: nama penerima kuasa dicatat, tanggung jawab tetap pada pemohon (`BR-033`) | — |
| **Perhitungan otomatis** | Jatuh tempo ditetapkan dan ditampilkan sebelum konfirmasi | Denda dihitung dan **ditampilkan beserta rinciannya** (hari × tarif, penerapan cap) sebelum konfirmasi (`BR-028`, `BR-028b`) |
| **Aksi utama** | Serahkan | Konfirmasi Pengembalian |
| **Aksi sekunder** | Batal · Substitusi Unit | Tandai Hilang (beralasan, `FR-09.2 A2`) · Pengembalian Sebagian (`FR-09.2 A3`) · Bebaskan Denda 🔒 |
| **Sukses** | Layar bukti serah terima yang dapat ditunjukkan | Ringkasan: status unit baru, denda bila ada, tiket kerusakan bila kondisi rusak (`BR-032`) |
| **Luring** | Gagal eksplisit — **tidak pernah** diantrekan (`MOB-OFF-05`) | Sama |
| **Foto gagal terunggah** | Transaksi tetap tercatat; foto masuk antrean unggah dan entitas ditandai "Foto belum terunggah" (`MOB-OFF-02`, `MOB-OFF-04`) | Sama |
| **Idempotensi** | `Idempotency-Key` wajib; ketuk ganda tidak menghasilkan dua transaksi (`ID-01`) | Sama |

### 7.6.7 MS-18 & MS-19 Stock Opname (mobile)

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| **Pemuatan target** | Per **lokasi**, bukan per sesi; satu lokasi hingga 500 unit dalam satu halaman | `MOB-PERF-02` |
| **Pengiriman hasil** | Per pemindaian, bukan menumpuk sampai akhir sesi — progres tidak hilang bila aplikasi tertutup | `MOB-PERF-03` · `SDD-MOB-06` |
| **Mode pemindai** | Beruntun: kamera tetap aktif, hasil ditambahkan ke daftar tanpa menutup pemindai | `MOB-MED-07` |
| **Lima hasil pencocokan** | Ditemukan · Salah Lokasi · Perbedaan Kondisi · Tidak Ditemukan · Temuan Baru — masing-masing berlencana teks + ikon | `FR-13.2` · `UX-03` |
| **Pemindaian ulang** | Menampilkan status yang sudah tercatat, tidak membuat entri kedua | `FR-13.2 AC` |
| **QR rusak** | Input kode aset manual **atau** pilih dari daftar target lokasi | `FR-13.2 A4` |
| **Aset sedang dipinjam** | Ditandai khusus dan **tidak** dihitung sebagai selisih | `BR-056` |
| **Temuan baru** | Formulir terpisah: deskripsi, kategori perkiraan, kondisi, lokasi, foto | `FR-13.2 A3` |
| **Progres** | Terlihat real-time per lokasi dan keseluruhan | `FR-13.1 AC` |
| **Penyelesaian lokasi** | Tombol "Selesaikan Lokasi Ini"; rekonsiliasi seluruh sesi dikerjakan di web (P-50) | `FR-13.3` |

### 7.6.8 P-78 Preferensi Notifikasi

Enam kelompok (**UXD-05**), dua kanal per kelompok.

| Kelompok | Kode notifikasi | Berisi wajib? |
|---|---|---|
| **Persetujuan** | `NT-01`…`NT-07`, `NT-47` | Ya — seluruhnya wajib |
| **Reservasi & Peminjaman** | `NT-08`…`NT-14`, `NT-27`, `NT-46` | Sebagian (`NT-08`, `NT-11`, `NT-12`, `NT-27`, `NT-46`) |
| **Denda & Kewajiban** | `NT-15`…`NT-18` | Sebagian (`NT-15`, `NT-18`) |
| **Kerusakan & Perawatan** | `NT-19`…`NT-26`, `NT-28`, `NT-29` | Sebagian (`NT-19`, `NT-20`, `NT-22`, `NT-23`, `NT-25`) |
| **Opname & Pengadaan** | `NT-30`…`NT-36`, `NT-43`…`NT-45` | Sebagian (`NT-31`, `NT-33`, `NT-34`, `NT-35`, `NT-43`, `NT-44`) |
| **Akun & Sistem** | `NT-37`…`NT-42`, `NT-48` | Sebagian (`NT-37`, `NT-38`, `NT-38a`, `NT-39`, `NT-40`, `NT-48`) |

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| Kelompok tidak relevan | Kelompok yang tidak menghasilkan notifikasi apa pun bagi role pengguna **tidak dirender** | `FR-17.3` langkah 2 |
| Notifikasi wajib | Ditampilkan terkunci beserta penjelasan singkat mengapa tidak dapat dimatikan — bukan sekadar dinonaktifkan tanpa alasan | `FR-17.3 A1` · `UX-05` |
| Berlaku | Seketika setelah disimpan | `FR-17.3 AC` |
| Izin push ditolak | Blok penjelasan + tautan ke pengaturan sistem perangkat; kanal in-app tetap berjalan | `FR-17.2 A1` |
| Arsip > 90 hari | Pusat Notifikasi (**P-13**) mendapat filter **Arsip**; pengguna membaca notifikasi lamanya sendiri. Arsip saling meniadakan dengan daftar aktif — bukan tambahan pada gulir tak berujung — dan tidak menampilkan penanda belum dibaca, karena status itu tidak lagi bermakna di arsip | `FR-17.1 A2` · `SDD-NTF-10` · **UXD-10** |

---

# 8. Dashboard Specification

## 8.1 Apa yang ditambahkan bagian ini

**Isi kartu tiap dashboard sudah ditetapkan** [`dashboards.md` Bab 19.2–19.7](../PRD/04-frontend/dashboards.md) dan **tidak disalin ke sini**. Yang ditambahkan §8 adalah tiga hal yang belum ditetapkan PRD dan diperlukan untuk wireframe:

1. **Zonasi & urutan** kartu pada kisi — 19.1 hanya menyebut jumlah kolom per titik henti.
2. **Sasaran drill-down** tiap kartu — 19.1 mewajibkan setiap kartu KPI dapat diklik, tanpa menyebut ke mana.
3. **Keadaan kosong** tiap zona — 19.1 mewajibkan pesan + tautan aksi, tanpa menyebut isinya.

## 8.2 Kerangka bersama seluruh dashboard

```
JUDUL DASHBOARD        [7 hari | 30 hari | Semester | Tahun Ajaran]  [Muat ulang]
+----------------------------------------------------------------------+
| ZONA 1 - TINDAKAN   (paling atas, selalu)                            |
|   Kartu aksi & peringatan: hal yang menunggu pengguna hari ini       |
+----------------------------------------------------------------------+
| ZONA 2 - KEADAAN                                                      |
|   Kartu KPI: angka ringkas keadaan sistem                            |
+----------------------------------------------------------------------+
| ZONA 3 - KECENDERUNGAN                                                |
|   Grafik garis/batang/donat: perubahan sepanjang waktu               |
+----------------------------------------------------------------------+
| ZONA 4 - AKSI CEPAT   (dashboard pemohon & Teknisi)                  |
+----------------------------------------------------------------------+
```

| Aspek | Ketentuan | Rujukan |
|---|---|---|
| **Urutan zona** | Tetap: Tindakan, Keadaan, Kecenderungan, Aksi Cepat. Alasannya `UX-05`: pengguna yang membuka dashboard sedang mencari "apa yang harus saya lakukan", bukan angka | **UXD-07** |
| **Kisi** | Desktop 3–4 kolom · tablet 2 kolom · ponsel 1 kolom | 19.1 |
| **Pemilih rentang** | 7 hari · 30 hari · Semester Berjalan · Tahun Ajaran — memakai `academic_terms` & `academic_years` | 19.1 · `AC-YR-03` |
| **Pemuatan** | Tiap kartu memuat mandiri dengan *skeleton*; kegagalan satu kartu tidak menggagalkan kartu lain | 19.1 A2 · `SDD-FE` §4.7 |
| **Kesegaran** | Agregat di-*cache* TTL 5 menit; tombol muat ulang manual selalu tersedia | 19.1 · `AV-04` |
| **Target waktu** | Seluruh kartu termuat 3 detik atau kurang pada 5.000 aset | `NFR-P-04` · `FR-15.1 AC` |
| **Kartu di luar hak akses** | **Tidak dirender sama sekali** — bukan kosong, bukan dinonaktifkan | `FR-15.1 AC` · Bab 18 catatan cakupan |
| **Anatomi kartu KPI** | Nilai · label · tren (opsional) · tautan drill-down. Seluruh kartu dapat dioperasikan papan ketik | 31.3 · `NFR-AC-03` |
| **Grafik** | Wajib memiliki label sumbu, legenda tekstual, dan tabel data alternatif yang dapat dibaca pembaca layar — tidak boleh hanya kanvas | `NFR-AC-04` · `NFR-AC-06` |

## 8.3 Sasaran drill-down per kartu

Kolom **Sasaran** adalah kontribusi §8; isi kartu tetap milik Bab 19.

### 8.3.1 Administrator (19.2)

| Kartu | Zona | Sasaran drill-down |
|---|---|---|
| Permintaan Reset Password | 1 | P-67 |
| Status Konfigurasi | 1 | P-68 (aturan aktif) · P-70 (parameter belum diisi) |
| Kesehatan Integrasi | 1 | P-75 (LLM) · P-70 kelompok Notifikasi (FCM) |
| Efek Tertunda Gagal | 1 | — · daftar lima teratas tampil di kartu; tidak ada halaman tujuan (**UXD-13**) |
| Total Pengguna Aktif | 2 | P-60, `filter[status]=AKTIF` |
| Login Hari Ini | 2 | P-73, `filter[aksi]=LOGIN_SUCCESS,LOGIN_FAILED` + rentang 24 jam |
| Distribusi Role | 3 | P-60 dengan filter role terpilih |
| Aktivitas Sistem | 3 | P-73 pada rentang terpilih |
| Aktivitas Terbaru | 3 | P-74 per baris |

### 8.3.2 Petugas Sarana Prasarana (19.3)

| Kartu | Zona | Sasaran drill-down |
|---|---|---|
| Pengajuan Menunggu Persetujuan | 1 | P-37 |
| Serah Terima Hari Ini | 1 | P-33 |
| Pengembalian Jatuh Tempo Hari Ini | 1 | P-32 tab *Akan Jatuh Tempo* |
| Peminjaman Terlambat | 1 | P-32 tab *Terlambat* |
| Laporan Kerusakan Baru | 1 | P-39, `filter[status]=DILAPORKAN` |
| Aset Belum Berlabel QR | 1 | P-24, `filter[qr_terpasang]=false` |
| Garansi Akan Berakhir | 1 | P-26, `filter[garansi_berakhir_hari]=30` |
| Jadwal Pemeliharaan Mendatang | 1 | P-45, `filter[jatuh_tempo_hari]=14` |
| Total Aset | 2 | P-15 |
| Work Order Aktif | 2 | P-42 dengan filter status terpilih |
| Komposisi Kondisi Aset | 3 | P-15, `filter[kondisi]` segmen terpilih |
| Status Aset | 3 | P-15, `filter[status]` segmen terpilih |
| Tren Peminjaman | 3 | P-32 pada rentang terpilih |

### 8.3.3 Pimpinan Sekolah (19.4)

| Kartu | Zona | Sasaran drill-down |
|---|---|---|
| Menunggu Persetujuan Saya | 1 | P-37 |
| Laporan Kerusakan Kritis | 1 | P-39, `filter[urgensi]=KRITIS` + status terbuka |
| Ringkasan Aset | 2 | P-15 |
| Status Pengadaan | 2 | P-51 dengan filter status terpilih |
| Tingkat Kepatuhan Pengembalian | 2 | P-59 laporan *Aktivitas Peminjaman* |
| Ringkasan Stock Opname | 2 | P-49 sesi terakhir |
| Kondisi Aset | 3 | P-15 dengan filter kondisi |
| Utilisasi Ruangan | 3 | P-59 laporan *Pemanfaatan Fasilitas* |
| Tren Kerusakan | 3 | P-59 laporan *Tren Kerusakan* |
| Biaya Pemeliharaan | 3 | P-59 laporan *Biaya Pemeliharaan* |
| Aset Bermasalah | 3 | P-18 per baris |

### 8.3.4 Teknisi (19.5)

| Kartu | Zona | Sasaran drill-down |
|---|---|---|
| Pekerjaan Hari Ini | 1 | P-44 / MS-17 per baris |
| Work Order Mendesak | 1 | P-42, `filter[prioritas]=MENDESAK,TINGGI` |
| Pekerjaan Tertunda | 1 | P-42, `filter[status]=TERTUNDA` |
| Work Order Saya | 2 | P-42 dengan filter status terpilih |
| Rata-rata Durasi Perbaikan | 2 | P-42 riwayat selesai |
| Riwayat Penyelesaian | 3 | P-42 pada rentang terpilih |
| Scan Cepat | 4 | MS-07 / P-25 |

### 8.3.5 Guru & Staf/TU (19.6)

| Kartu | Zona | Sasaran drill-down |
|---|---|---|
| Jatuh Tempo Mendekat | 1 | P-32 tab *Akan Jatuh Tempo* |
| Denda Saya | 1 | P-35, `filter[status]=BELUM_DIBAYAR` |
| Peminjaman Aktif | 2 | P-34 per baris |
| Pengajuan Saya | 2 | P-30 dengan filter status terpilih |
| Laporan Kerusakan Saya | 2 | P-41 per baris |
| Jadwal Reservasi Saya | 3 | P-31 per baris |
| Ketersediaan Ruangan Hari Ini | 3 | P-27 tampilan Harian, tanggal hari ini |
| Aksi Cepat | 4 | P-29 · P-40 · P-25 / MS-07 · panel chatbot |

### 8.3.6 Siswa/OSIS (19.7)

| Kartu | Zona | Sasaran drill-down |
|---|---|---|
| Jatuh Tempo Mendekat | 1 | P-32 tab *Akan Jatuh Tempo*, scope `own` |
| Denda Saya | 1 | P-35 scope `own` — menampilkan **status blokir** bila `BR-030` berlaku |
| Pengajuan Saya | 2 | P-30 scope `own` |
| Peminjaman Aktif | 2 | P-34 scope `own` |
| Ruangan Tersedia | 3 | P-27 tersaring `boleh_direservasi_siswa` (`CAL-UI-06`) |
| Aksi Cepat | 4 | P-29 · P-40 · panel chatbot |

> Dashboard Siswa/OSIS **tidak pernah** memuat kartu bernilai finansial, biaya pemeliharaan, data pengadaan, maupun identitas pengguna lain (`BR-073`). Ketiadaannya adalah ketiadaan render, bukan penyembunyian.

## 8.4 Keadaan kosong per zona

| Zona | Ketika kosong | Aksi yang ditawarkan |
|---|---|---|
| Tindakan | "Tidak ada yang menunggu tindakan Anda hari ini." | Tautan ke daftar penuh domain terkait |
| Keadaan | "Belum ada data pada rentang ini." | Ubah rentang waktu |
| Kecenderungan | "Data belum cukup untuk menampilkan tren." | Ubah rentang waktu |
| Sistem baru (seluruh dashboard kosong) | Panduan langkah awal berurutan sesuai role | Admin: buat pengguna, lalu atur approval rules · Petugas: buat lokasi, impor aset, cetak QR (`FR-15.1 A1`) |

## 8.5 Dashboard mobile (MS-05)

| Aspek | Ketentuan |
|---|---|
| Kisi | Satu kolom; Zona 1 dan Zona 4 terlihat tanpa gulir |
| Zona 3 | Diciutkan secara bawaan — grafik mahal dirender dan jarang menjadi alasan Teknisi/Guru membuka aplikasi di lapangan (`UX-01`, `MOB-PERF-01`) |
| Aksi Cepat | Ditempatkan di atas Zona 3, karena ia alasan utama aplikasi dibuka (19.6, 19.7) |
| Pemilih rentang | Tersedia, tetapi diletakkan pada app bar, bukan baris tersendiri |

---

# 10. Responsive UX

## 10.1 Titik henti

`NFR-C-02` menetapkan rentang 320–1920 px dan Bab 30.6 menetapkan empat resolusi uji. Keduanya digabung menjadi empat titik henti berikut — ini pemenuhan `DS-05`, bukan requirement baru.

| Titik henti | Rentang | Perangkat khas | Kolom kisi |
|---|---|---|---|
| **XS** | 320–599 px | Ponsel potret | 1 |
| **SM** | 600–767 px | Ponsel lanskap, ponsel besar | 1 |
| **MD** | 768–1365 px | Tablet, laptop kecil | 2 |
| **LG** | 1366 px ke atas | Desktop | 3–4 |

Ambang **768 px** bersifat khusus: ia batas yang `CAL-UI-07` tetapkan untuk peralihan kalender.

## 10.2 Perilaku per komponen

| Komponen | XS · SM (< 768 px) | MD (768–1365) | LG (1366 ke atas) | Rujukan |
|---|---|---|---|---|
| **Sidebar** | Tersembunyi; dibuka sebagai *overlay drawer* dari tombol topbar | Ciut menjadi ikon-saja, dapat diperluas | Terbuka penuh | **UXD-01** |
| **Kalender ketersediaan** | **Beralih ke daftar per hari** — matriks ruangan x jam tidak dipaksakan | Matriks; kolom jam digulir horizontal di dalam wadahnya | Matriks penuh | `CAL-UI-07` |
| **Tabel data** | Berubah menjadi **kartu per baris** dengan 3–4 field terpenting; sisanya di detail | Tabel dengan kolom sekunder disembunyikan | Tabel penuh | 31.3 |
| **Panel filter** | *Bottom sheet* yang dipanggil tombol "Filter (3)" | Baris di atas tabel, dapat diciutkan | Baris di atas tabel | 31.3 |
| **Drawer aksi** | *Bottom sheet* setinggi konten | Drawer kanan | Drawer kanan | §7.5 |
| **Dashboard** | 1 kolom; Zona 3 diciutkan | 2 kolom | 3–4 kolom | 19.1 |
| **Wizard reservasi** | Satu langkah = satu layar penuh | Satu langkah = satu panel, indikator horizontal | Sama seperti MD | **UXD-04** |
| **Tab halaman detail** | Gulir horizontal dengan penanda tepi; menjadi *select* bila lebih dari 5 tab | Tab horizontal penuh | Tab horizontal penuh | — |
| **Grafik analitik** | Satu grafik per layar; tabel data alternatif selalu tersedia | Dua kolom | Dua–tiga kolom | `NFR-AC-04` |
| **Linimasa approval** | Vertikal ringkas, dapat diciutkan | Vertikal penuh | Vertikal penuh di kolom samping | `FR-10.3` |
| **Pencarian global** | Ikon yang membuka lapisan pencarian | Kotak menyempit | Kotak penuh | — |

## 10.3 Aturan yang berlaku di semua titik henti

| Aturan | Ketentuan | Rujukan |
|---|---|---|
| **Badan halaman tidak pernah menggulir horizontal** | Konten lebar (tabel, kalender) menggulir **di dalam wadahnya sendiri** | `NFR-C-02` |
| **Satuan relatif** | Tata letak memakai satuan relatif sehingga perbesaran teks 200% tidak mematahkan fungsi | `NFR-AC-08` |
| **Target sentuh** | Minimum 44x44 dp pada seluruh titik henti, bukan hanya mobile | `NFR-AC-07` |
| **Ukuran teks minimum** | 16 px pada web, 14 sp pada mobile | 31.2 |
| **Tidak ada fitur yang hilang karena lebar layar** | Bila sebuah alur memang tidak tersedia di mobile (§6.3), antarmuka mengarahkan ke web — bukan menyembunyikan tanpa penjelasan | `UX-05` |
| **Lanskap** | Didukung pada tampilan tabel dan kalender | `NFR-C-04` |

## 10.4 Tablet

Aplikasi mobile mendapat tata letak dua panel pada tablet (**UXD-11**), melampaui minimum `NFR-C-04`.

| Layar | Tata letak tablet | Alasan |
|---|---|---|
| MS-16 Work Order Saya | Master-detail: daftar WO di kiri, detail di kanan | Teknisi bertablet dapat membaca deskripsi sambil melihat antrean |
| MS-18 Sesi Opname | Master-detail: daftar lokasi di kiri, daftar aset target di kanan | Satu lokasi dapat memuat ratusan unit (`MOB-PERF-02`) |
| MS-06 Tugas | Seksi bersebelahan dua kolom | Petugas Sarpras memegang beberapa antrean sekaligus |
| Layar lain | Tata letak ponsel dipusatkan dengan lebar maksimum terbatas | Menghindari baris teks terlalu panjang |

**Konsekuensi yang diterima:** satu set wireframe tambahan dan satu kelas perangkat uji baru pada Bab 30.6. `TBD-MOB-B` ditutup oleh keputusan ini.

---

# 11. Accessibility UX

Target: **WCAG 2.1 level AA** (`NFR-AC-01`). Bagian ini menjabarkan `NFR-AC-01`…`NFR-AC-09` menjadi ketentuan yang dapat diperiksa per komponen — pemenuhan `DS-06`.

## 11.1 Ketentuan per requirement

| Kode | Requirement | Wujud pada antarmuka SIGM4 |
|---|---|---|
| `NFR-AC-01` | WCAG 2.1 AA | Pemeriksa aksesibilitas otomatis berjalan di CI atas seluruh halaman utama (`SDD-FE` §4.6) |
| `NFR-AC-02` | Kontras 4,5:1 teks normal, 3:1 teks besar | Token warna divalidasi kontras saat *build*; kegagalan **menggagalkan CI**, bukan sekadar peringatan |
| `NFR-AC-03` | Seluruh fungsi utama dapat dioperasikan papan ketik dengan indikator fokus jelas | Termasuk kalender (panah + Enter, `CAL-UI-08`), tabel (pilih baris, urutkan kolom), drawer (fokus terkunci, Esc menutup), dan wizard |
| `NFR-AC-04` | Teks alternatif bermakna pada gambar, ikon fungsional, tombol | Ikon fungsional **selalu** berpasangan label teks (31.2); foto aset & kerusakan memakai alt yang menyebut objeknya |
| `NFR-AC-05` | Label eksplisit + pesan galat terbaca pembaca layar | Galat ditautkan `aria-describedby` dan diumumkan lewat *live region* (`SDD-FE` §4.6) |
| `NFR-AC-06` | Informasi tidak disampaikan hanya lewat warna | Lihat §11.4 |
| `NFR-AC-07` | Target sentuh mobile 44x44 dp | Berlaku pada seluruh titik henti, bukan hanya mobile |
| `NFR-AC-08` | Perbesaran teks 200% tanpa kehilangan fungsi | Tata letak bersatuan relatif; diuji pada 200% sebagai bagian daftar periksa `DS-06` |
| `NFR-AC-09` | Bahasa Indonesia baku dan mudah dipahami | Lihat §11.5 |

## 11.2 Navigasi papan ketik

| Konteks | Ketentuan |
|---|---|
| Urutan fokus | Mengikuti urutan visual; tidak ada `tabindex` positif |
| Lewati navigasi | Tautan "Lewati ke konten utama" sebagai elemen fokus pertama |
| Indikator fokus | Terlihat pada seluruh elemen interaktif, kontras minimal 3:1 terhadap latar; **tidak pernah** dihapus |
| Drawer & dialog | Fokus berpindah masuk saat terbuka, terkunci di dalam, kembali ke pemicu saat tertutup |
| Tabel | Kepala kolom dapat difokus untuk mengurutkan; baris dibuka dengan Enter |
| Kalender | Panah berpindah slot, Enter memilih, Shift+Panah memperluas pilihan, Esc membatalkan (`CAL-UI-08`) |
| Pemindai QR | Tombol "Masukkan kode aset manual" berada dalam urutan fokus — bukan hanya dapat dijangkau lewat sentuhan (`FR-05.2 A1`) |
| Pintasan | Tidak ada pintasan huruf tunggal tanpa modifier, agar tidak bentrok dengan pembaca layar |

## 11.3 Pembaca layar

| Konteks | Ketentuan |
|---|---|
| Bahasa dokumen | `lang="id"` — menentukan pelafalan pembaca layar (`NFR-AC-09`) |
| Judul halaman | Unik dan menyebut objek: "Detail Aset LAB-KOM-0002 — SIGM4" |
| Struktur heading | Satu `h1` per halaman; hierarki tidak melompat |
| Landmark | `banner`, `navigation`, `main`, `contentinfo` pada kerangka layar |
| Pembaruan asinkron | Penghitung notifikasi, progres opname, dan progres unggah diumumkan lewat *live region* sopan |
| Galat formulir | Diumumkan saat muncul, dengan teks yang menyebut nama field |
| Tabel data | `<caption>` menyebut isi dan filter aktif; `scope` pada kepala kolom; `aria-sort` pada kolom terurut |
| Grafik | Selalu disertai tabel data alternatif yang dapat dibaca, bukan hanya `alt` pada kanvas |
| Kalender | Tiap sel slot memiliki label yang menyebut ruangan, waktu, dan keadaannya secara tekstual |

## 11.4 Lencana status & kalender

`NFR-AC-06` dan `UX-03` paling sering dilanggar tanpa disadari. Ketentuan berikut menutupnya.

| Konteks | Ketentuan | Rujukan |
|---|---|---|
| **Lencana status** | Satu komponen bersama untuk **seluruh** enum Bab 11.3. Setiap lencana = **warna + ikon + teks**. Tidak pernah warna saja | 31.3 · `UX-03` |
| **Label enum** | Dari peta kode ke label pada `packages/schemas`; kode teknis (`RUSAK_RINGAN`) **tidak pernah** dirender mentah | `SDD-FE-08` · `SDD-REPO-05` |
| **Lima keadaan slot kalender** | Kosong · Menunggu Persetujuan · Disetujui · Jadwal Tetap · Dalam Pemeliharaan/Libur — dibedakan **warna + pola/ikon + teks** | `CAL-UI-05` |
| **Blokade vs reservasi** | Jadwal tetap, blokade manual, menunggu persetujuan, dan disetujui dibedakan **tidak hanya lewat warna** | `FR-07.5 AC` |
| **Grafik** | Seri dibedakan warna **dan** pola/penanda; legenda tekstual wajib | `NFR-AC-06` |
| **Field wajib** | Ditandai kata "wajib", bukan hanya tanda bintang berwarna | `NFR-AC-05` |
| **Pelanggaran SLA** | Ditandai ikon + teks ("Melewati batas 2 hari"), bukan baris merah | `FR-11.3 AC` |

## 11.5 Bahasa

| Aturan | Ketentuan | Rujukan |
|---|---|---|
| Bahasa antarmuka | Bahasa Indonesia baku pada seluruh label, pesan, dan konten | `NFR-AC-09` · `UX-06` |
| Istilah teknis dilarang | Tidak ada "instance", "token", "payload", "slot tentative", "idempotency", "outbox" pada antarmuka | 31.1 `UX-06` |
| Pesan galat | Menjelaskan **apa yang terjadi** dan **apa yang dapat dilakukan**, tanpa detail teknis internal | `NFR-R-10` |
| `request_id` | Satu-satunya penanda teknis yang boleh tampil, hanya pada layar galat, sebagai teks yang dapat disalin | 31.5 |
| Pelaku `SYSTEM` | Dirender "Sistem", bukan kode | `AL-06` |
| Waktu | Selalu WIB dengan penanda eksplisit; format tanggal panjang Bahasa Indonesia | `CAL-UI-09` · `NFR-C-10` |
| Angka uang | Format rupiah dengan pemisah ribuan | `SDD-API` §4.3 |

## 11.6 Daftar periksa aksesibilitas per komponen (`DS-06`)

Berlaku bagi 12 komponen inti pada 31.3. Setiap komponen wajib lulus seluruh baris sebelum dinyatakan selesai.

| # | Pemeriksaan |
|---|---|
| 1 | Seluruh fungsi dapat dioperasikan tanpa tetikus |
| 2 | Indikator fokus terlihat dan berkontras cukup |
| 3 | Seluruh informasi status tersedia sebagai teks, bukan hanya warna |
| 4 | Ikon fungsional memiliki label teks atau `aria-label` bermakna |
| 5 | Kontras teks/latar memenuhi ambang — divalidasi otomatis di CI |
| 6 | Perbesaran 200% tidak menyembunyikan fungsi maupun memotong teks |
| 7 | Perubahan dinamis diumumkan pembaca layar |
| 8 | Galat menyebut nama field dan cara memperbaikinya |
| 9 | Target sentuh minimal 44x44 dp |
| 10 | Seluruh teks Bahasa Indonesia baku, tanpa istilah teknis |
