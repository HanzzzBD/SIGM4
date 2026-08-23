# Decisions — SIGM4 UX

> **Dokumentasi UX SIGM4** — [Overview](UX-SPEC.md) · [Information Architecture](INFORMATION-ARCHITECTURE.md) · [Navigation](NAVIGATION.md) · [Page Specification](PAGE-SPECIFICATION.md) · [User Flows](USER-FLOWS.md) · **Decisions**

**Berkas ini memuat:** [§12 UX Decision Log](#12-ux-decision-log) — keputusan UX yang diambil, keputusan yang masih terbuka (`BLOCKED`), konflik PRD/SDD yang ditemukan, dan daftar layar yang sengaja tidak dibuat.

Penomoran bagian dipertahankan dari UX-SPEC v1.0 agar seluruh rujukan silang tetap sahih — peta lengkap ada di [Peta bagian → berkas](UX-SPEC.md#peta-bagian--berkas).

> **Keputusan `BLOCKED` pada §12.3 belum diselesaikan dan tidak boleh diputuskan sepihak.** Bagian dokumentasi yang bergantung padanya ditandai `BLOCKED` di tempatnya masing-masing. **K-01 / UXD-08 sudah ditutup pemilik produk** — lihat §12.2.

| Berkas tetangga | Kaitan |
|---|---|
| [`UX-SPEC.md`](UX-SPEC.md) | §13.4 memuat ringkasan cakupan; daftar tindak lanjut berada di akhir berkas itu |
| [`PAGE-SPECIFICATION.md`](PAGE-SPECIFICATION.md) | **UXD-09** memblokir satu field pada §7.6.5; **UXD-10** memblokir filter arsip pada §7.6.8 |
| [`USER-FLOWS.md`](USER-FLOWS.md) | F-15 (§9.5) — cabang Ganti Rugi mengikuti **UXD-08** |
| [`TBD-REGISTER.md`](../SDD/TBD-REGISTER.md) | Register TBD tingkat SDD — kelima keputusan terbuka di sini memetakannya |

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
| **UXD-12** | **Web tidak mendukung mode gelap** — satu set token warna saja | **User Decision** · menutup `TBD-FE-B` | PRD tidak pernah memintanya, dan pengguna lapangan bekerja pada kondisi terang. **Konsekuensi:** validasi kontras CI (`NFR-AC-01/02`) punya satu sasaran; mode gelap dinyatakan **di luar lingkup rilis ini**, bukan tertunda |

## 12.3 Keputusan yang masih terbuka

| ID | Pertanyaan | Dampak UX | Tercatat di |
|---|---|---|---|
| **UXD-09** | **Bagaimana `fallback_approver` disajikan pada editor aturan (P-69)?** `RE-11` mewajibkan setiap aturan menetapkannya, tetapi skema Lampiran D.5 tidak memuat field tersebut | Satu field pada P-69 tidak dapat dispesifikasikan | `TBD-APR-A` (kelompok A) |
| **UXD-10** | **Apakah notifikasi terarsip (lebih dari 90 hari) dapat diakses pengguna lewat filter arsip?** `FR-17.1 A2` menyebut arsip otomatis dan filter arsip, tetapi cakupan aksesnya belum ditetapkan | Ada atau tidaknya filter "Arsip" pada P-13 | `TBD-NTF-B` (kelompok A) |
| **UXD-13** | **Apakah dead letter memerlukan antarmuka pemrosesan ulang di menu Administrator?** | Ada atau tidaknya satu halaman baru pada grup Sistem (lingkup M-20) | `TBD-EVT-B` (kelompok A) |
| **UXD-14** | **Perlakuan foto berwajah saat permintaan penghapusan data.** Pseudonimisasi identitas tidak menghapus wajah pada foto bukti serah terima dan kerusakan | Apakah galeri foto pada P-18, P-34, P-41 memerlukan keadaan "foto dikaburkan" | `TBD-FS-A` (kelompok A) |
| **UXD-15** | **Apakah endpoint reservasi tetap satu `/reservations` atau dipecah menjadi `/room-reservations` + `/item-reservations`?** | Tidak mengubah tata letak, tetapi mengubah struktur route klien dan bentuk deep link | `TBD-AVL-B` (kelompok A) |

## 12.4 Konflik & ambiguitas yang ditemukan

Empat temuan, seluruhnya tertutup. Dua diselesaikan mengikuti aturan prioritas yang sudah ada; satu diputuskan pemilik produk; satu ternyata sudah ditutup PRD.

| # | Temuan | Status | Penyelesaian |
|---|---|---|---|
| **K-01** | **Wewenang pembebasan Ganti Rugi.** `BR-028e` (m09) vs Lampiran C `fine.waive` — lihat **UXD-08** | ✅ Diselesaikan pemilik produk | `PM-06` memang tidak menjangkau pertentangan **business rule vs katalog permission**, sehingga temuan ini dinaikkan dan diputuskan: **katalog yang menyesuaikan business rule**, bukan sebaliknya. Lampiran C mendapat `fine.waive_compensation` milik Pimpinan saja; `fine.waive` dipersempit menjadi jenis `Keterlambatan`; `BR-031` dan `BR-028e` disunting agar tidak lagi saling menutupi |
| **K-02** | **Permission pembatalan reservasi.** Tabel endpoint `m07` bagian 7 mencantumkan `POST /reservations/{id}/cancel` dengan permission `reservation.cancel`, sementara Lampiran C hanya memiliki `reservation.cancel_own` dan `reservation.cancel_any` | ✅ Diselesaikan | `PM-06` mengikat: **Lampiran C yang berlaku**. UX-SPEC memakai `reservation.cancel_own` / `reservation.cancel_any` (§5.3, §7.2). Perbaikan tabel endpoint `m07` diserahkan kepada pemilik berkas modul |
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
