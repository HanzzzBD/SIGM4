# Panduan Demonstrasi SIGM4

Tema: **dari kebutuhan praktik siswa sampai aset dipertanggungjawabkan**.
Durasi utama 25–30 menit; versi singkat 10 menit tersedia di bagian akhir.
Data fiktif ditandai `Demo`, kode aset `DEMO-`, kode master `DM-`, dan email `@demo.sigm4.test`.

## 1. Persiapan sebelum presentasi

1. Buka web lokal yang berjalan di `http://localhost:5173`. Pastikan API, PostgreSQL, Redis, MinIO, ClamAV, dan worker berjalan seperti lingkungan pengembangan yang biasa dipakai.
2. Data awal sudah dimasukkan ke database lokal `sigm4`. Untuk menyiapkan kembali pada lingkungan lokal yang sudah dimigrasikan, jalankan dari root proyek:

   ```powershell
   npm.cmd run demo:seed
   npm.cmd run demo:verify
   ```

3. Buka akun dan password lokal (`tmp/demo/AKUN-DEMO.md`). Password disimpan di `tmp/` yang diabaikan Git. Jangan tampilkan file akses ketika membagikan layar.
4. Login akun Administrator dan Pimpinan **sebelum** presentasi. Keduanya tetap wajib 2FA: gunakan kode aktivasi di file akses, pindai QR dengan authenticator, lalu konfirmasi OTP. Simpan kode cadangan yang diterbitkan aplikasi. Kode aktivasi seed berlaku 24 jam; seed ulang menerbitkan kode baru hanya bila kode lama kedaluwarsa dan 2FA belum aktif.
5. Pakai profil browser terpisah untuk Guru, Sarpras, Teknisi, dan Pimpinan. Tab dalam profil browser yang sama berbagi cookie sehingga tidak cocok untuk menampilkan beberapa akun sekaligus. Alternatifnya, logout lalu login ketika berganti peran.
6. Siapkan tautan objek demo (`tmp/demo/TAUTAN-DEMO.md`) dan label QR demo (`tmp/demo/berkas/LABEL-QR-DEMO.pdf`). Tautan memakai ID database yang benar dan dihasilkan ulang oleh skrip.
7. Untuk demonstrasi native, siapkan build aplikasi di perangkat dan koneksi ke API laptop melalui jaringan yang sama. `localhost` pada ponsel menunjuk ke ponsel itu sendiri. QR tercetak mengikuti `APP_BASE_URL` (`https://sigm4.localhost` pada lingkungan saat penyiapan); scanner internal mengambil domain resmi label dari backend dan membaca data melalui API, sehingga alamat label boleh berbeda dengan alamat web localhost. Kamera bawaan ponsel yang membuka URL langsung tetap memerlukan domain yang dapat dijangkau perangkat.
8. Siapkan Gemini bila ingin menampilkan jawaban langsung. Riwayat chatbot bawaan berlabel **contoh tersimpan**; jawaban langsung memerlukan penyedia AI yang aktif. Jangan menyebut contoh tersimpan sebagai keluaran model yang baru dijalankan.

Seed menambahkan data yang belum ada, mempertahankan data lama, dan tidak mereset aksi yang sudah dilakukan selama latihan. Tanggal transaksi baru dihitung relatif terhadap hari seed dalam WIB. Jika demo dilakukan jauh setelah penyiapan, buat reservasi baru sesuai tanggal presentasi; seed ulang tidak menggeser transaksi lama yang sudah dimainkan.

## 2. Akun yang dipakai

| Peran | Email | Dipakai untuk |
|---|---|---|
| Administrator | `admin@demo.sigm4.test` | Master pengguna/role, konfigurasi, activity log |
| Petugas Sarpras | `sarpras@demo.sigm4.test` | Inventaris, persetujuan reservasi/bahan, serah terima, verifikasi |
| Pimpinan | `pimpinan@demo.sigm4.test` | Persetujuan pengadaan/penghapusan dan ringkasan manajemen |
| Teknisi | `teknisi@demo.sigm4.test` | Tugas perbaikan dan progres pekerjaan |
| Guru | `guru@demo.sigm4.test` | Reservasi, peminjaman, permintaan bahan, pengadaan |
| Staf/TU | `staf@demo.sigm4.test` | Contoh peminjam terlambat dan kegiatan administrasi |
| Siswa/OSIS | `siswa@demo.sigm4.test` | Batas akses siswa, kegiatan OSIS, katalog yang diizinkan |

Password seluruh akun yang dibuat seed pertama tersedia di file akses lokal. Skrip ulang tidak mengganti password akun yang sudah ada.

## 3. Narasi pembuka — 30 detik

