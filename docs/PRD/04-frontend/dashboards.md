# 19. Dashboard Requirements

## 19.1 Ketentuan Umum Dashboard

| Aspek | Ketentuan |
|---|---|
| **Personalisasi** | Isi dashboard ditentukan oleh role pengguna; kartu di luar hak akses tidak dirender |
| **Rentang waktu** | Pemilih rentang: 7 hari, 30 hari, semester berjalan, tahun ajaran |
| **Drill-down** | Setiap kartu KPI dapat diklik menuju daftar detail yang menjadi sumbernya |
| **Pemuatan** | ≤ 3 detik; setiap kartu memuat mandiri dengan *skeleton loading* |
| **Pembaruan data** | Data agregat di-*cache* dengan TTL 5 menit; tombol muat ulang manual tersedia |
| **Responsif** | Tata letak menyesuaikan desktop (grid 3–4 kolom), tablet (2 kolom), dan ponsel (1 kolom) |
| **Subgrup kartu** | Kartu yang berasal dari satu modul dan mengisi zona yang sama boleh dikelompokkan menjadi subgrup berlabel. Subgrup adalah satuan tata letak **di dalam** zona, bukan zona tersendiri; tidak ada kartu yang disembunyikan atau dilipat karenanya. Pada tata letak satu kolom, label subgrup tetap dirender sebagai pemisah |
| **Status kosong** | Bila belum ada data, kartu menampilkan pesan dan tautan aksi yang relevan |

## 19.2 Dashboard Administrator

| Komponen | Jenis | Isi |
|---|---|---|
| Total Pengguna Aktif | Kartu KPI | Jumlah akun aktif, dipecah per role |
| Login Hari Ini | Kartu KPI | Jumlah login sukses & gagal 24 jam terakhir |
| Permintaan Reset Password | Kartu aksi | Daftar permintaan menunggu tindakan Administrator |
| Aktivitas Sistem | Grafik garis | Jumlah aktivitas per hari selama 30 hari |
| Aktivitas Terbaru | Tabel | 10 entri activity log terakhir |
| Distribusi Role | Grafik donat | Komposisi pengguna per role |
| Status Konfigurasi | Kartu status | Ringkasan approval rules aktif, parameter yang belum diisi |
| Kesehatan Integrasi | Kartu status | Status layanan LLM dan FCM (tersedia/gangguan) |

## 19.3 Dashboard Petugas Sarana Prasarana

| Komponen | Jenis | Isi |
|---|---|---|
| Total Aset | Kartu KPI | Jumlah unit aset aktif |
| Komposisi Kondisi Aset | Grafik donat | Baik / Rusak Ringan / Rusak Berat / Hilang |
| Status Aset | Grafik batang | Tersedia / Direservasi / Dipinjam / Dalam Perbaikan / Tidak Tersedia |
| Pengajuan Menunggu Persetujuan | Kartu aksi | Jumlah + daftar 5 teratas, tautan ke halaman persetujuan |
| Serah Terima Hari Ini | Kartu aksi | Daftar reservasi yang dijadwalkan diserahkan hari ini |
| Pengembalian Jatuh Tempo Hari Ini | Kartu aksi | Daftar peminjaman jatuh tempo hari ini |
| Peminjaman Terlambat | Kartu peringatan | Jumlah + daftar peminjam dan lama keterlambatan |
| Laporan Kerusakan Baru | Kartu aksi | Tiket berstatus `Dilaporkan` yang belum diverifikasi |
| Work Order Aktif | Kartu KPI | Jumlah per status (Ditugaskan/Dikerjakan/Tertunda/Menunggu Verifikasi) |
| Aset Belum Berlabel QR | Kartu peringatan | Jumlah + tautan cetak label |
| Garansi Akan Berakhir | Kartu peringatan | Aset dengan garansi berakhir ≤ 30 hari |
| Jadwal Pemeliharaan Mendatang | Daftar | Pemeliharaan preventif jatuh tempo ≤ 14 hari |
| Tren Peminjaman | Grafik garis | Jumlah transaksi peminjaman per minggu |
| Stok Bahan Menipis | Kartu peringatan | Bahan dengan saldo mencapai/di bawah stok minimum + tautan ke usulan pengadaan (`FR-22.7`) |
| Permintaan Bahan Menunggu | Kartu aksi | Permintaan berstatus `Disetujui` yang belum diserahkan (`FR-22.5`) |

