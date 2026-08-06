# 23. Assumptions

Asumsi berikut digunakan dalam penyusunan PRD ini. Setiap asumsi perlu divalidasi sebelum atau selama pengembangan; perubahan atasnya dapat memengaruhi ruang lingkup.

## 23.1 Asumsi Bisnis & Organisasi

| Kode | Asumsi |
|---|---|
| AS-01 | Sistem digunakan oleh **satu sekolah** dan tidak akan diperluas menjadi multi-sekolah dalam rilis ini. |
| AS-02 | Sekolah memiliki minimal satu petugas sarana prasarana yang bertanggung jawab penuh atas pengelolaan data inventaris. |
| AS-03 | Sekolah memiliki minimal satu teknisi internal untuk mengeksekusi work order; tidak ada pekerjaan yang ditugaskan ke vendor melalui sistem. |
| AS-04 | Kebijakan denda keterlambatan sudah disepakati manajemen sekolah dan sah untuk diberlakukan kepada guru, staf, maupun siswa. |
| AS-05 | Pembayaran denda dilakukan secara luring; sistem hanya mencatat statusnya. |
| AS-06 | Kebijakan persetujuan berjenjang telah ditetapkan sekolah dan akan dikonfigurasi Administrator melalui approval rules. |
| AS-07 | Sekolah bersedia melakukan pendataan awal seluruh aset dan penempelan label QR sebagai bagian dari implementasi. |
| AS-08 | Siswa/OSIS diberi akun oleh Administrator sesuai kebutuhan, bukan seluruh siswa sekolah. |
| AS-09 | Kepala Sekolah dan Wakasek Sarpras bersedia menggunakan sistem untuk memberikan persetujuan digital. |
| AS-10 | Sekolah menetapkan jam operasional dan hari kerja yang menjadi dasar validasi reservasi. |

## 23.2 Asumsi Teknis

| Kode | Asumsi |
|---|---|
| AS-11 | Sekolah memiliki koneksi internet yang memadai, karena aplikasi mobile bekerja **online only**. |
| AS-12 | Pengguna memiliki ponsel Android 8.0+ atau iOS 14+ dengan kamera yang berfungsi untuk memindai QR. |
| AS-13 | Sekolah memiliki printer untuk mencetak label QR pada kertas stiker. |
| AS-14 | ~~Sistem di-*hosting* pada server/VPS yang dikelola sekolah atau penyedia layanan.~~ → **Ditetapkan pada audit: VPS terkelola dengan container** (INF-05), reverse proxy + TLS otomatis (INF-06), object storage S3-compatible terpisah (INF-02). Rincian pada Bab 27. |
| AS-15 | Tersedia akun Firebase untuk push notification dan akun Claude API untuk chatbot, beserta anggaran penggunaannya. |
| AS-15a | Sekolah memiliki dan menganggarkan **akun Google Play Developer** serta **Apple Developer Program** (berbayar, perpanjangan tahunan) atas nama sekolah sendiri (MOB-REL-01, MOB-REL-02). |
| AS-15b | Sekolah menyediakan **domain sendiri dengan HTTPS** untuk API, halaman publik QR, dan verifikasi App/Universal Links (MOB-DL-01). |
| AS-16 | ~~Basis data relasional (PostgreSQL atau MySQL); keputusan diserahkan kepada Architect.~~ → **Ditetapkan pada audit sebagai keputusan, bukan asumsi: PostgreSQL 15+** (INF-01). PRD ini mensyaratkan `tstzrange` + *exclusion constraint*, *partial unique index*, kolom JSON terindeks, dan partisi tabel — kombinasi yang tidak dapat dipenuhi MySQL. |
| AS-17 | Pencadangan basis data otomatis dapat dijalankan pada infrastruktur yang dipilih. |
| AS-18 | Zona waktu tunggal WIB (UTC+7) berlaku untuk seluruh pengguna. |

## 23.3 Asumsi Data

| Kode | Asumsi |
|---|---|
| AS-19 | Data aset awal tersedia dalam bentuk yang dapat diimpor (spreadsheet), atau akan diinput manual pada tahap implementasi. |
| AS-20 | Data pengguna (guru, staf, siswa terpilih) tersedia dan dapat diimpor oleh Administrator. |
| AS-21 | Struktur gedung dan ruangan sekolah sudah jelas dan dapat dipetakan ke hierarki tiga tingkat. |
| AS-22 | Format kode barang internal akan ditetapkan sekolah sebelum pendataan aset dimulai. |
| AS-23 | Nilai perolehan aset diketahui atau dapat diperkirakan; ketiadaannya tidak menghalangi pendaftaran aset. |
| AS-24 | Barang habis pakai (ATK, bahan praktikum) **tidak** dikelola dalam sistem ini. |

## 23.4 Asumsi Proyek

| Kode | Asumsi |
|---|---|
| AS-25 | Seluruh modul dikembangkan dan dirilis sekaligus (**big bang**), tanpa pembagian fase. |
| AS-26 | Tersedia lingkungan development, staging, dan production yang terpisah. |
| AS-27 | Pelatihan pengguna dilakukan sebelum sistem dioperasikan, khususnya bagi Petugas Sarpras dan Teknisi. |
| AS-28 | Terdapat masa pendampingan pasca-implementasi untuk penyesuaian konfigurasi dan perbaikan. |
| AS-29 | PRD ini menjadi acuan tunggal; perubahan lingkup dikelola melalui proses *change request* tertulis. |

---


---

# 24. Risks