> “SIGM4 adalah sistem pengelolaan aset, sarana, dan prasarana sekolah. Biasanya data barang, peminjaman, kerusakan, serta stok bahan tersebar di beberapa catatan. Di sini saya akan menunjukkan satu kegiatan praktik sekolah: guru membutuhkan ruangan dan perangkat, petugas menyetujui serta menyerahkan, teknisi menangani kerusakan, lalu pimpinan melihat pertanggungjawabannya.”

Sampaikan bahwa data pada demo adalah data fiktif. Hindari menghabiskan waktu menjelaskan setiap menu sebelum menunjukkan satu alur yang selesai.

## 4. Alur utama — 25–30 menit

| Urutan | Waktu | Akun | Halaman dan tindakan | Hasil yang perlu ditunjukkan |
|---|---|---|---|---|
| 1 | 1 menit | Sarpras | Buka Beranda `/`. Jelaskan kartu, ringkasan, dan notifikasi. | Kondisi fasilitas dapat dipantau dari satu tempat. Angka dashboard mencakup seluruh data lokal, bukan hanya fixture demo. |
| 2 | 2 menit | Sarpras | Buka `/lokasi`, lalu `/aset`. Cari `Demo` atau kode `DEMO-`. Buka proyektor dari file tautan. | Gedung → area → ruangan, kategori, kondisi, lokasi, status pinjam, dan penanggung jawab saling terkait. |
| 3 | 1 menit | Sarpras | Di detail proyektor buka bagian foto dan Dokumen; unduh faktur/manual. Tunjukkan QR. | Satu identitas aset menghubungkan informasi fisik dan dokumen. Lampiran benar-benar tersedia di storage. |
| 4 | 2 menit | Guru | Buka `/kalender-ruangan`, lalu daftar `/reservasi`. Tunjukkan “Workshop Portofolio Siswa” yang sudah menunggu persetujuan. Bila waktu cukup, buat reservasi ruangan lain pada hari kerja mendatang. | Guru dapat melihat ketersediaan dan mengajukan kebutuhan. Gunakan permohonan yang sudah disiapkan agar demonstrasi tetap singkat. |
| 5 | 2 menit | Sarpras | Buka `/persetujuan`, pilih reservasi workshop, klik **Setujui**, dan konfirmasi. Kembali ke reservasi/kalender. | Status menjadi Disetujui dan slot tetap tercatat. Tunjukkan riwayat pemutus serta waktu keputusan. |
| 6 | 3 menit | Sarpras | Buka `/peminjaman/serah-terima`. Pilih “Proyektor Siap Serah Terima”, verifikasi kode unit dari detail aset, pilih kondisi awal, unggah `BUKTI-DEMO.png`, isi penerima, gambar tanda tangan, tinjau lalu kirim. | Reservasi menjadi peminjaman aktif; bukti serah terima dan jatuh tempo tercatat. Jika pengambilan sudah melewati batas hari, gunakan peminjaman aktif yang disiapkan atau buat reservasi baru. |
| 7 | 2 menit | Sarpras | Buka peminjaman aktif/terlambat dari file tautan. Tunjukkan jatuh tempo dan estimasi kewajiban; buka `/denda` untuk contoh denda yang sudah ditetapkan. | Status aktif, Terlambat, dan Dikembalikan memiliki konsekuensi berbeda. Estimasi keterlambatan bukan bukti denda sudah dibayar. |
| 8 | 2 menit | Sarpras → Teknisi | Buka laporan printer pada `/kerusakan`. Tunjukkan deskripsi, urgensi, foto, dan proses verifikasi. Lalu masuk sebagai Teknisi dan buka tugas “Periksa dan ganti kipas komputer praktik”. | Laporan, aset, dan pekerjaan teknisi dapat ditelusuri. Tugas komputer sudah disiapkan terpisah agar tidak menunggu pembuatan WO dari laporan printer. |
| 9 | 2 menit | Teknisi → Sarpras | Isi progres/catatan tugas komputer, misalnya “Kipas dibersihkan; komputer menyala normal”, isi hasil, lalu **Ajukan Penyelesaian**. Foto contoh sudah terpasang. Sarpras memilih kondisi Baik dan **Verifikasi & Tutup**. | Pekerjaan diperiksa sebelum ditutup; kondisi aset dan riwayat servis diperbarui. |
| 10 | 2 menit | Sarpras | Buka `/bahan`. Tunjukkan Kertas A4, Tinta Printer, dan Timah Solder. Buka detail bahan/kartu stok. | Saldo berasal dari ledger; stok minimum memunculkan bahan yang perlu diisi ulang. Tinta dan timah sengaja dibuat di bawah minimum. |
| 11 | 2 menit | Guru → Sarpras | Buka permintaan bahan demo yang menunggu; Sarpras menyetujui. Atau buka contoh siap serah dari file tautan, isi penerima/jumlah dan serahkan. | Persetujuan belum mengurangi stok; penyerahan mencatat pengeluaran pada kartu stok. Contoh permintaan ketiga sudah selesai diserahkan. |
| 12 | 2 menit | Sarpras | Buka “Demo - Opname Laboratorium RPL” dari file tautan. Tunjukkan dua item sudah diperiksa, scan/input QR item yang belum diperiksa. Buka juga contoh opname Bahan Gudang. | Aset diperiksa per unit; bahan dihitung secara kuantitas. Jangan memfinalkan sesi sebelum seluruh target diperiksa. |
| 13 | 3 menit | Guru → Pimpinan | Buka `/pengadaan`: “Penambahan Laptop Kelas RPL”, lihat item, estimasi, lampiran spesifikasi, dan persetujuan. Pimpinan menyetujui lewat kotak persetujuan. Tunjukkan contoh multimeter yang sudah siap diterima. | Usulan → persetujuan → penerimaan → pencatatan inventaris dapat dijelaskan dengan contoh yang berbeda. Penerimaan lengkap bisa dijadikan sesi tambahan. |
| 14 | 2 menit | Sarpras → Pimpinan | Buka usulan penghapusan dari file tautan. Tunjukkan komputer rusak berat, snapshot nilai/kondisi, alasan, dan persetujuan pimpinan. | Aset tidak dihapus sembarangan. Penyelesaian fisik dilakukan setelah persetujuan dan memerlukan saksi/catatan. |
| 15 | 1 menit | Sarpras | Buka `/analitik`. Pilih laporan inventaris/kondisi/peminjaman sesuai menu. Jelaskan filter dan ekspor. | Transaksi operasional menjadi laporan untuk keputusan manajemen. |
| 16 | 1 menit | Guru | Klik tombol chat biru. Tunjukkan kuota, buka privasi dan setujui pemrosesan, lalu tanyakan “Di mana Proyektor Presentasi 01 (Demo) disimpan?” | Asisten mengikuti hak akses dan dapat menautkan data terkait. Jika provider belum aktif, tampilkan riwayat contoh tersimpan dengan penjelasan yang jujur. |

