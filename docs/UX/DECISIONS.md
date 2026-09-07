# Decisions — SIGM4 UX

> **Dokumentasi UX SIGM4** — [Overview](UX-SPEC.md) · [Information Architecture](INFORMATION-ARCHITECTURE.md) · [Navigation](NAVIGATION.md) · [Page Specification](PAGE-SPECIFICATION.md) · [User Flows](USER-FLOWS.md) · **Decisions**

**Berkas ini memuat:** [§12 UX Decision Log](#12-ux-decision-log) — keputusan UX yang diambil, keputusan yang masih terbuka (`BLOCKED`), konflik PRD/SDD yang ditemukan, dan daftar layar yang sengaja tidak dibuat.

Penomoran bagian dipertahankan dari UX-SPEC v1.0 agar seluruh rujukan silang tetap sahih — peta lengkap ada di [Peta bagian → berkas](UX-SPEC.md#peta-bagian--berkas).

> **Tidak ada lagi keputusan `BLOCKED`.** Seluruh keputusan UX sudah ditetapkan pemilik produk — `UXD-08` (K-01) pada 22 Agustus 2026, lalu `UXD-09`, `UXD-10`, `UXD-13`, `UXD-14`, dan `UXD-15` pada 25 Agustus 2026. §12.3 dipertahankan sebagai catatan riwayat, bukan sebagai daftar tunggu.

| Berkas tetangga | Kaitan |
|---|---|
| [`UX-SPEC.md`](UX-SPEC.md) | §13.4 memuat ringkasan cakupan; daftar tindak lanjut berada di akhir berkas itu |
| [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) | §7.6.5 dan §7.6.8 tidak lagi `BLOCKED` — **UXD-09** dan **UXD-10** ditutup 25 Agustus 2026 |
| [`USER-FLOWS.md`](USER-FLOWS.md) | F-15 (§9.5) — cabang Ganti Rugi mengikuti **UXD-08** |
| [`TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) | Register TBD tingkat SDD — seluruh keputusan di sini sudah tertutup |

---

# 12. UX Decision Log

## 12.1 Cara membaca

Setiap keputusan pada berkas ini memiliki **tepat satu** sumber:

| Sumber | Arti |
|---|---|
| **PRD/SDD** | Diturunkan langsung dari requirement atau keputusan desain. Bukan keputusan baru — hanya penjabaran penyajiannya |
| **User Decision** | Ditanyakan kepada pemilik produk dan dijawab pada 22 Agustus 2026. Menutup kekosongan yang PRD/SDD tidak tetapkan |
| **BLOCKED** | Belum diputuskan. Tidak ditebak. Tercatat di [`TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) |

## 12.2 Keputusan yang diambil

| ID | Keputusan | Sumber | Alasan & konsekuensi |
|---|---|---|---|
| **UXD-01** | **Sidebar dikelompokkan menjadi lima grup domain kerja** (Aset & Bahan · Pemanfaatan · Perawatan · Pengawasan · Sistem) ditambah Beranda dan Akun Saya, bukan daftar datar 22 modul | **User Decision** | Tiga modul tidak pernah menjadi entri menu dan beberapa modul memunculkan lebih dari satu entri (§3.1), sehingga pemetaan 1:1 mustahil. Struktur identik untuk semua role; yang berbeda hanya entri yang dirender (`PM-04`). **Konsekuensi:** §3.3 wajib dipelihara sebagai bukti tidak ada modul yang tertinggal |
| **UXD-02** | **Halaman penuh untuk setiap entitas; drawer hanya untuk aksi singkat** | **User Decision** | Memberi satu sasaran seragam bagi deep link notifikasi (`SDD-NTF-09`), hasil scan QR (`FR-05.2`), dan tautan chatbot (22.4). **Konsekuensi:** setiap halaman daftar wajib mendefinisikan skema parameter URL-nya (`SDD-FE-10`); drawer wajib memiliki alamat `?aksi=` agar tetap dapat ditautkan |
| **UXD-03** | **Navigasi mobile: bottom tab lima slot dengan Scan di tengah**; isi tab "Tugas" adaptif per permission | **User Decision** | `UX-02` menjadikan scan QR jalan pintas utama, dan pengguna lapangan (Persona 1, 4) bekerja satu tangan sambil memegang barang. **Konsekuensi:** isi tab Tugas dirender dari `/me`, bukan dari nama role (`UXP-02`); pengguna dengan beberapa permission melihat seksi bertumpuk |
| **UXD-04** | **Pengajuan reservasi berbentuk wizard tiga langkah** dengan langkah terakhir wajib berupa Tinjau | **User Decision** | `BR-024b` menjadikan pengajuan gabungan bersifat *all-or-nothing* dan `BR-024a` menghasilkan N tanggal turunan — keduanya harus terlihat **sebelum** submit, bukan sesudah penolakan. **Konsekuensi:** langkah 3 wajib menampilkan tanggal bentrok yang akan dilewati dan peringatan all-or-nothing secara eksplisit |
| **UXD-05** | **Preferensi notifikasi dikelompokkan menjadi enam kelompok domain proses**, bukan per modul | **User Decision** · menutup `TBD-NTF-A` | Pengguna non-teknis (Persona 3, 6) tidak mengenal batas modul; pengelompokan per modul akan menampilkan istilah internal, berlawanan dengan `UX-06`. Pemetaan 48 kode `NT-xx` ke enam kelompok ada di §7.6.8. **Konsekuensi:** `SDD-08` perlu memakai enam nilai `jenis` ini pada tabel `notification_preferences` |
| **UXD-06** | **Keadaan sukses ditetapkan sebagai pola keenam**, melengkapi lima keadaan `31.5` | PRD/SDD (turunan `UX-05`) | 31.5 hanya menetapkan lima keadaan dan tidak menyebut keberhasilan. Tanpa pola, tiap modul akan memilih sendiri antara toast, redirect, dan halaman ringkasan. Lima bentuk umpan balik ditetapkan §7.3 menurut jenis operasi |
| **UXD-07** | **Dashboard disusun dalam empat zona tetap**: Tindakan, Keadaan, Kecenderungan, Aksi Cepat | PRD/SDD (turunan `UX-05`, 19.1) | 19.1 menetapkan jumlah kolom per titik henti tetapi tidak menetapkan urutan. Pengguna yang membuka dashboard sedang mencari "apa yang harus saya lakukan" — kartu aksi dan peringatan karena itu selalu di atas |
| **UXD-08** | **Tombol "Bebaskan" pada kewajiban berjenis `Ganti Rugi` hanya dirender bagi Pimpinan Sekolah.** Lampiran C mendapat permission baru `fine.waive_compensation` (pemilik: Pimpinan saja — bukan Admin, bukan Petugas), dengan endpoint tersendiri `PATCH /fines/{id}/waive-compensation` agar `PM-01` tetap terpenuhi. Pembebasan dapat penuh atau sebagian | **User Decision** · menutup **K-01** | `BR-028e` menempatkan pembebasan kewajiban bernilai uang pada wewenang pimpinan, sepola dengan `audit.approve`; menambahkan Pimpinan ke `fine.waive` yang sudah ada justru akan memberi Petugas Sarpras wewenang yang BR-028e larang. **Konsekuensi:** Lampiran C menjadi 71 permission (seed `PR-00-16` menyesuaikan), `fines` mendapat kolom `jumlah_dibebaskan`, status denda bertambah `Dibebaskan Sebagian`, dan P-36 merender dua drawer pembebasan yang berbeda menurut `jenis` |
| **UXD-11** | **Aplikasi mobile mendapat tata letak dua panel pada tablet** untuk Work Order, Sesi Opname, dan Tugas | **User Decision** · menutup `TBD-MOB-B` | Melampaui minimum `NFR-C-04`. **Konsekuensi:** satu set wireframe tambahan dan satu kelas perangkat uji baru pada Bab 30.6 |
| **UXD-16** | **Bahan mengikuti pola Aset dan disebar ke tiga grup, bukan menjadi grup keenam** — master (Bahan, Kategori Bahan) di grup **Aset & Bahan** yang diperluas namanya; transaksi (Katalog Bahan, Permintaan Bahan) di **Pemanfaatan**; opname bahan sudah berada di **Pengawasan** lewat M-13 | **User Decision** · memperluas `UXD-01` | `UXD-01` tetap berlaku: jumlah grup tidak bertambah, hanya nama grup pertama yang berubah dari *Aset & Lokasi*. Bahan menjadi sejajar dengan Aset sehingga pengguna tidak perlu mempelajari pola kedua. **Konsekuensi:** grup Aset & Bahan naik dari 6 ke 8 entri; label grup pada sidebar, breadcrumb, dan wireframe DESIGN ikut berubah |
| **UXD-17** | **Bahan hadir di mobile hanya untuk stock opname** (`MS-22`, `MS-23`); permintaan dan penyerahan bahan tetap web | **User Decision** | Menghitung stok berlangsung di gudang sambil memegang barang — sama alasannya dengan opname aset (`MS-18`, `MS-19`). **Konsekuensi:** mobile naik dari 21 ke 23 layar; `mobile-requirements.md` menambahkan `MOB-PERF-06` sebagai dasar PRD-nya |
| **UXD-18** | **Kartu dalam satu zona dashboard boleh dikelompokkan menjadi subgrup berlabel** ketika satu modul menyumbang lebih dari satu kartu ke zona yang sama. Zona tetap empat (`UXD-07`); subgrup adalah pengelompokan **di dalam** zona, bukan zona kelima. Penerapan pertama: dua kartu M-22 (*Stok Bahan Menipis*, *Permintaan Bahan Menunggu*) menjadi satu subgrup **Bahan** pada Zona 1 dashboard Petugas Sarana Prasarana | **User Decision** · memperluas `UXD-07` | Setelah M-22 masuk, 19.3 menghasilkan **sepuluh** kartu Zona 1. `19.1` menetapkan jumlah kolom per titik henti tetapi tidak menetapkan urutan di dalam zona maupun ambang jumlah kartu, sehingga pertumbuhan zona tidak memiliki rem apa pun. Mengelompokkan kartu yang berasal dari satu modul menurunkan beban pindai dari sepuluh unit menjadi sembilan tanpa menyembunyikan satu kartu pun — berbeda dari melipat kartu di balik "lihat lainnya", yang akan menyalahi kedudukan Zona 1 sebagai zona tindakan. **Konsekuensi:** `19.1` menyebut subgrup sebagai satuan tata letak beserta perilakunya pada titik henti sempit (✅ 24 Agustus 2026); `docs/DESIGN/` memuat pola blok subgrup — label + garis pemisah + grid kartu di dalamnya — beserta tokennya di [`PATTERNS.md §3.5`](../DESIGN/PATTERNS.md) (✅ 24 Agustus 2026); subgrup **tidak** dipakai untuk zona yang kartunya berasal dari modul berbeda-beda |
| **UXD-13** | **Dead letter terlihat, tanpa antarmuka pemrosesan ulang.** Tidak ada halaman baru pada grup Sistem. Yang bertambah hanya satu **kartu peringatan baca-saja** pada Dashboard Administrator (19.2, *Efek Tertunda Gagal*): jumlah + lima teratas, tanpa tautan drill-down karena daftarnya sudah tampil di kartu | **User Decision** · menutup `TBD-EVT-B` | Kegagalan yang dikhawatirkan `SDD-07 §6` adalah *efek hilang diam-diam*, dan itu diselesaikan visibilitas. Tombol proses ulang menuntut permission baru, endpoint tulis baru, aksi log baru, dan satu halaman baru — seluruhnya requirement PRD — sekaligus memberi staf sekolah tindakan yang sebabnya tidak dapat mereka diagnosis (`SDD-EVT-10`). **Konsekuensi:** grup Sistem tetap pada jumlah entri sekarang; Lampiran C tetap 79 permission; §8.3.1 memperoleh satu baris kartu tanpa sasaran drill-down |
| **UXD-09** | **`fallback_approver` menjadi satu pemilih opsional setingkat aturan pada P-69**, berlabel *Approver cadangan*, dengan teks bawaan "bawaan: Administrator" saat dikosongkan. Aturan tetap dapat disimpan tanpa mengisinya | **User Decision** · menutup `TBD-APR-A` | `RE-11` sebelumnya bertentangan dengan dirinya sendiri — menyebut field "wajib" lalu mengatur perilaku "bila tidak ditetapkan". Yang dilindungi `BR-039a` adalah tidak adanya persetujuan otomatis akibat kekosongan approver, dan bawaan Administrator melindunginya penuh tanpa mewajibkan pengisian. **Konsekuensi:** Lampiran D.5 memperoleh satu field opsional; `RE-11` disunting; §7.6.5 tidak lagi `BLOCKED` |
| **UXD-10** | **P-13 mendapat filter "Arsip"** — pengguna dapat membaca notifikasinya sendiri yang berumur lebih dari 90 hari. Arsip saling meniadakan dengan daftar aktif dan tidak menampilkan penanda belum dibaca | **User Decision** · menutup `TBD-NTF-B` | Bacaan harfiah `FR-17.1 A2` ("hanya tampil melalui filter arsip") menyebut sebuah filter, dan filter adalah kendali pengguna. Notifikasi memuat tenggat, keputusan persetujuan, dan denda — data milik pengguna itu sendiri. **Konsekuensi:** `notifications_archive` memperoleh indeks `(user_id, created_at DESC)` (`SDD-NTF-10`); tanpa endpoint atau permission baru; §7.6.8 tidak lagi `BLOCKED` |
| **UXD-14** | **Galeri foto tidak memerlukan keadaan "foto dikaburkan".** Foto berwajah dipertahankan utuh sebagai bukti saat permintaan penghapusan data dilayani; P-18, P-34, dan P-41 merender foto seperti biasa | **User Decision** · menutup `TBD-FS-A` | `DP-04` sudah menempuh pilihan yang sama untuk data teks — menolak penghapusan demi mempertahankan jejak audit. Foto serah terima diwajibkan `BR-027` justru karena ia bukti pada sengketa denda dan ganti rugi. Perlindungannya tetap `DP-05`. **Konsekuensi:** tidak ada keadaan layar baru, tidak ada pustaka deteksi wajah; sebagai gantinya Pemberitahuan Privasi **wajib** menyatakan batas ini (`DP-05a`) sehingga subjek data mengetahuinya sebelum memberikan data |
| **UXD-15** | **Route reservasi tetap satu rumpun `/reservations`** untuk ruangan maupun aset; struktur route klien dan bentuk deep link tidak berubah | **User Decision** · menutup `TBD-AVL-B` | `BR-017` … `BR-025` berlaku identik bagi kedua jenis. Memecah permukaan API di atas perilaku yang seluruhnya sama menghasilkan dua kontrak yang wajib dijaga seragam selamanya, tanpa satu pun requirement yang meminta perbedaannya. **Konsekuensi:** katalog endpoint tetap 119; deep link notifikasi (`SDD-NTF-09`) dan hasil scan QR tetap menunjuk satu bentuk alamat |
| **UXD-12** | **Web tidak mendukung mode gelap** — satu set token warna saja | **User Decision** · menutup `TBD-FE-B` | PRD tidak pernah memintanya, dan pengguna lapangan bekerja pada kondisi terang. **Konsekuensi:** validasi kontras CI (`NFR-AC-01/02`) punya satu sasaran; mode gelap dinyatakan **di luar lingkup rilis ini**, bukan tertunda |

## 12.3 Keputusan yang masih terbuka

**Kosong sejak 25 Agustus 2026.** Kelima keputusan yang pernah berdiri di sini — `UXD-09`, `UXD-10`, `UXD-13`, `UXD-14`, `UXD-15` — sudah pindah ke §12.2 beserta alasannya. Bagian ini dipertahankan agar rujukan silang ke §12.3 tetap sahih dan agar penambahan keputusan terbuka berikutnya punya tempat yang jelas.

| ID | Pertanyaan | Dampak UX | Tercatat di |
|---|---|---|---|
| — | — | — | — |

## 12.4 Konflik & ambiguitas yang ditemukan

Empat temuan, seluruhnya tertutup. Dua diselesaikan mengikuti aturan prioritas yang sudah ada; satu diputuskan pemilik produk; satu ternyata sudah ditutup PRD.

| # | Temuan | Status | Penyelesaian |
|---|---|---|---|
| **K-01** | **Wewenang pembebasan Ganti Rugi.** `BR-028e` (m09) vs Lampiran C `fine.waive` — lihat **UXD-08** | ✅ Diselesaikan pemilik produk | `PM-06` memang tidak menjangkau pertentangan **business rule vs katalog permission**, sehingga temuan ini dinaikkan dan diputuskan: **katalog yang menyesuaikan business rule**, bukan sebaliknya. Lampiran C mendapat `fine.waive_compensation` milik Pimpinan saja; `fine.waive` dipersempit menjadi jenis `Keterlambatan`; `BR-031` dan `BR-028e` disunting agar tidak lagi saling menutupi |
| **K-02** | **Permission pembatalan reservasi.** Tabel endpoint `m07` bagian 7 mencantumkan `POST /reservations/{id}/cancel` dengan permission `reservation.cancel`, sementara Lampiran C hanya memiliki `reservation.cancel_own` dan `reservation.cancel_any` | ✅ Diselesaikan | `PM-06` mengikat: **Lampiran C yang berlaku**. UX-SPEC memakai `reservation.cancel_own` / `reservation.cancel_any` (§5.3, §7.2). Tabel endpoint `m07` diperbaiki 24 Agustus 2026: satu endpoint `POST /reservations/{id}/cancel` menerima kedua permission — pemilik cukup `cancel_own`, pembatalan lintas pengguna wajib `cancel_any` (`FR-07.3 A2`) — dengan pemeriksaan kepemilikan di server. Lampiran C tidak berubah |
| **K-03** | **Akses Teknisi ke kalender ruangan.** Bab 18 memberi Teknisi 🔍 untuk "Reservasi Ruangan — lihat kalender", sedangkan `FR-07.1` tidak menyebut Teknisi pada daftar aktornya | ✅ Diselesaikan | Mengikuti Bab 18 dan Lampiran C (`reservation.view` = "Semua, scope berbeda"). Entri sidebar dirender bagi Teknisi tanpa tombol pengajuan, karena Teknisi tidak memiliki `reservation.create` (§5.3) |
| **K-04** | **Tanda tangan digital pada serah terima.** `FR-09.1` langkah 5 menyebut tanda tangan pada layar, sementara `FE-10` menempatkan tanda tangan digital sebagai pengembangan berikutnya | ✅ Sudah ditutup PRD | `31.6` sudah menyelesaikannya: **bukti serah terima digital** (kanvas coretan atau konfirmasi akun peminjam) masuk lingkup; tanda tangan elektronik tersertifikasi tetap `FE-10`. UX-SPEC mengikuti 31.6 (§7.6.6). Tidak ada tindakan |

## 12.5 Yang sengaja tidak dibuat

Daftar ini sama pentingnya dengan daftar halaman — ia mencegah perancang menambahkan layar yang justru melanggar requirement.

| Tidak dibuat | Alasan | Rujukan |
|---|---|---|
| Layar "Pemulihan Darurat Administrator" | Prosedur break-glass **tidak pernah** tersedia lewat antarmuka web maupun API | `BR-070b` · `FR-01.6 AC` · `SDD-SESS-11` |
| Reset password mandiri lewat tautan email | Tidak ada kanal email; reset bersifat administratif | `NO-08` · `FR-01.3` |
| Tombol aksi tulis pada chatbot | Chatbot bersifat *read-only*; saran aksi selalu berbentuk tautan ke formulir | `BR-075` · `NO-11` |
| Layar menyunting atau menghapus activity log | Log bersifat *append-only* bagi seluruh role | `BR-072` · `AL-03` |
| Layar pembayaran denda daring | Sistem hanya mencatat status; pembayaran luring | `NO-12` · `FE-20` |
| Layar tarif sewa atau biaya pemakaian | Fasilitas dipakai warga sekolah tanpa pungutan; satu-satunya kewajiban bernilai uang adalah denda keterlambatan dan ganti rugi | `NO-15` |
| Layar manajemen vendor / Purchase Order | Di luar lingkup alur pengadaan | `NO-04` · `FE-06` |
| Layar sinkronisasi luring / resolusi konflik | Mobile bersifat *online only*; satu-satunya pengecualian adalah antrean unggah berkas | `NO-07` · `MOB-OFF-01` |
| Pemilih sekolah / tenant | Sistem melayani satu sekolah | `NO-01` · Keputusan #1 |
| Layar penyusutan & nilai buku aset | Di luar lingkup | `NO-02` · `FE-04` |
| ~~Halaman "Barang Habis Pakai"~~ → **dicabut; halaman Bahan masuk lingkup** | `NO-13` dan `AS-24` ditarik; Bahan menjadi domain M-22 | M-22 · Lampiran A.1 |
| Peta denah interaktif | Lokasi disajikan sebagai pohon, bukan denah | `FE-19` |
| Foto pada halaman publik QR | Halaman publik tidak menampilkan foto sama sekali | `DP-05` · `SDD-FS-08` |
| Pengalih mode gelap | Di luar lingkup rilis ini | **UXD-12** |
