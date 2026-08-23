# 31. UI/UX Foundation

> PRD ini ditujukan antara lain kepada UI/UX Designer, namun sebelumnya tidak menetapkan satupun fondasi desain. Tanpa bab ini, 22 modul akan dibangun dengan gaya yang berbeda-beda dan biaya penyelarasan visual akan menumpuk di akhir proyek.

## 31.1 Prinsip Desain

| Kode | Prinsip | Alasan |
|---|---|---|
| UX-01 | **Mobile-first untuk alur lapangan, desktop-first untuk alur administratif** | Teknisi dan petugas opname bekerja dari ponsel; petugas sarpras dan admin bekerja dari meja |
| UX-02 | **Scan QR sebagai jalan pintas utama**, dengan input kode aset manual selalu tersedia | Literasi digital pengguna beragam; QR bisa rusak (RS-02) |
| UX-03 | **Status selalu disertai teks dan ikon**, tidak pernah hanya warna | NFR-AC-06 dan keterbacaan di layar terang saat di lapangan |
| UX-04 | **Aksi destruktif selalu memerlukan konfirmasi dan alasan** | Sejalan dengan kewajiban audit (BR-025, BR-031) |
| UX-05 | **Tidak ada jalan buntu**: setiap status kosong, galat, dan penolakan menyertakan langkah berikutnya | Pengguna non-teknis (Persona 3, 6) |
| UX-06 | **Bahasa Indonesia baku, bukan istilah teknis** | NFR-AC-09; hindari "instance", "token", "payload" pada antarmuka |

## 31.2 Design Token

| Kelompok | Ketentuan |
|---|---|
| Warna | Satu palet utama, satu aksen, dan enam warna status (netral, info, sukses, peringatan, bahaya, nonaktif). Setiap pasangan teks/latar wajib memenuhi kontras ≥ 4,5:1 (NFR-AC-02) |
| Tipografi | Satu keluarga font sans-serif dengan dukungan penuh karakter Latin; skala 6 tingkat; ukuran badan teks minimum 16 px pada web dan 14 sp pada mobile |
| Spasi | Skala kelipatan 4 px |
| Radius & elevasi | Maksimum 3 tingkat masing-masing, untuk menjaga konsistensi |
| Ikon | Satu set ikon tunggal; ikon fungsional selalu berpasangan dengan label teks |

## 31.3 Komponen Inti Wajib

Dibangun satu kali dan dipakai ulang di seluruh modul:

| Komponen | Catatan penting |
|---|---|
| Tabel data | Paginasi server, pengurutan, filter gabungan, pemilihan massal, ekspor. Filter tercermin di URL (FR-04.2) |
| Panel filter | Konsisten di seluruh modul; menampilkan filter aktif sebagai *chip* yang dapat dihapus |
| Formulir | Label eksplisit, validasi inline, pesan galat di bawah field, pencegahan pengiriman ganda |
| Kartu KPI | Nilai, label, tren, dan tautan drill-down (19.1) |
| Kalender ketersediaan | Lihat 31.4 |
| Pemindai QR | Tampilan kamera, panduan bidik, tombol "Masukkan kode manual" yang selalu terlihat |
| Pengunggah foto | Pratinjau, kompresi otomatis, indikator progres, penanganan gagal + coba lagi |
| Linimasa approval | Langkah, pelaku, waktu, catatan, penanda dilewati/eskalasi/delegasi (FR-10.3) |
| Lencana status | Teks + ikon + warna; satu komponen untuk seluruh enum pada Bab 11.3 |
| Dialog konfirmasi | Varian standar dan varian destruktif yang mewajibkan pengisian alasan |
| Pusat notifikasi | Daftar, penghitung belum dibaca, filter, tandai terbaca |

## 31.4 Spesifikasi Kalender Ketersediaan


Komponen paling kompleks pada sistem ini; sebelumnya hanya dijelaskan satu paragraf.