Selama berganti akun, cukup ucapkan: **“Sekarang saya berpindah ke peran petugas/teknisi/pimpinan untuk menunjukkan siapa yang berwenang melanjutkan proses.”**

## 5. Penutup — 30 detik

> “Dari alur tadi, data fasilitas tidak berhenti sebagai daftar barang. Identitas aset terhubung ke reservasi, peminjaman, kerusakan, perawatan, pemeriksaan fisik, serta laporan. Hak akses membagi tanggung jawab setiap peran, dan riwayat membantu sekolah mempertanggungjawabkan setiap perubahan.”

## 6. Sesi tambahan untuk menunjukkan seluruh cakupan

| Modul | Bukti yang diperlihatkan |
|---|---|
| M-01 Autentikasi | Login dan 2FA Administrator/Pimpinan. |
| M-02 Pengguna/Role | `/pengguna`, `/role`; tujuh akun demo mengikuti matriks izin yang sudah ada. Coba akun Siswa untuk menunjukkan menu terbatas. |
| M-03 Lokasi | Tiga gedung dan sepuluh ruangan demo. |
| M-04 Inventaris | 48 unit demo, enam kategori, kondisi berbeda; CSV impor tambahan tersedia. |
| M-05 QR | Label proyektor dan komputer target opname. UUID QR tidak memuat nilai keuangan. |
| M-06 Dokumen | Faktur dan manual proyektor; PDF nyata tersedia untuk diunduh. |
| M-07 Reservasi Ruangan | Kalender, persetujuan, blokade manual persiapan pameran, dan jadwal jaringan mingguan. |
| M-08 Reservasi Aset | Proyektor siap diambil dan unit yang dialokasikan. |
| M-09 Peminjaman/Denda | Contoh aktif, terlambat, dikembalikan, dan denda belum lunas. |
| M-10 Persetujuan | Enam aturan demo dibatasi ID pemohon demo; contoh pending dan keputusan selesai. |
| M-11 Kerusakan | Laporan baru, perbaikan berjalan, dan selesai. |
| M-12 Perawatan | Tugas teknisi dan jadwal preventif 90 hari. |
| M-13 Stock Opname | Sesi Aset dan Bahan, daftar target dan hasil pemeriksaan. |
| M-14 Pengadaan | Draf, menunggu persetujuan, dan siap penerimaan. |
| M-15 Dashboard | Ringkasan sesuai peran yang sedang login. |
| M-16 Analitik | Filter laporan dan ekspor sesuai izin. |
| M-17 Notifikasi | Pemberitahuan contoh terhubung ke reservasi, tugas teknisi, dan pengadaan. |
| M-18 Activity Log | Administrator membuka `/activity-log`; aksi seed ditandai `DEMO_DATA_CREATED`/`DEMO_ATTACHMENT_CREATED`, aksi presentasi memakai log bisnis normal. |
| M-19 Chatbot | Panel web, kuota, riwayat contoh, dan permintaan langsung bila Gemini tersedia. |
| M-20 Pengaturan | Tahun ajaran aktif yang sudah ada dipertahankan; unit demo, satuan bahan, dan parameter yang sebelumnya kosong diisi. |
| M-21 Penghapusan | Komputer rusak berat, snapshot, dan persetujuan akhir pimpinan. |
| M-22 Bahan | Delapan bahan, penerimaan, pengeluaran, saldo, stok rendah, permintaan, dan opname. |

