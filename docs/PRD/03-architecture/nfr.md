# 9. Non Functional Requirements

Seluruh target di bawah ini ditetapkan berdasarkan skala terkonfirmasi: **± 5.000 unit aset, hingga 1.000 pengguna terdaftar, 100–150 concurrent user pada jam sibuk**.

## 9.1 Performance

| Kode | Requirement | Target | Cara Verifikasi |
|---|---|---|---|
| NFR-P-01 | Waktu respons API baca | p95 ≤ 500 ms; p99 ≤ 1 detik | Load test dengan k6/JMeter |
| NFR-P-02 | Waktu respons API tulis | p95 ≤ 800 ms | Load test |
| NFR-P-03 | Pemuatan halaman web (LCP) | ≤ 2,5 detik pada jaringan 4G | Lighthouse / Web Vitals |
| NFR-P-04 | Pemuatan dashboard | ≤ 3 detik termasuk seluruh kartu | Pengujian manual + APM |
| NFR-P-05 | Pencarian aset (5.000 record) | ≤ 2 detik | Pengujian fungsional |
| NFR-P-06 | Scan QR → detail aset tampil | ≤ 3 detik | Pengujian perangkat nyata |
| NFR-P-07 | Generate PDF label QR (200 label) | ≤ 30 detik | Pengujian fungsional |
| NFR-P-08 | Laporan analitik rentang 1 tahun | ≤ 5 detik; > 5 detik diproses asinkron | Pengujian fungsional |
| NFR-P-09 | Concurrent user | 150 pengguna aktif bersamaan tanpa degradasi > 20% | Load test |
| NFR-P-10 | Cold start aplikasi mobile | ≤ 3 detik pada perangkat kelas menengah sebagaimana didefinisikan pada Bab 30.6 (Android 12+, RAM 4 GB, terbit ≤ 3 tahun terakhir) | Pengujian perangkat nyata |
| NFR-P-11 | Impor massal 500 baris aset | ≤ 60 detik | Pengujian fungsional |
| NFR-P-12 | Pengiriman notifikasi | ≤ 60 detik setelah event | Pengujian end-to-end |

**Strategi pendukung:** indeks basis data pada kolom pencarian utama (kode barang, nomor seri, lokasi, status), paginasi wajib pada seluruh endpoint daftar (maksimum 100 item per halaman), caching hasil agregasi dashboard (TTL 5 menit), *lazy loading* gambar, dan kompresi respons (gzip/brotli).

## 9.3 Availability

| Kode | Requirement | Target |
|---|---|---|
| NFR-A-01 | Ketersediaan pada jam operasional sekolah (Senin–Sabtu, 06.00–18.00 WIB) | ≥ 99,5% |
| NFR-A-02 | Ketersediaan di luar jam operasional | ≥ 99,0% |
| NFR-A-03 | Jendela pemeliharaan terencana | Di luar jam operasional, diumumkan minimal H-2 |
| NFR-A-04 | Maksimum downtime terencana per bulan | 4 jam |
| NFR-A-05 | Ketergantungan layanan LLM | Gangguan chatbot **tidak boleh** memengaruhi ketersediaan modul lain (*graceful degradation*) |
| NFR-A-06 | Ketergantungan FCM | Kegagalan push notification tidak boleh menggagalkan transaksi bisnis |
| NFR-A-07 | Health check endpoint | Tersedia untuk pemantauan otomatis |

## 9.4 Reliability

| Kode | Requirement |
|---|---|
| NFR-R-01 | RPO (Recovery Point Objective) ≤ 24 jam; pencadangan basis data otomatis harian |
| NFR-R-02 | RTO (Recovery Time Objective) ≤ 4 jam |
| NFR-R-03 | Pencadangan disimpan minimal 30 hari, dengan salinan di lokasi terpisah |
| NFR-R-04 | Uji pemulihan pencadangan dilakukan minimal setiap 6 bulan |
| NFR-R-05 | Seluruh operasi multi-tabel dijalankan dalam transaksi basis data yang atomik |
| NFR-R-06 | Operasi kritis (alokasi unit, serah terima, persetujuan) bersifat idempoten terhadap permintaan ganda |
| NFR-R-07 | Alokasi unit dan validasi bentrok jadwal memakai penguncian tingkat baris untuk mencegah *race condition* |
| NFR-R-08 | Pekerjaan terjadwal (reminder, status terlambat, work order preventif) memiliki mekanisme percobaan ulang dan pencatatan kegagalan |
| NFR-R-09 | Tingkat kesalahan API (5xx) ≤ 0,1% dari total permintaan |
| NFR-R-10 | Pesan galat kepada pengguna bersifat informatif dan tidak membocorkan detail teknis internal |

## 9.5 Scalability