| Kode | Requirement |
|---|---|
| CAL-UI-01 | Tampilan: **Harian** (ruangan sebagai baris, jam sebagai kolom), **Mingguan** (hari sebagai kolom), dan **Bulanan** (ringkasan kepadatan per hari) |
| CAL-UI-02 | Granularitas slot **30 menit**, dapat dikonfigurasi Administrator |
| CAL-UI-03 | Interaksi memesan: klik slot kosong pada desktop; ketuk-dan-geser pada mobile. *Drag-select* lintas beberapa slot berdekatan didukung pada desktop |
| CAL-UI-04 | Baris ruangan divirtualisasi; hanya baris terlihat yang dirender, agar target ≤ 2 detik untuk 30 ruangan × 1 bulan tercapai (FR-07.1) |
| CAL-UI-05 | Lima keadaan slot dibedakan secara visual **dan** tekstual: Kosong · Menunggu Persetujuan · Disetujui · Jadwal Tetap (dengan label) · Dalam Pemeliharaan / Libur |
| CAL-UI-06 | Untuk role Siswa/OSIS, slot terisi hanya menampilkan "Terpakai" tanpa identitas pemohon (FR-07.1 A1) |
| CAL-UI-07 | Pada layar < 768 px, kalender beralih ke tampilan daftar per hari; matriks ruangan × jam tidak dipaksakan pada layar kecil |
| CAL-UI-08 | Navigasi papan ketik penuh: panah untuk berpindah slot, Enter untuk memilih (NFR-AC-03) |
| CAL-UI-09 | Zona waktu selalu ditampilkan sebagai WIB, tanpa mengandalkan zona waktu perangkat |

## 31.5 Pola Keadaan Global

Setiap layar wajib menangani lima keadaan berikut secara konsisten:

| Keadaan | Ketentuan |
|---|---|
| Memuat | *Skeleton* menyerupai bentuk konten; bukan spinner layar penuh (19.1 A2) |
| Kosong | Ilustrasi/ikon, penjelasan singkat, dan **tombol aksi berikutnya** (mis. "Tambah Aset ke Lokasi Ini") |
| Galat | Pesan yang dapat dimengerti pengguna, tanpa detail teknis (NFR-R-10), tombol "Coba lagi", dan kode `request_id` yang dapat disalin untuk pelaporan |
| Tanpa hak akses | Menjelaskan bahwa akses dibatasi dan menyarankan menghubungi Administrator; **tidak** mengonfirmasi keberadaan data (17.5 poin 3) |
| Luring / koneksi putus | Banner persisten; tindakan yang memerlukan koneksi dinonaktifkan dengan penjelasan (NO-07) |

## 31.6 Bukti Serah Terima Digital

Menyelesaikan kontradiksi antara FR-09.1 langkah 5 ("tanda tangan pada layar") dan FE-10 yang menempatkan "tanda tangan digital" sebagai pengembangan berikutnya.

| Aspek | Ketetapan |
|---|---|
| **Dalam lingkup rilis ini** | **Bukti serah terima digital**: tanda tangan coretan pada kanvas (disimpan sebagai PNG), **atau** konfirmasi dari akun peminjam sendiri melalui aplikasinya. Keduanya disertai foto kondisi, waktu, dan identitas petugas |
| **Di luar lingkup (tetap FE-10)** | Tanda tangan elektronik tersertifikasi yang memiliki kekuatan hukum penuh dan sertifikat digital dari penyelenggara resmi |
| Ketentuan | Kanvas minimum 300×150 px, tersimpan bersama metadata (waktu, perangkat, IP). Bila peminjam tidak hadir, berlaku FR-09.1 A2 dan tanggung jawab tetap pada pemohon (BR-033) |

## 31.7 Deliverable Desain

| Kode | Deliverable | Tenggat |
|---|---|---|
| DS-01 | Design token & panduan gaya | Sebelum M1 |
| DS-02 | Pustaka komponen inti (31.3) dalam perkakas desain dan kode | M1 |
| DS-03 | Wireframe seluruh layar utama per modul | Sebelum modul terkait dikerjakan |
| DS-04 | Prototipe alur kritis (reservasi, serah terima, opname, work order) | Sebelum M2 |
| DS-05 | Spesifikasi responsif untuk empat titik henti (30.6) | M1 |
| DS-06 | Daftar periksa aksesibilitas per komponen | M1 |

---
