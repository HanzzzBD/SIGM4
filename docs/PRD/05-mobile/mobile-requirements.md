# 32. Mobile Application Requirements

> Aplikasi mobile menanggung seluruh pekerjaan lapangan: pemindaian QR, stock opname, eksekusi work order, pelaporan kerusakan, dan persetujuan dari ponsel. Bab ini menutup kekosongan spesifikasi yang sebelumnya menyerahkan hal-hal kritis kepada asumsi developer.

## 32.1 Klarifikasi Kebijakan Luring

Audit menemukan kontradiksi: NO-07 dan Keputusan #15 menyatakan mobile **online only**, sementara FR-11.2 A2 menjanjikan "unggahan foto tertunda saat koneksi lemah" — yang berarti antrean luring. Ketetapan berikut menyelesaikannya.

| Kode | Ketetapan |
|---|---|
| MOB-OFF-01 | **Seluruh data operasional tetap online only.** Tidak ada replikasi basis data lokal, tidak ada sinkronisasi dua arah, tidak ada penyelesaian konflik. NO-07 tetap berlaku untuk data. |
| MOB-OFF-02 | **Pengecualian tunggal: antrean unggah berkas.** Foto yang gagal terunggah karena jaringan lemah disimpan sementara pada perangkat dan dicoba ulang otomatis. Ini bukan mode luring — transaksi bisnisnya sendiri sudah tercatat di server. |
| MOB-OFF-03 | Antrean unggah bertahan maksimum 72 jam atau 50 berkas; melebihi itu, berkas tertua dibuang dan pengguna diberi tahu |
| MOB-OFF-04 | Entitas yang fotonya masih tertunda ditandai jelas pada antarmuka ("Foto belum terunggah") dan muncul pada daftar tindak lanjut Petugas Sarpras |
| MOB-OFF-05 | Aksi yang mengubah data (ajukan, setujui, serah terima, catat opname) **wajib** online dan gagal secara eksplisit bila tidak ada koneksi — tidak pernah diantrekan |

## 32.2 Spesifikasi Media & Kamera

Tanpa ketentuan ini, satu tiket kerusakan berisi 5 foto ponsel modern dapat mencapai 20 MB dan akan gagal terunggah di jaringan sekolah.

| Kode | Requirement |
|---|---|
| MOB-MED-01 | Foto dikompresi di perangkat sebelum diunggah: sisi terpanjang maksimum **1600 px**, kualitas JPEG 80%, target ukuran ≤ 500 KB per foto |
| MOB-MED-02 | Metadata EXIF **dihapus** sebelum unggah, kecuali orientasi. Data GPS tidak pernah disertakan (minimisasi data, DP-03) |
| MOB-MED-03 | Unggah dilakukan langsung ke object storage melalui *presigned URL* (17.5 poin 6), tidak melalui proses API |
| MOB-MED-04 | Indikator progres per berkas dan pembatalan unggah tersedia |
| MOB-MED-05 | Pemindaian QR memakai pustaka kamera native; tingkat koreksi galat M dan ukuran cetak minimum 2×2 cm wajib terbaca pada jarak 10–30 cm dalam kondisi cahaya ruangan kelas |
| MOB-MED-06 | Bila izin kamera ditolak, aplikasi menampilkan panduan mengaktifkan izin dan menyediakan input kode barang manual (FR-05.2 A4) |
| MOB-MED-07 | Mode pemindaian beruntun tersedia untuk opname dan mutasi massal: kamera tetap aktif, hasil ditambahkan ke daftar tanpa menutup pemindai |

## 32.3 Versi Aplikasi & Pembaruan Paksa

| Kode | Requirement |
|---|---|
| MOB-VER-01 | Setiap permintaan menyertakan header `X-App-Version` dan `X-Platform` |
| MOB-VER-02 | Server dapat menetapkan **versi minimum yang didukung**; permintaan dari versi di bawahnya menerima `426 UPGRADE_REQUIRED` |
| MOB-VER-03 | Aplikasi menampilkan layar pembaruan paksa yang tidak dapat dilewati saat menerima `426`, beserta tautan ke store |
| MOB-VER-04 | Pembaruan opsional (fitur baru) ditampilkan sebagai anjuran yang dapat ditunda |
| MOB-VER-05 | Versi minimum hanya dinaikkan bersamaan dengan perubahan API yang tidak kompatibel mundur, dan diumumkan minimal 30 hari sebelumnya (melengkapi NFR-C-09) |

## 32.4 Deep Link & Navigasi

