# Log Phase 07 — Integrasi Lintas Modul & UAT

| | |
|---|---|
| **Phase** | [`phases/phase-07.md`](../phases/phase-07.md) |
| **Milestone PRD** | `M6 (sebagian)` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | — |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-07.md`](../phases/phase-07.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 25 Oktober 2026 | Pemilik produk meminta seluruh fitur web tersedia di mobile untuk semua role dengan UI yang lebih visual. Lima putaran `AskUserQuestion` (keputusan 1–5). `PR-07-15` menurunkannya ke PRD (`MOB-SCP-01`…`04`), SDD (`SDD-MOB-13`), UX (**UXD-19**…**22**, 67 layar `MS-24`…`MS-90`) dan DESIGN (**DSD-11**/**12**, C-30…C-38), lalu merencanakan 20 PR implementasi `PR-07-16`…`35`. Pemilik produk kemudian memilih pelaksanaan dalam enam paket per domain (keputusan 6). | `PR-07-15` |
| 25 Oktober 2026 | `PR-07-15` (#185) tergabung. Paket 1 Fondasi & Akun dikerjakan di `feature/PR-07-16-fondasi-akun-mobile`: tiga commit `PR-07-16`, `PR-07-17`, `PR-07-18`. Dua putaran `AskUserQuestion` menghasilkan keputusan 7–10. | `PR-07-16`…`18` |
| 25 Oktober 2026 | Paket 1 (#186) tergabung. Paket 2 Pemanfaatan di `feature/PR-07-19-pemanfaatan-mobile`: commit `PR-07-19`, `PR-07-20`, `PR-07-25`, `PR-07-21` (urutan alur reservasi → peminjaman → serah terima → bahan). Satu putaran `AskUserQuestion` menghasilkan keputusan 11–12. | `PR-07-19`…`21`, `PR-07-25` |
| 25 Oktober 2026 | Paket 2 (#187) tergabung. Paket 3 Aset & Bahan di `feature/PR-07-23-aset-bahan-mobile`: commit `PR-07-23`, `PR-07-24`, `PR-07-26`. Dua putaran `AskUserQuestion` menghasilkan keputusan 13–15. | `PR-07-23`, `24`, `26` |
| 25 Oktober 2026 | Paket 3 (#188) tergabung. Paket 4 Perawatan & Opname di `feature/PR-07-27-perawatan-opname-mobile`: commit `PR-07-27`, `PR-07-28`, `PR-07-29`, ditambah satu commit `PR-07-27` yang memperketat uji setelah satu mutan lolos. Satu putaran `AskUserQuestion` menghasilkan keputusan 17–19. | `PR-07-27`, `28`, `29` |
| 26 Oktober 2026 | Paket 4 (#189) tergabung. Paket 5 Pengadaan & Penghapusan di `feature/PR-07-22-pengadaan-penghapusan-mobile`: commit `PR-07-22`, `PR-07-30`. Satu putaran `AskUserQuestion` menghasilkan keputusan 20–23. | `PR-07-22`, `PR-07-30` |
| 26 Oktober 2026 | Paket 5 (#190) tergabung. Paket 6 Pimpinan & Admin di `feature/PR-07-31-pimpinan-admin-mobile`: commit dependensi + versi, lalu `PR-07-31`…`PR-07-35`, ditambah satu commit uji `PR-07-33` setelah satu mutan lolos. Satu putaran `AskUserQuestion` menghasilkan keputusan 24–27. Seluruh 20 PR paritas mobile `PR-07-16`…`35` kini terimplementasi. | `PR-07-31`…`35` |
| 26 Oktober 2026 | Paket 6 (#191) tergabung. Pemilik produk meminta UI web seluruh role tidak lagi bertumpu pada teks panjang, melainkan visual (ikon, interaktif) seperti mobile, ditambah *smart guidance* dan sidebar yang bergulir terpisah dari konten. Dua putaran `AskUserQuestion` menghasilkan keputusan 28–31. `PR-07-36` di `feature/PR-07-36-web-visual-first` menurunkannya ke PRD (`WEB-VIS-01`…`05`), SDD (`SDD-FE-17`…`19`), UX (**UXD-24**…**27**), dan DESIGN (**DSD-13**/**14**, C-39…C-41), lalu merencanakan enam PR paket `PR-07-37`…`42`. | `PR-07-36` |
| 26 Oktober 2026 | Pemilik produk bertanya cara membuat petugas sarpras khusus gedung serta aset/bahan tertentu. Mekanisme yang ada (role kustom + scope `assigned` = penanggung jawab aset) tidak menjangkau gedung maupun bahan, sehingga pemilik produk meminta cakupan lokasi sebagai requirement baru. Tiga putaran `AskUserQuestion` menghasilkan keputusan 32–37. `PR-07-43` di `feature/PR-07-43-cakupan-lokasi` menurunkannya ke PRD (`PM-07`…`PM-10`, `FR-02.3`, `BR-069b`, `RE-14`, `NTF-06`, lokasi tujuan `FR-14.1`), SDD (`SDD-AUTH-13`/`14`), dan UX (**UXD-28**), lalu merencanakan `PR-07-44`…`50`. | `PR-07-43` |
| 26 Oktober 2026 | Pemilik produk meminta Kalender Ruangan mobile tampil seperti web P-27. Satu putaran `AskUserQuestion` (keputusan 38) memilih pita waktu per ruangan agar tetap sesuai `CAL-UI-07`; dikerjakan di `feature/ms-44-pita-waktu`. | `MS-44` |
| 26 Oktober 2026 | Pemilik produk menanyakan mengapa Siswa tidak dapat meminta bahan di mobile. PRD tidak mencatat alasan pengecualiannya; pemilik produk memutuskan membukanya. Satu putaran `AskUserQuestion` menghasilkan keputusan 39. `PR-07-51` di `feature/PR-07-51-bahan-siswa` menurunkannya ke PRD (`BR-086a`, `BR-091a`, `FR-22.4 A4`, Lampiran C) dan UX (**UXD-29**), dengan implementasi `PR-07-52`. | `PR-07-51` |
| 26 Oktober 2026 | `PR-07-52` dikerjakan di cabang yang sama dengan `PR-07-51` sehingga #199 menjadi satu PR paket Kelompok C (satu commit per ID PR). Penyimpangan teknis: (1) skema bersama `saldo_total`/`stok_minimum`/`saldo_terkini` menjadi *nullable* — `null` bagi scope `restricted`; (2) registri menu web/mobile mengenal sufiks `:penuh` agar master Bahan P-80/MS-40 tidak tampil bagi Siswa sesuai tabel NAVIGATION §5.3; (3) format pemilik Lampiran C dikembalikan ke `Siswa(`restricted`)` dan tafsir SDD-03 §4.8 diperbarui karena uji katalog RBAC. Rute langsung `/bahan` tetap terbuka bagi siswa (hanya bahan bertanda, angka `null`) — disembunyikan dari menu saja. | `PR-07-52` |
| 27 Oktober 2026 | Paket Fondasi web visual-first `PR-07-37` di `feature/PR-07-37-fondasi-visual-web` (dari `develop` setelah #199). Satu putaran `AskUserQuestion` menghasilkan keputusan 40–42. Dependensi baru `@radix-ui/react-popover` 1.1.23, `react-toggle-group` 1.1.19, `react-tooltip` 1.2.16 — seluruhnya Radix sesuai daftar tertutup `SDD-FE-13`. Uji lokal pemilik produk menemukan halaman masih bergulir dengan scrollbar kedua: elemen `sr-only` (absolute) — tabel data grafik, label sidebar ciut — lepas dari wadah gulir yang tidak `relative`; kedua wadah gulir kini `relative` dan diuji. Masukan berikutnya: wordmark sidebar terlalu kecil (32px, ~129px dari ruang ~208px) dan ikut bergulir — kini 48px, kepala logo tetap diam dan hanya daftar navigasi yang bergulir. Uji penuh web sempat gagal acak 6–9 dari ±540 uji (timeout) saat mesin dibebani server Expo; berkas yang gagal lolos saat dijalankan tersendiri, dan satu run uji penuh terakhir dihentikan karena memori hampir habis. | `PR-07-37` |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | **Cakupan:** semua fitur web di mobile untuk semua role, kecuali cetak label QR dan impor massal berkas (pemilik produk) | Pilihan "kecuali yang butuh perangkat khusus"; ditolak: paritas mutlak, bertahap lapangan saja | Ya — `MOB-SCP-01`/`02`, `UX-01`, **UXD-19** (mencabut **UXD-17**) |
| 2 | **Visual:** design system dikembangkan, bukan diganti — token & hierarki warna tetap, komponen C-30…C-38 ditambah (pemilik produk) | Ditolak: arah visual baru terpisah dari web | Ya — **DSD-11**/**12**, `MOB-SCP-04` |
| 3 | **Navigasi:** bottom tab Beranda · Tugas · Scan · Chatbot · Menu; Menu berisi pencarian modul + lima grup + fitur per permission; notifikasi ke lonceng header; chatbot juga dari layar lain (usulan pemilik produk) | Lima slot tidak menampung 67 layar | Ya — **UXD-20**…**22** |
| 4 | **Header ringkas satu baris** — kembali/ikon, judul, info, lonceng (pemilik produk) | Header lama dua baris teks + subjudul | Ya — **UXD-21**, C-30 |
| 5 | **Proses:** docs dulu (`PR-07-15`), lalu satu PR per modul; urutan pemohon → petugas/teknisi → pimpinan/admin (pemilik produk) | Aturan repo: keputusan lahir di docs sebelum kode | Tidak — rencana phase |
| 6 | **Paket:** `PR-07-16`…`35` dilaksanakan dalam **enam PR paket per domain** (Fondasi & Akun → Pemanfaatan → Aset & Bahan → Perawatan & Opname → Pengadaan & Penghapusan → Pimpinan & Admin), satu commit per ID PR, berurutan tanpa PR bertumpuk; menggantikan urutan per PR pada keputusan 5 (pemilik produk) | Layar bersama (`MS-51`, `MS-53`, `MS-58`) dibangun sekali; lebih sedikit putaran merge. Ditolak: 3 paket per tahap role (layar bersama dikerjakan dua kali), tetap 20 PR | Tidak — rencana phase (§7 Paket pelaksanaan) |
| 7 | **`MS-26` Pemberitahuan Privasi ditunda ke `PR-08-12`** (pemilik produk) | Isi pemberitahuan (`DP-01`, `DP-AI-04`, `TBD-FS-A`) dan layar padanannya `P-07` milik `PR-08-12`; web pun belum mendaftarkan `P-07`. Ditolak: kerangka tanpa isi, menulis isi dari PRD saat implementasi | Tidak — rencana phase (`PR-07-18`, `PR-08-12`) |
| 8 | **Menu `MS-31` hanya merender layar yang terdaftar di build** — registri `shared/screens.ts`, pola `HALAMAN_TERDAFTAR` web (pemilik produk) | Entri tanpa layar mobile akan menjadi tautan mati; ditolak: membuka padanan web sementara (bercampur dengan entri ↗ web `MOB-SCP-02`) | Ya — **UXD-23** |
| 9 | **Chatbot dikeluarkan dari Aksi Cepat Beranda** (pemilik produk) | Sudah ada tab + C-38; fitur "tanpa grup" tidak punya accent kotak ikon C-31. Ditolak: varian kotak netral/teal (varian komponen baru) | Ya — **UXD-23** |
| 10 | **Aksi Cepat tanpa layar terdaftar disembunyikan** — "Ajukan reservasi" muncul saat `MS-46` ada (pemilik produk) | Konsisten dengan keputusan 8; ditolak: tile nonaktif (varian baru C-31) | Ya — **UXD-23** |
| 11 | **Bukti serah terima/pengembalian mobile diunggah dan dikonfirmasi sebelum transaksi**, bukan diantrekan (pemilik produk) | UX §7.6.6 menyatakan transaksi tetap tercatat dan foto masuk antrean, tetapi API (`attachLoanEvidence`, `BR-027`) menolak berkas yang belum terkonfirmasi. `MOB-OFF-02` (PRD) umum dan tidak bertentangan. Ditolak: mengubah API agar menerima berkas tertunda (perubahan M-06/M-09 di luar paket) | Ya — UX §7.6.6 dan tabel keadaan dikoreksi |
| 12 | **Wizard `MS-46` mendukung ruangan, aset, dan gabungan** setara web (pemilik produk) | `MOB-SCP-01`; ditolak: gabungan sebagai entri ↗ web (pengecualian baru di luar `MOB-SCP-02`) | Tidak |
| 13 | **Unggah dokumen mobile memakai `expo-document-picker` 57.0.3** untuk Dokumen Aset dan dokumen penerimaan bahan (PDF/JPG/PNG/DOCX/XLSX ≤ 10 MB) (pemilik produk) | Ditolak: foto dokumen saja (format lain tetap di web). Modul native baru: fitur ini baru dapat dipakai setelah dev build/rilis store baru — tidak terkirim lewat OTA (`SDD-MOB-10`) | Tidak — dependensi aplikasi; gerbang rilis mobile berikutnya wajib membangun ulang binari |
| 14 | **Ekspor inventaris ruangan (XLSX/PDF) ditunda ke `PR-07-31`** bersama mekanisme simpan berkas di perangkat (pemilik produk) | Satu mekanisme ekspor untuk laporan dan inventaris; ditolak: `expo-sharing` sekarang, entri ↗ web | Tidak — rencana phase (`PR-07-31` diperluas) |
| 15 | **Jadwal tetap & blokade manual (`FR-07.5`) dikelola penuh di `MS-38`** — daftar, pratinjau, pembatalan reservasi bentrok beralasan, nonaktifkan; impor jadwal tetap ↗ web (pemilik produk) | Padanan P-23 web; ditolak: baca saja, tunda | Tidak |
| 16 | **Versi aplikasi mobile 0.3.0 → 0.4.0** bersama paket 3 (pemilik produk) | `runtimeVersion` berkebijakan `appVersion`: tanpa kenaikan, OTA paket 3 sampai ke binari tanpa `expo-document-picker` dan crash saat impor modul. Ditolak: impor malas, mengandalkan disiplin rilis | Tidak — rilis: binari 0.4.0 wajib dibangun ulang; gerbang `426` (`MOB-VER-03`) dapat memaksa pembaruan |
| 17 | **Restyle ringan `MS-15`, `MS-17`, `MS-19` tanpa perubahan perilaku** (pemilik produk) — kartu C-32, chip, subjudul ke C-36 | Layar lapangan sudah stabil di Phase 06; perubahan alur di sana menambah risiko luring. Ditolak: tata ulang penuh, tanpa restyle | Tidak |
| 18 | **Rekonsiliasi `MS-66` mencakup Aset dan Bahan** (pemilik produk) | Web P-50 melayani dua domain; tanpa Bahan, siklus opname Bahan tetap memerlukan web. Ditolak: Aset saja | Tidak |
| 19 | **Berita acara opname PDF dibuka di peramban lewat URL presign; ekspor XLSX ke `PR-07-31`** (pemilik produk) | Satu mekanisme simpan berkas di perangkat untuk seluruh ekspor (sejalan keputusan 14). Ditolak: unduh ke perangkat sekarang | Tidak |
| 20 | **Keputusan approver penghapusan aset diberikan di Detail Keputusan `MS-54`**, bukan panel di `MS-73` (pemilik produk) — setujui sebagian per aset, penyetujuan akhir hanya Pimpinan (R-03 + `disposal.approve`), lampiran wajib CLEAN | Satu jalur keputusan approver, seperti pengadaan dan permintaan bahan. Ditolak: panel di `MS-73` seperti web, keduanya | Tidak — perilaku sama dengan web P-57 |
| 21 | **Lampiran pengadaan & penghapusan dari kamera/galeri (dikompresi `MOB-MED-01`) dan pemilih berkas** (pemilik produk); komponen `AttachmentField` + `photo.ts` di `shared/upload` | Faktur dan foto kondisi paling sering dipotret; PDF/DOCX tetap perlu. Ditolak: kamera/galeri saja, berkas saja | Tidak |
| 22 | **Ekspor arsip penghapusan (XLSX/PDF) ke `PR-07-31`; cetak QR unit hasil penerimaan tetap ↗ web (`MOB-SCP-02`)**; berita acara PDF dibuka di peramban (pemilik produk) | Sejalan keputusan 14 dan 19 — satu mekanisme simpan berkas. Ditolak: unduh ke perangkat sekarang | Tidak |
| 23 | **Pintu masuk "Usulkan penggantian/penghapusan" dari Detail Aset (`MS-09`) dan Detail WO (selesai + rekomendasi)** dengan prefill `?aset=` (pemilik produk) | Sama dengan web P-18/P-44; menyentuh `assets` dan `workorders` hanya sebatas satu tombol. Ditolak: hanya dari daftar | Tidak |
| 24 | **Ekspor disimpan lewat lembar bagikan OS (`expo-sharing`)**: berkas diunduh ke cache aplikasi lalu dibagikan ke Files/Drive/Unduhan atau aplikasi lain (pemilik produk) | Satu mekanisme untuk Android & iOS; menutup keputusan 14, 19, 22. Ditolak: folder SAF Android saja, keduanya | Tidak — modul native baru → versi 0.5.0 (`MOB-VER-03`) |
| 25 | **Password sementara & kode aktivasi tampil sekali dengan tombol Salin (`expo-clipboard`)** (pemilik produk) | Sama dengan web; tangkapan layar sudah diblokir aplikasi. Ditolak: tanpa salin | Tidak (BR-070c tetap: rahasia hanya di state layar) |
| 26 | **Editor Approval Rule `MS-84` berparitas penuh dengan web** — pohon kondisi bersarang ≤ 3 tingkat, langkah/SLA/eskalasi, cadangan, terminal, pratinjau (pemilik produk) | Tanpa itu aturan bersarang tidak dapat disunting di ponsel. Ditolak: satu tingkat grup, baca-saja | Tidak — evaluator tetap di server (SDD-APR-10) |
| 27 | **Kenaikan Kelas Massal `MS-79` dan Kalender Akademik `MS-86` penuh** (pemilik produk) | Sama dengan web P-64/P-71. Ditolak: `MS-79` ↗ web | Tidak |
| 28 | **Web visual-first untuk semua role**: sub-judul diganti ikon info, ikon modul dengan kotak accent, ringkasan KPI + grafik mini + cincin, ilustrasi keadaan, dan *smart guidance* (contoh pengisian, validasi langsung, tooltip kontekstual, saran tindakan) (pemilik produk) | Arah yang sama dengan mobile (**DSD-11**); token dan hierarki warna tetap | Ya — `WEB-VIS-01`/`02`, **UXD-24**/**27**, **DSD-13**, C-39/C-41 |
| 29 | **Saran tindakan hanya dari business rule dan data yang sudah ada**, tanpa logika, endpoint, atau permission baru (pemilik produk) | Requirement baru tidak lahir saat implementasi. Ditolak: heuristik baru (wajib PRD dulu), tanpa saran | Ya — `WEB-VIS-03`, `SDD-FE-18` |
| 30 | **Daftar: Tabel ⇄ Kartu**, dengan kolom status berupa badge berikon; **sidebar** ikon + label yang dapat diciutkan dan bergulir terpisah; **mikro-interaksi** ber-token tanpa pustaka animasi (pemilik produk) | Tabel tetap terpadat untuk kerja meja. Ditolak: tabel saja, kartu saja, rail ikon + flyout, animasi kaya GSAP (dependensi baru) | Ya — `WEB-VIS-04`/`05`, **UXD-25**/**26**, **DSD-14**, `SDD-FE-17`/`19`, C-40 |
| 31 | **Proses:** docs dulu (`PR-07-36`), lalu paket Fondasi → Aset & Bahan → Pemanfaatan → Perawatan → Pengawasan → Sistem, berurutan tanpa PR bertumpuk; semua role ditinjau (pemilik produk) | Pola `PR-07-15` → paket 1–6; satu halaman disentuh tepat sekali. Ditolak: per role (halaman bersama tumpang tindih), satu paket besar | Tidak — rencana phase (§7 Paket web) |
| 32 | **Model cakupan lokasi:** simpul gedung/area/ruangan (turunan ikut, termasuk yang ditambah kemudian), ditetapkan **per user** oleh **Administrator saja**, sebagai **lapisan irisan** di atas scope yang ada; pengguna tanpa cakupan tidak dibatasi; hanya role staf R-02, R-04, `RK-*` (pemilik produk) | Akun yang ada tidak berubah perilaku; satu role melayani banyak petugas gedung. Ditolak: per gedung saja, per ruangan saja, per role kustom, scope kelima `location`, Admin + petugas penuh | Ya — `PM-07`, `PM-10`, `FR-02.3`, `BR-069b`, `SDD-AUTH-13` |
| 33 | **Bahan ikut lokasi penyimpanan**; objek tanpa lokasi memakai **lokasi tujuan** — usulan pengadaan mendapat field lokasi tujuan, permintaan bahan memakai lokasi penyimpanan asal yang sudah ada (pemilik produk) | Saldo bahan sudah per ruangan. Ditolak: per kategori bahan, lokasi + kategori, objek tanpa lokasi hanya untuk petugas penuh / terlihat semua | Ya — `PM-08`, `FR-14.1` |
| 34 | **Pemindahan ke luar cakupan ditolak**: asal dan tujuan wajib tercakup (pemilik produk) | Ditolak: boleh keluar, perlu persetujuan (alur approval baru) | Ya — `PM-09` |
| 35 | **Approval & notifikasi hanya ke pemegang lokasi**, jatuh ke pemegang role tanpa cakupan, lalu `RE-11` (pemilik produk) | Antrean petugas gedung tidak berisi pengajuan yang tidak dapat ia buka. Ditolak: tetap seperti sekarang | Ya — `RE-14`, `NTF-06`, `SDD-AUTH-14` |
| 36 | **Modul yang dibatasi:** seluruh grup — Aset & Bahan, Pemanfaatan, Perawatan, Pengawasan (termasuk dashboard, analitik, chatbot) (pemilik produk) | — | Ya — `PM-08` |
| 37 | **Urutan:** spesifikasi sekarang (`PR-07-43`, PR dibuka setelah #195 tergabung), implementasi `PR-07-44`…`50` setelah paket web visual-first (pemilik produk) | Halaman tidak disentuh dua kali. Ditolak: kode duluan (redesign ditunda), paralel | Tidak — rencana phase (§7 Paket cakupan lokasi) |
| 38 | **Kalender Ruangan mobile `MS-44` mendapat pita waktu per ruangan**, legenda lima keadaan, dan pilihan Harian/Mingguan/Bulanan, tetap sebagai daftar per ruangan/hari (pemilik produk) | Tampilan visual seperti P-27 tanpa memaksakan matriks di layar kecil. Ditolak: matriks ruangan × jam di ponsel (menuntut revisi `CAL-UI-07`), matriks hanya di tablet | Tidak — sesuai `CAL-UI-01`, `CAL-UI-05`, `CAL-UI-07` |
| 39 | **Siswa/OSIS boleh meminta bahan**: hanya bahan bertanda *boleh diminta siswa*, saldo tampil sebagai status Tersedia/Terbatas/Habis, tanpa batas jumlah khusus, dan **tanpa approval** — Petugas menilai saat penyerahan (pemilik produk) | OSIS & praktik SMK memakai bahan habis pakai. Ditolak: selalu lewat approval Guru → Petugas, ikut ambang biasa, semua bahan aktif, angka saldo, batas per permintaan | Ya — `BR-086a`, `BR-091a`, `FR-22.4 A4`, Lampiran C, **UXD-29** |
| 40 | **Saran Dashboard P-12 (C-41) tiga butir lintas-aksi**: stok bahan menipis → Ajukan pengadaan (`FR-22.7`, `BR-085`), work order melewati target → Buka work order saya (`NT-23`), konfigurasi belum lengkap → Lengkapi parameter (`FR-15.1 A1`); hanya saran yang aksinya berbeda dari drill-down kartunya (pemilik produk) | Saran yang menduplikasi tautan Zona 1 tidak menambah informasi. Ditolak: tiga + antrean (QR, reset password), hanya stok menipis | Tidak — penerapan `SDD-FE-18` |
| 41 | **Halaman tanpa grup domain tidak memakai kotak ikon modul** di kepala halaman (Beranda, Chat, Akun, auth/publik); kotak ikon baru tampil di halaman bergrup mulai `PR-07-38` (pemilik produk) | Sejalan keputusan 9: tidak ada varian kotak netral. Ditolak: kotak `accent.gray` untuk semua halaman tanpa grup (memperluas makna accent Sistem) | Tidak — tafsir PATTERNS §1.2 |
| 42 | **Aksi Cepat Zona 4 P-12 sama dengan Beranda mobile** — Scan · Persetujuan saya · Ajukan reservasi · Lapor kerusakan, bagi role mana pun yang memegang permission-nya dan halamannya terdaftar; chatbot bukan tile (pemilik produk) | Satu pola dengan **UXD-23**. Ditolak: hanya pemohon & Teknisi persis UX §8.3 | Tidak |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| Phase 07 hanya E2E, uji otorisasi, dan perbaikan cacat; `PR-07-14` menolak permintaan fitur | 21 PR paritas mobile `PR-07-15`…`35` ditambahkan **sebelum** E2E/UAT | Keputusan pemilik produk 25 Oktober 2026 (keputusan 1–5); UAT harus menguji mobile untuk seluruh role | E2E `PR-07-02`…`08` dan UAT menunggu tahap A–C; rencana total 230 → 251 PR |
| Satu PR GitHub per ID PR (keputusan 5) | Enam PR paket berukuran L, masing-masing memuat beberapa ID PR | Keputusan 6 | Tidak ada; jumlah ID PR tetap 251 |
| Phase 07 berlanjut ke E2E/UAT setelah paritas mobile | 7 PR web visual-first `PR-07-36`…`42` ditambahkan **sebelum** E2E/UAT | Keputusan 28–31 | E2E `PR-07-02`…`08` menunggu web visual-first, karena selektor UI berubah; rencana total 251 → 258 PR |
| Setelah web visual-first langsung E2E/UAT | 8 PR cakupan lokasi `PR-07-43`…`50` ditambahkan sebelum E2E/UAT | Keputusan 32–37 | Uji otorisasi `PR-07-08` wajib mencakup pengguna bercakupan lokasi; rencana total 258 → 266 PR |
| `PR-07-18` memuat `MS-26` Privasi | `MS-26` tidak dibuat; tautan Privasi di Login/Profil belum dirender | Keputusan 7 | `PR-08-12` memuat `MS-26` (baris phase-08 diperbarui) |
| `PR-07-17` menata ulang 25 layar | Seluruh layar memperoleh header C-30 + ikon info C-36, kartu/badge bertoken & berikon, dan batas dua kalimat (diuji). Daftar Tugas, Notifikasi, Persetujuan Saya, Tiket Kerusakan, Work Order Saya, Sesi Opname, Beranda ditata ulang dengan C-31…C-34/C-37. Isi layar detail & formulir lapangan (Detail Aset, Hasil Scan, Lapor Kerusakan, Eksekusi WO, Scan Opname) hanya menerima komponen bersama | Menjaga "perilaku layar lama tidak berubah" dan batas ukuran paket; susunan isi detail lebih tepat ditata saat paket domainnya menyentuh layar itu | Paket 3 (`MS-09`), 4 (`MS-17`, `MS-19`, `MS-15`) menata isi detailnya dengan C-32/C-34 |
| Rute mobile lama | `/notifikasi` keluar dari tab ke tumpukan akar; `/profil` dan `/chat` pindah ke grup tab Menu/Chatbot dengan **path yang sama** | **UXD-20**/**21** | Tidak ada — deep link (`SDD-MOB-12`) tetap berlaku |
| `PR-07-21` `MS-58` memuat aksi "serahkan · tutup" | `MS-58` paket 2 hanya revisi & batalkan; penyerahan dan tutup sisa (`material.issue`) | Rencana sendiri menaruh penyerahan di `PR-07-26` | Paket 3 (`PR-07-26`) menambah penyerahan + tutup sisa di `MS-58` |
| Keputusan bahan di `MS-58` | Persetujuan permintaan bahan tetap lewat Detail Keputusan `MS-54`, tidak digandakan di `MS-58` seperti web `RequestApproval` | Satu jalur keputusan approver di mobile | Bila UAT meminta keputusan dari `MS-58`, ditambahkan di paket 4/6 |
| `PR-07-24` berukuran `S` | +204 baris produksi (`M`) | Jadwal tetap & blokade masuk `MS-38` (keputusan 15) | Tidak ada |
| `MS-59` dan Tiket Saya; `MS-61` dan `MS-16` | Masing-masing berbagi satu rute (`/kerusakan`, `/work-order`); cakupan luas tampil bila izin `damage.view` = `all` atau pemegang `workorder.verify`/`create`, dengan sakelar "Hanya penugasan saya" | Pola yang sama dengan `MS-12`/`MS-49`; cakupan diputus server | Tidak ada |
| Entri Menu "Stock Opname" menuju `MS-65` (alternatif `MS-18`) | Entri menuju `MS-18`; pemegang `audit.manage`/`audit.approve` mendapat mode pengelola (padanan P-47: semua sesi, saringan status, tombol Buat Sesi `MS-65`, ketuk → `MS-66`) | `MS-65` adalah formulir; tanpa daftar, pengelola tidak dapat mencapai `MS-66`. UX tidak memiliki ID layar mobile untuk P-47 | Bila UX menambah ID padanan P-47, registri cukup dipetakan ulang |
| `MS-66` padanan P-50 | `MS-66` juga memuat fungsi P-49: progres per lokasi, finalisasi, batalkan sesi (R-01), buat ulang berita acara, foto bukti | Satu layar per sesi bagi pengelola; tautan web rekonsiliasi lama dihapus | Tidak ada |
| `MS-54` menolak jenis pengajuan selain reservasi ruangan dan pengadaan | `MS-54` juga memuat konteks penghapusan (`/asset-disposals/{id}`) dan keputusannya | Keputusan 20 | Tidak ada |
| Sunting usulan di tempat seperti web P-53/P-57 | Rute terpisah `/pengadaan/[id]/ubah` dan `/penghapusan/[id]/ubah` memakai layar `MS-68`/`MS-72` | Formulir panjang tidak muat di dalam detail pada ponsel; tidak ada ID layar baru | Tidak ada |
| `PR-07-22`/`PR-07-30` hanya menyentuh `procurement`/`disposal` | Satu tombol tambahan di Detail Aset dan Detail WO; aturan keputusan penghapusan ditaruh di `approvals/model.ts` | Keputusan 20 dan 23; `approvals` tidak boleh mengimpor layar `disposal` dalam uji node | Tidak ada |
| Detail Pengguna `MS-78` padanan P-63 | Panel pseudonimisasi (P-63 web) tidak dibuat; tetap di web | UX `MS-78` hanya menyebut ubah · reset password · reset 2FA · nonaktifkan; pseudonimisasi tidak dapat dibatalkan | Bila UAT memintanya, ditambahkan sebagai PR tersendiri |
| Laporan Analitik `MS-75` padanan P-59 | Tabel menjadi kartu per grup (4 kolom pertama + indikator grafik); pengurutan per kolom tidak ditawarkan | Tabel lebar tidak terbaca di ponsel; urutan bawaan server tetap | Tidak ada |
| Validasi klien Kalender/Parameter | Hanya kelengkapan isian seperti web; urutan tanggal semester, rentang parameter (FR-20.1 A1), dan hari kerja diputus server | Tidak menambah aturan bisnis di klien | Tidak ada |
| `MS-12`/`MS-49` dan `MS-14`/`MS-52` | Masing-masing satu layar (`/peminjaman`, `/denda`) seperti web P-32/P-35; judul menyesuaikan izin | Cakupan baris diputus server; dua layar identik hanya menggandakan kode | Tidak ada |
| `PR-07-37` hanya menyentuh halaman Beranda, akun, dan auth/publik | Ilustrasi Keadaan C-37 dipasang di komponen keadaan bersama (`shared/states`), sehingga keadaan kosong/galat/tanpa akses **seluruh** halaman ikut berubah | Satu komponen bersama (`SDD-FE-09`); memasangnya per paket berarti dua gaya keadaan berdampingan | Paket `PR-07-38`…`42` tidak perlu menyentuh keadaan lagi |
| Ikon entri sidebar tetap | Ikon entri diselaraskan dengan ikon modul FOUNDATIONS §8 (mis. Bahan `boxes`, Persetujuan `badge-check`, Kerusakan `hammer`, Penghapusan `archive-x`, Activity Log `history`, Monitoring Chatbot `bot`) | **UXD-25**: entri sidebar memakai ikon modul (**DSD-12**); ikon lama ditetapkan sebelum §8 ada | Kotak ikon kepala halaman paket berikutnya memakai ikon yang sama |
| Validasi langsung memakai skema bersama (`SDD-FE-18`) | Form auth P-01…P-05 & P-77 memakai aturan klien yang sudah ada (format email, kecocokan konfirmasi password); tidak ada skema auth di `packages/schemas` | Kebijakan password tetap diputus server (`NFR-S-03a`); menambah skema bersama di luar lingkup paket | Form domain di `PR-07-38`…`42` memakai skema bersama yang ada |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-07.md` §7](../phases/phase-07.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| `feature/tur-produk-role` | Tur produk interaktif berbasis role, web + mobile | Permintaan pemilik produk 26 Oktober 2026 tanpa ID PRD/UX; pemilik produk memilih tanpa dokumen. Narasi tur dipilih dari role, tetapi langkahnya tetap tersaring permission `/me`. `react-native-copilot` menarik `@changesets/cli` sebagai dependensi produksi (+968 baris lockfile, tidak ter-bundle, tanpa kerentanan baru) |
| `chore/worker-health-port` | Port `/health` worker dapat diatur `WORKER_HEALTH_PORT` (bawaan 3000) | API dan worker sama-sama memakai port 3000 yang ditulis langsung; saat uji lokal mobile + web pemilik produk, keduanya tidak dapat berjalan di satu laptop sehingga unggahan, ekspor, berita acara, dan notifikasi tidak dapat diuji. Produksi tidak berubah |
| `PR-07-15`…`PR-07-35` | Paritas mobile seluruh role + mobile visual-first | Rencana awal mengikuti `UX-01`/UX §6.3: mobile hanya alur lapangan. Permintaan baru pemilik produk setelah uji lokal mobile; tidak ada phase yang memiliki pekerjaan ini |
| `PR-07-36`…`PR-07-42` | Web visual-first seluruh role | Halaman web Phase 01–06 dibangun mengikuti PATTERNS §1.2 lama (sub-judul paragraf) dan tabel saja. Setelah mobile visual-first selesai, pemilik produk meminta arah yang sama di web; tidak ada phase yang memiliki pekerjaan ini |
| `PR-07-43`…`PR-07-50` | Cakupan lokasi pengguna (petugas khusus gedung/area/ruangan) | Scope Lampiran C hanya `all`/`own`/`assigned`/`restricted`; tidak ada dimensi lokasi. Permintaan pemilik produk setelah mengetahui `assigned` hanya bekerja per aset dan tidak menjangkau bahan |
| `PR-07-51`…`PR-07-52` | Permintaan bahan oleh Siswa/OSIS | Lampiran C awal tidak memberi Siswa izin bahan tanpa alasan tertulis; permintaan pemilik produk saat uji mobile |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] **Angka baseline pra-implementasi `IMP-04`** — durasi opname manual, rata-rata waktu persetujuan disposisi kertas, tingkat pengembalian tepat waktu versi manual. Tanpa angka ini `SC-03`, `SC-06`, `SC-07`, `SC-08` tidak dapat dibuktikan selamanya
- [ ] Klasifikasi setiap temuan UAT: **cacat** (diperbaiki di phase ini) atau **permintaan fitur** (menjadi CR)
- [ ] Bukti penutupan `GL-01`, `GL-02`, `GL-05`, `GL-09`

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| Chatbot mobile tidak dapat mengirim pesan ("Tidak dapat terhubung") dan layar Chatbot, Hitung Bahan opname, Detail Work Order, serta Antrean Foto Hasil memunculkan "Text strings must be rendered within a <Text> component"; ditemukan pemilik produk saat uji lokal 26 Oktober 2026 | Adapter `fetch` axios menolak `responseType:"stream"` karena `Response` global React Native tidak berstream; spasi lepas di antara blok JSX dirender di luar `<Text>`. Keduanya ada sejak gabungan Phase 03–06 (#182); uji lama memalsukan `api.post` dan berjalan di `Response` Node | Cabang `fix/chatbot-mobile-streaming` (di luar rencana phase): adapter SSE memanggil `expo/fetch` langsung di dalam klien bersama; lima spasi lepas dihapus; uji meniru polyfill React Native dan uji pemindai pola spasi lepas | Tidak |
| Paket 1 hanya diverifikasi lewat typecheck, lint, uji unit, dan bundel `expo export`; tampilan di perangkat/emulator tidak diperiksa di sesi implementasi | Tata letak (tinggi bottom sheet, posisi C-38 di atas tab, header menyusut) belum terlihat di layar nyata | Uji manual di dev build Android/iOS sebelum merge paket 1 | Ya |
| Paket 2 juga belum dijalankan di perangkat; bagian yang bergantung native — pemindai QR unit (`expo-camera`), ekspor PNG tanda tangan (`react-native-svg` `toDataURL`), unggah foto bukti — hanya teruji lewat typecheck dan bundel | Serah terima/pengembalian dapat gagal di lapangan bila ekspor PNG atau izin kamera berperilaku lain | Uji serah terima → pengembalian end-to-end di dev build terhadap staging sebelum merge paket 2 | Ya |
| Kembali dari fitur yang dibuka lewat Menu mendarat di Beranda; ditemukan pemilik produk saat uji lokal 26 Oktober 2026 | 9 entri Menu (Inventaris Aset, Scan QR, Persetujuan Saya, Laporan Kerusakan, Work Order, Stock Opname, Pengadaan, Penghapusan) berutekan di tab Tugas/Scan; Tabs memakai `backBehavior` bawaan `firstRoute` sehingga Kembali di layar teratas tab tujuan melompat ke Beranda | Pemilik produk memilih Kembali mengikuti riwayat tab (`backBehavior="history"`, cabang `fix/menu-back-tab-history`, di luar rencana phase). Ditolak: memindahkan Pengadaan & Penghapusan ke tab Menu, shared routes untuk seluruh 9 fitur (expo-router 57 tidak memilih grup aktif untuk path polos). Sisa: sorotan tab bawah berpindah ke Tugas/Scan selama di layar itu | Tidak |
| Paket 3 menambah modul native `expo-document-picker`; binari dev build lama tidak memuatnya, sehingga unggah dokumen hanya berjalan setelah build ulang | Pembaruan OTA ke binari lama akan menampilkan galat saat memilih dokumen | Versi dinaikkan ke 0.4.0 sehingga OTA paket 3 tidak mendarat di binari 0.3.0 (keputusan 16); binari 0.4.0 tetap harus dibangun ulang sebelum uji | Ya |
| Paket 4 belum dijalankan di perangkat; finalisasi → rekonsiliasi → persetujuan opname hanya teruji lewat logika murni, typecheck, dan bundel | Urutan tombol dan keadaan sesi (finalisasi, menunggu persetujuan, dikembalikan) belum terlihat dengan data nyata | Uji satu siklus opname Aset dan satu Bahan di staging dengan tiga akun (pelaksana, pengelola, Pimpinan) | Ya |
| Paket 5 belum dijalankan di perangkat; unggah kamera/galeri/berkas, penerimaan atomik, dan eksekusi penghapusan hanya teruji lewat logika murni, typecheck, dan bundel | Kompresi foto dan pemilih berkas dapat berperilaku lain di Android/iOS; urutan langkah keputusan multi-level belum terlihat dengan data nyata | Uji satu usulan pengadaan → persetujuan sebagian → penerimaan, dan satu penghapusan → persetujuan Pimpinan → eksekusi di staging | Ya |
| Paket 6 menambah modul native `expo-sharing` dan `expo-clipboard`; ekspor, salin rahasia, dan editor aturan baru teruji lewat logika murni, typecheck, dan bundel | Binari 0.4.0 tidak memuat modul ini; lembar bagikan dan clipboard belum dicoba di Android/iOS | Versi dinaikkan ke 0.5.0 sehingga OTA tidak mendarat di binari lama; bangun ulang binari 0.5.0 lalu uji ekspor, salin, dan satu aturan bersarang di staging | Ya |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| Baris produksi `apps/mobile/src` per commit paket 1 | `PR-07-16` L · `PR-07-17` L · `PR-07-18` M (≤ 400) | `PR-07-16` +522/−52 · `PR-07-17` +301/−96 · `PR-07-18` +286/−32 | §7 phase-07 |
| Uji mobile (`npm test -w apps/mobile`) | Hijau | 18 berkas, 139 uji lulus (sebelumnya 13 berkas, 108 uji) | `CD-01` |
| Uji mutasi serial pada aturan inti paket 1 | Seluruh mutan mati | 9/9 mati (registri Menu, ikon di atas kuning, C-38 di pemindai, badge 99+, Aksi Cepat terdaftar, push bergantung in-app, kelompok terkunci, cabut sesi sendiri, batas dua kalimat); sumber pulih byte-per-byte | CLAUDE.md "uji yang gagal bila logikanya dicabut" |
| Bundel Android `expo export` | Berhasil | Berhasil, 4,85 MB (Hermes bytecode) | `SDD-MOB-10` |
| Baris produksi paket 2 per commit | `PR-07-19` L · `PR-07-20` M · `PR-07-25` L · `PR-07-21` M (≤ 400) | `PR-07-19` +550/−4 · `PR-07-20` +254/−3 · `PR-07-25` +349/−11 · `PR-07-21` +166/−2 | §7 phase-07 |
| Uji mobile paket 2 | Hijau | 23 berkas, 169 uji lulus (sebelum paket: 139) | `CD-01` |
| Uji mutasi serial paket 2 | Seluruh mutan mati | 9/9 mati (Tinjau semua-atau-tidak, bentrok ruangan, unit manual, foto wajib serah terima, pengembalian sebagian, aksi kewajiban dari flag, jatuh tempo perpanjangan, batal permintaan, tugas native); sumber pulih byte-per-byte | CLAUDE.md |
| Bundel Android paket 2 | Berhasil | Berhasil, 5,07 MB | `SDD-MOB-10` |
| Baris produksi paket 3 per commit | `PR-07-23` L · `PR-07-24` S · `PR-07-26` M | `PR-07-23` +387/−4 · `PR-07-24` +204 · `PR-07-26` +231/−11 | §7 phase-07 |
| Uji mobile paket 3 | Hijau | 26 berkas, 190 uji lulus (sebelum paket: 169) | `CD-01` |
| Uji mutasi serial paket 3 | Seluruh mutan mati | 9/9 mati (nomor seri satu unit, batas 50 mutasi, blok finansial, batas 10 MB, bentrok blokade, reservasi siswa, dokumen CLEAN, batas penyerahan, satuan terkunci); sumber pulih byte-per-byte | CLAUDE.md |
| Bundel Android paket 3 | Berhasil | Berhasil, 5,28 MB | `SDD-MOB-10` |
| Baris produksi paket 4 per commit | `PR-07-27` M · `PR-07-28` S · `PR-07-29` M | `PR-07-27` +216/−26 · `PR-07-28` +116 · `PR-07-29` +201/−23 | §7 phase-07 |
| Uji mobile paket 4 | Hijau | 28 berkas, 204 uji lulus (sebelum paket: 190) | `CD-01` |
| Uji mutasi serial paket 4 | Seluruh mutan mati | 18/18 mati setelah satu uji diperketat (penugasan hanya untuk tindak lanjut semula lolos; kini mati). Sasaran: teknisi wajib, satu objek WO, kondisi pasca wajib, mode pengelola WO, target jadwal, checklist, jatuh tempo, lokasi terbuka, hitung Bahan, foto tertunda, tindakan Hilang, R-03 untuk Bahan, pemisahan tugas, kirim lengkap, kategori hanya Aset, basis rekonsiliasi; sumber pulih byte-per-byte | CLAUDE.md |
| Bundel Android paket 4 | Berhasil | Berhasil, 5,4 MB | `SDD-MOB-10` |
| Baris produksi paket 5 per commit | `PR-07-22` M · `PR-07-30` M (≤ 400) | `PR-07-22` +232/−1 · `PR-07-30` +345/−30 | §7 phase-07 |
| Uji mobile paket 5 | Hijau | 30 berkas, 220 uji lulus (sebelum paket: 204) | `CD-01` |
| Uji mutasi serial paket 5 | Seluruh mutan mati | 16/16 mati (syarat pengajuan, saringan draf, penyunting pemilik, batas sisa penerimaan, lokasi wajib, penutupan setelah tahun anggaran, cabang penolakan, garansi, bukti kehilangan CLEAN, foto pelaksanaan, pembatalan R-01, pemulihan R-01, keputusan akhir R-03, langkah akhir, kecocokan instance, lampiran CLEAN); sumber pulih byte-per-byte | CLAUDE.md |
| Bundel Android paket 5 | Berhasil | Berhasil, 5,5 MB; tanpa modul native baru | `SDD-MOB-10` |
| Baris produksi paket 6 per commit | `PR-07-31` M · `PR-07-32` M · `PR-07-33` L · `PR-07-34` M · `PR-07-35` S | `PR-07-31` +211/−1 · `PR-07-32` +246 · `PR-07-33` +410 · `PR-07-34` +219 · `PR-07-35` +182 | §7 phase-07 |
| Uji mobile paket 6 | Hijau | 35 berkas, 246 uji lulus (sebelum paket: 220) | `CD-01` |
| Uji mutasi serial paket 6 | Seluruh mutan mati | 21/21 mati setelah satu uji ditambah (batas bawah SLA semula lolos). Sasaran: pasangan tanggal, izin rincian, presisi grafik, tanda selisih, panjang nama berkas, consent wali, unit dipertahankan, batas 200 siswa, sisa gagal, kunci inti Admin, cakupan semula, SLA, eskalasi, kondisi `{}`, awalan galat pratinjau, urutan RE-04, parameter tak berubah, kepala unit, libur umum, batas akhir hari, kode dicabut; sumber pulih byte-per-byte | CLAUDE.md |
| Bundel Android paket 6 | Berhasil | Berhasil, 5,8 MB; `npm ci --dry-run` lolos | `SDD-MOB-10` |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-07.md` §9 dan §12](../phases/phase-07.md).

- [ ] Seluruh 14 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| `MS-26` Pemberitahuan Privasi mobile + tautannya di Login/Profil | `PR-08-12` | Keputusan 7 — isi `DP-01` milik `PR-08-12` |
| Ekspor inventaris ruangan `MS-38` | `PR-07-31` | Keputusan 14 |
| Ekspor XLSX hasil opname dan simpan berita acara ke perangkat | `PR-07-31` | Keputusan 19 |
| Ekspor arsip penghapusan XLSX/PDF `MS-71` | `PR-07-31` | Keputusan 22 |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