## 19.4 Dashboard Pimpinan Sekolah

| Komponen | Jenis | Isi |
|---|---|---|
| Ringkasan Aset | Kartu KPI | Total unit aset dan total nilai perolehan |
| Kondisi Aset | Grafik donat | Komposisi kondisi seluruh aset |
| Menunggu Persetujuan Saya | Kartu aksi | Daftar pengajuan yang memerlukan keputusan Pimpinan |
| Utilisasi Ruangan | Grafik batang | Persentase pemanfaatan per ruangan pada periode terpilih |
| Tren Kerusakan | Grafik garis | Jumlah laporan kerusakan per bulan |
| Biaya Pemeliharaan | Grafik batang | Total biaya per bulan dan per kategori aset |
| Aset Bermasalah | Tabel | 10 aset dengan frekuensi kerusakan atau biaya perbaikan tertinggi |
| Status Pengadaan | Kartu KPI | Jumlah usulan per status dan total nilai yang disetujui |
| Ringkasan Stock Opname | Kartu status | Hasil sesi opname terakhir: sesuai, selisih, hilang |
| Tingkat Kepatuhan Pengembalian | Kartu KPI | Persentase pengembalian tepat waktu |
| Laporan Kerusakan Kritis | Kartu peringatan | Tiket berurgensi `Kritis` yang masih terbuka |

## 19.5 Dashboard Teknisi

| Komponen | Jenis | Isi |
|---|---|---|
| Work Order Saya | Kartu KPI | Jumlah per status yang ditugaskan kepada saya |
| Pekerjaan Hari Ini | Daftar berprioritas | Work order dengan target selesai hari ini atau terlambat |
| Work Order Mendesak | Kartu peringatan | Pekerjaan berprioritas `Mendesak`/`Tinggi` |
| Pekerjaan Tertunda | Daftar | Work order berstatus `Tertunda` beserta alasannya |
| Riwayat Penyelesaian | Grafik garis | Jumlah work order diselesaikan per minggu |
| Rata-rata Durasi Perbaikan | Kartu KPI | Rata-rata waktu dari mulai hingga selesai |
| Scan Cepat | Tombol aksi | Pintasan memindai QR untuk membuka work order aset |

## 19.6 Dashboard Guru & Staf/TU

| Komponen | Jenis | Isi |
|---|---|---|
| Pengajuan Saya | Kartu KPI | Jumlah pengajuan per status (menunggu/disetujui/ditolak) |
| Peminjaman Aktif | Daftar | Aset yang sedang saya pinjam beserta tanggal jatuh tempo |
| Jatuh Tempo Mendekat | Kartu peringatan | Peminjaman jatuh tempo ≤ 3 hari |
| Denda Saya | Kartu peringatan | Total denda belum dibayar |
| Jadwal Reservasi Saya | Kalender ringkas | Reservasi ruangan/aset mendatang |
| Ketersediaan Ruangan Hari Ini | Ringkasan | Ruangan yang masih kosong hari ini |
| Laporan Kerusakan Saya | Daftar | Tiket yang saya buat beserta statusnya |
| Aksi Cepat | Tombol | Ajukan Reservasi · Lapor Kerusakan · Scan QR · Tanya Chatbot |

## 19.7 Dashboard Siswa/OSIS

| Komponen | Jenis | Isi |
|---|---|---|
| Pengajuan Saya | Kartu KPI | Jumlah pengajuan per status |
| Peminjaman Aktif | Daftar | Aset yang sedang dipinjam beserta jatuh tempo |
| Jatuh Tempo Mendekat | Kartu peringatan | Pengingat pengembalian |
| Denda Saya | Kartu peringatan | Total denda belum dibayar dan status blokir |
| Ruangan Tersedia | Ringkasan | Ruangan yang boleh direservasi siswa dan sedang kosong |
| Aksi Cepat | Tombol | Ajukan Reservasi · Lapor Kerusakan · Tanya Chatbot |

---