| Kode | Requirement |
|---|---|
| MOB-DL-01 | Skema deep link: **Android App Links** dan **iOS Universal Links** atas domain sekolah, dengan berkas verifikasi (`assetlinks.json` dan `apple-app-site-association`) dilayani dari domain yang sama |
| MOB-DL-02 | Seluruh notifikasi memuat deep link ke objek terkait (20.1) |
| MOB-DL-03 | Deep link ke objek yang tidak dapat diakses pengguna membuka layar "tanpa hak akses", bukan galat mentah (31.5) |
| MOB-DL-04 | Deep link ke objek yang telah dihapus/dibatalkan menampilkan "Data tidak lagi tersedia" (FR-17.1 A1) |
| MOB-DL-05 | Pemindaian QR oleh aplikasi kamera bawaan membuka halaman web publik; bila aplikasi SIGM4 terpasang, App/Universal Link mengalihkannya ke aplikasi (FR-05.2 A3) |

## 32.5 Izin Runtime

| Izin | Tujuan | Perilaku bila ditolak |
|---|---|---|
| Kamera | Pemindaian QR, foto kondisi & kerusakan | Input kode manual dan unggah dari galeri tetap tersedia |
| Notifikasi | Push FCM | Notifikasi in-app tetap berjalan; ditampilkan ajakan mengaktifkan (FR-17.2 A1) |
| Penyimpanan/Galeri | Memilih foto yang sudah ada | Hanya kamera langsung yang tersedia |

Seluruh izin diminta **saat pertama kali dibutuhkan** disertai penjelasan tujuan, bukan sekaligus saat pertama membuka aplikasi.

## 32.6 Performa & Paginasi Lapangan

| Kode | Requirement |
|---|---|
| MOB-PERF-01 | *Cold start* ≤ 3 detik pada perangkat kelas menengah sebagaimana didefinisikan pada 30.6 (menutup ambiguitas NFR-P-10) |
| MOB-PERF-02 | Daftar aset target opname dimuat **per lokasi**, bukan per sesi; satu lokasi diasumsikan ≤ 500 unit dan dimuat dalam satu halaman khusus opname (`per_page` hingga 500, pengecualian terhadap batas umum 100 pada 17.1) |
| MOB-PERF-03 | Hasil pemindaian opname dikirim per pemindaian (bukan menunggu akhir sesi) agar progres tidak hilang bila aplikasi tertutup |
| MOB-PERF-04 | Daftar panjang memakai *virtualized list*; gambar dimuat malas dan memakai berkas turunan berukuran kecil (*thumbnail*) |
| MOB-PERF-05 | Ukuran unduh aplikasi ≤ 40 MB per platform |

## 32.7 Keamanan Perangkat

| Kode | Requirement |
|---|---|
| MOB-SEC-01 | Token disimpan di Keychain (iOS) / Keystore (Android), tidak pernah di penyimpanan biasa (NFR-S-09) |
| MOB-SEC-02 | *Certificate pinning* terhadap domain API |
| MOB-SEC-03 | Aplikasi menolak berjalan pada perangkat *rooted*/*jailbroken* dengan peringatan yang dapat dilewati Administrator pada perangkat uji |
| MOB-SEC-04 | Layar yang memuat data pribadi disembunyikan pada pratinjau aplikasi (*app switcher*) |
| MOB-SEC-05 | Token perangkat FCM dicabut saat logout (FR-01.2 AC) |
| MOB-SEC-06 | Tidak ada data operasional yang disimpan permanen di perangkat selain antrean unggah (MOB-OFF-02) dan token sesi |

## 32.8 Distribusi & Rilis Store

| Kode | Requirement |
|---|---|
| MOB-REL-01 | Sekolah wajib memiliki **akun Google Play Developer** dan **Apple Developer Program berbayar** beserta perpanjangan tahunannya. Kebutuhan ini sebelumnya tidak tercantum pada asumsi AS-15 dan wajib dianggarkan |
| MOB-REL-02 | Kepemilikan akun store dan sertifikat penandatanganan berada pada sekolah, bukan pada vendor pengembang, agar tidak terjadi ketergantungan |
| MOB-REL-03 | Rilis awal melalui jalur pengujian internal store sebelum publikasi publik |
| MOB-REL-04 | Persyaratan store dipenuhi sebelum pengajuan: kebijakan privasi terpublikasi (DP-01), *data safety form* diisi jujur, dan penjelasan penggunaan kamera |
| MOB-REL-05 | Tenggang waktu peninjauan App Store diperhitungkan dalam jadwal rilis (GL-11) |
| MOB-REL-06 | Distribusi alternatif berupa berkas APK langsung diizinkan hanya untuk perangkat internal sekolah pada masa uji coba |

---