Contoh berkas untuk diunggah saat demo ada di folder berkas (`tmp/demo/berkas`): `IMPORT-ASET-DEMO.csv`, `IMPORT-PENGGUNA-DEMO.csv`, `IMPORT-JADWAL-DEMO.csv`, `BUKTI-DEMO.png`, dan tiga PDF pendukung. CSV berisi data tambahan yang belum otomatis diimpor; ini disiapkan untuk memperlihatkan proses impor melalui aplikasi.

## 7. Versi singkat — 10 menit

1. **1 menit:** pembuka dan dashboard.
2. **2 menit:** aset proyektor → lokasi → QR → dokumen.
3. **2 menit:** Guru mengajukan kebutuhan → Sarpras menyetujui → tampilkan peminjaman aktif yang sudah disiapkan.
4. **2 menit:** kerusakan → tugas Teknisi → verifikasi Sarpras.
5. **1 menit:** stok bahan rendah dan kartu stok.
6. **1 menit:** pengadaan/penghapusan yang ditinjau Pimpinan.
7. **1 menit:** analitik, chatbot/kuota, lalu penutup.

## 8. Data awal dan batas demonstrasi

| Jenis data | Jumlah |
|---|---:|
| Akun demo | 7 |
| Gedung / ruangan | 3 / 10 |
| Kategori / unit aset | 6 / 48 |
| Reservasi | 11 |
| Peminjaman / denda | 3 / 1 |
| Laporan kerusakan / work order | 3 / 2 |
| Jadwal perawatan | 1 |
| Sesi opname Aset / Bahan | 1 / 1 |
| Usulan pengadaan / penghapusan | 3 / 1 |
| Jenis bahan / permintaan bahan | 8 / 3 |
| Aturan persetujuan | 6 |
| Dokumen aset | 2 |
| Objek lampiran privat | 6 |

`BUKTI-DEMO.png` merupakan ilustrasi berlabel demo, bukan foto perangkat sekolah. Dokumen pengadaan juga fiktif. Ekspor, berita acara akhir, push notification, jawaban Gemini langsung, dan sinkronisasi offline native memerlukan layanan pendukung terkait; seed tidak mengarang hasil integrasi tersebut.

Jika ada layanan bermasalah saat presentasi, jelaskan kondisinya dan gunakan data tersimpan untuk melanjutkan narasi. Untuk mengulang proses yang sudah selesai, buat transaksi baru lewat aplikasi; seed tidak mengembalikan status ke awal.

## 9. Rujukan dan pemeriksaan

Skenario memakai fitur yang sudah ada pada [PRD modul](../PRD/02-modules/), terutama M-04, M-07–M-14, M-19, M-21, dan M-22; pembagian kewenangan mengikuti role bawaan. Skrip berada di [`seed-demo.mjs`](../../scripts/seed-demo.mjs), [`seed-demo-files.mjs`](../../scripts/seed-demo-files.mjs), dan [`verify-demo.mjs`](../../scripts/verify-demo.mjs).

Hasil aktual lingkungan lokal tersedia di manifest (`tmp/demo/manifest.json`), pemeriksaan relasi/ledger/audit/storage (`tmp/demo/verification.json`), dan pemeriksaan API (`tmp/demo/api-check.json`). Jumlah pada panduan adalah dataset awal, sedangkan jumlah pada aplikasi dapat berubah setelah latihan.

Verifikasi rantai audit dibatasi sejak entri seed demo pertama dan berjangkar pada hash sebelumnya. Database pengembangan sudah memuat log fixture lama yang tidak lolos verifikasi global; seed tidak mengubah atau menulis ulang log lama tersebut.