| Kode | Risiko | Kategori | Dampak | Kemungkinan | Mitigasi |
|---|---|---|---|---|---|
| RS-01 | Pendataan awal 5.000 unit aset memakan waktu jauh lebih lama dari perkiraan | Implementasi | Tinggi | Tinggi | Sediakan impor massal via CSV/XLSX, pembuatan N unit sekaligus dari satu form, dan pencetakan QR batch; lakukan pendataan bertahap per gedung |
| RS-02 | Label QR rusak, terlepas, atau pudar seiring waktu | Operasional | Sedang | Tinggi | Gunakan stiker berbahan tahan lama; sediakan cetak ulang tanpa mengubah UUID; sediakan input kode barang manual di setiap alur pemindaian |
| RS-03 | Resistensi pengguna terhadap perubahan dari cara manual | Adopsi | Tinggi | Sedang | Pelatihan per role, antarmuka sederhana, aksi cepat pada dashboard, dukungan chatbot untuk pertanyaan dasar, dan dukungan aktif pimpinan sekolah |
| RS-04 | Data inventaris tidak dipelihara sehingga sistem menjadi tidak akurat | Operasional | Tinggi | Sedang | Stock opname periodik wajib, laporan aset belum berlabel QR, dashboard indikator kualitas data, dan penetapan penanggung jawab data |
| RS-05 | Approval berjenjang memperlambat proses jika approver tidak responsif | Proses | Sedang | Tinggi | SLA per langkah, pengingat otomatis, eskalasi otomatis, delegasi saat approver berhalangan, dan persetujuan dari perangkat mobile |
| RS-06 | Konfigurasi approval rules yang salah menyebabkan pengajuan macet | Konfigurasi | Tinggi | Sedang | Fitur pratinjau aturan sebelum disimpan, aturan bawaan sebagai jaring pengaman, dan pelatihan khusus Administrator |
| RS-07 | Koneksi internet sekolah terputus sehingga aplikasi mobile tidak dapat digunakan | Teknis | Tinggi | Sedang | Disepakati mode *online only*; mitigasi berupa alur manual sementara dan pencatatan susulan; peningkatan kualitas jaringan menjadi prasyarat implementasi |
| RS-08 | Biaya penggunaan Claude API membengkak melebihi anggaran | Biaya | Sedang | Sedang | Batas percakapan harian per pengguna, konteks dibatasi 10 pesan, pemantauan penggunaan token pada dashboard Administrator, dan pengalih untuk menonaktifkan chatbot |
| RS-09 | Chatbot memberikan jawaban keliru yang dijadikan dasar keputusan | Kualitas AI | Sedang | Sedang | Kewajiban merujuk pengenal data konkret, larangan mengarang, umpan balik pengguna, evaluasi berkala, dan penegasan bahwa keputusan resmi merujuk laporan sistem |
| RS-10 | Kebocoran data lintas hak akses melalui chatbot | Keamanan | Tinggi | Rendah | Filter permission ditegakkan pada lapisan query, bukan pada prompt; pengujian keamanan khusus untuk setiap role sebelum rilis |
| RS-11 | *Race condition* menyebabkan double-booking ruangan atau unit barang | Teknis | Tinggi | Sedang | Penguncian tingkat baris, validasi bentrok dalam transaksi, *unique constraint* pada level basis data, dan pengujian konkurensi |
| RS-12 | Kebocoran data pribadi siswa dan pegawai | Keamanan | Tinggi | Rendah | RBAC ketat, HTTPS, enkripsi kredensial, 2FA untuk role sensitif, activity log, dan pembatasan data pada halaman publik hasil scan |
| RS-13 | Kehilangan data akibat kegagalan server atau kesalahan operasional | Teknis | Tinggi | Rendah | Pencadangan harian dengan retensi 30 hari di lokasi terpisah, uji pemulihan berkala, dan penerapan *soft delete* pada entitas penting |
| RS-14 | Performa menurun seiring pertumbuhan activity log dan notifikasi | Teknis | Sedang | Sedang | Indeks yang tepat, paginasi wajib, arsip otomatis notifikasi & percakapan > 90 hari, serta pemantauan kinerja query |
| RS-15 | Pengguna Siswa/OSIS menyalahgunakan fitur pengajuan | Operasional | Rendah | Sedang | Pembatasan katalog dan ruangan untuk siswa, durasi peminjaman lebih pendek, persetujuan wajib, dan mekanisme blokir akibat kewajiban tertunggak |
| RS-16 | Denda menimbulkan keberatan atau konflik dengan pengguna | Kebijakan | Sedang | Sedang | Sosialisasi kebijakan sebelum rilis, transparansi perhitungan pada halaman denda, dan mekanisme pembebasan denda oleh pejabat berwenang |
| RS-17 | Rilis *big bang* seluruh modul meningkatkan risiko cacat produksi | Proyek | Tinggi | Sedang | Pengujian menyeluruh (unit, integrasi, UAT), *staging* yang menyerupai produksi, uji beban sebelum rilis, dan rencana *rollback* |
| RS-18 | Teknisi tidak disiplin memperbarui status work order di lapangan | Operasional | Sedang | Sedang | Alur mobile yang ringkas, pintasan scan QR menuju work order, notifikasi pengingat target selesai, dan pemantauan kinerja pada dashboard |
| RS-19 | Ketergantungan pada satu Administrator tunggal | Organisasi | Sedang | Sedang | Minimal dua akun Administrator, dokumentasi konfigurasi, dan pelatihan cadangan |
| RS-20 | Push notification tidak diterima karena izin ditolak atau token kedaluwarsa | Teknis | Rendah | Tinggi | Notifikasi in-app selalu tersedia sebagai jalur utama, ajakan mengaktifkan izin, pembersihan token tidak valid, dan mekanisme percobaan ulang |

---