| Kode | Requirement |
|---|---|
| NFR-SC-01 | Arsitektur mendukung penskalaan horizontal pada lapisan aplikasi (API *stateless*) |
| NFR-SC-02 | Sistem tetap memenuhi target performa hingga 15.000 unit aset dan 3.000 pengguna tanpa perubahan arsitektur |
| NFR-SC-03 | Basis data dirancang dengan indeks dan partisi yang memadai untuk tabel bervolume tinggi (activity log, notifikasi, chat) |
| NFR-SC-04 | Berkas disimpan pada penyimpanan objek terpisah dari server aplikasi |
| NFR-SC-05 | Pekerjaan berat (ekspor besar, pembuatan PDF massal, laporan panjang) dijalankan melalui antrean asinkron |
| NFR-SC-06 | Activity log dan notifikasi memiliki kebijakan arsip/purge agar tabel utama tetap ramping |

## 9.6 Accessibility

| Kode | Requirement |
|---|---|
| NFR-AC-01 | Antarmuka web memenuhi WCAG 2.1 level AA |
| NFR-AC-02 | Rasio kontras teks minimal 4,5:1 untuk teks normal dan 3:1 untuk teks besar |
| NFR-AC-03 | Seluruh fungsi utama dapat dioperasikan melalui papan ketik, dengan indikator fokus yang jelas |
| NFR-AC-04 | Seluruh gambar, ikon fungsional, dan tombol memiliki teks alternatif/label yang bermakna |
| NFR-AC-05 | Formulir memiliki label eksplisit dan pesan galat yang dapat dibaca pembaca layar |
| NFR-AC-06 | Informasi tidak disampaikan hanya melalui warna (status selalu disertai teks atau ikon) |
| NFR-AC-07 | Target sentuh pada aplikasi mobile minimal 44×44 dp |
| NFR-AC-08 | Antarmuka mendukung perbesaran teks hingga 200% tanpa kehilangan fungsi |
| NFR-AC-09 | Seluruh label, pesan, dan konten menggunakan Bahasa Indonesia yang baku dan mudah dipahami |

## 9.7 Maintainability

| Kode | Requirement |
|---|---|
| NFR-M-01 | Kode mengikuti panduan gaya yang disepakati dengan linter dan formatter otomatis |
| NFR-M-02 | Pemisahan lapisan yang jelas: route → controller → service → repository |
| NFR-M-03 | Cakupan unit test ≥ 70% untuk logika bisnis inti (approval engine, perhitungan denda, alokasi unit, validasi bentrok) |
| NFR-M-04 | Seluruh perubahan skema basis data dikelola melalui *migration* berversi |
| NFR-M-05 | Dokumentasi API tersedia dalam format OpenAPI 3.0 dan selalu tersinkron dengan implementasi |
| NFR-M-06 | Log aplikasi terstruktur (JSON) dengan tingkat keparahan dan *correlation id* per permintaan |
| NFR-M-07 | Konfigurasi lingkungan dipisahkan dari kode dan tidak pernah di-*hardcode* |
| NFR-M-08 | Aturan bisnis yang dapat berubah (denda, durasi, SLA, approval) dikelola sebagai konfigurasi, bukan kode |
| NFR-M-09 | Terdapat lingkungan terpisah: development, staging, dan production |
| NFR-M-10 | Dokumentasi teknis (arsitektur, ERD, panduan deployment) dipelihara bersama kode |

## 9.8 Compatibility

| Kode | Requirement |
|---|---|
| NFR-C-01 | Peramban web: Chrome, Edge, Firefox, dan Safari — dua versi mayor terakhir |
| NFR-C-02 | Web responsif pada lebar layar 320 px hingga 1920 px |
| NFR-C-03 | Aplikasi mobile: Android 8.0 (API 26) ke atas; iOS 14 ke atas |
| NFR-C-04 | Aplikasi mobile mendukung mode potret; mode lanskap didukung pada tampilan tabel dan kalender |
| NFR-C-05 | Scan QR berfungsi pada kamera perangkat Android dan iOS yang didukung, serta pada peramban web yang mendukung `getUserMedia` |
| NFR-C-06 | Ekspor XLSX kompatibel dengan Microsoft Excel 2016+, LibreOffice Calc, dan Google Sheets |
| NFR-C-07 | Ekspor PDF sesuai standar PDF 1.7 dan dapat dicetak pada kertas A4 |
| NFR-C-08 | Label QR dapat dicetak pada printer laser/inkjet umum tanpa perangkat khusus |
| NFR-C-09 | API bersifat *versioned* (`/api/v1`) sehingga aplikasi mobile versi lama tetap berfungsi selama masa dukungan |
| NFR-C-10 | Zona waktu sistem ditetapkan WIB (UTC+7); seluruh timestamp disimpan dalam UTC dan ditampilkan dalam waktu lokal |

---


> Persyaratan keamanan (Bab 9.2) berada di [`security.md`](security.md).
