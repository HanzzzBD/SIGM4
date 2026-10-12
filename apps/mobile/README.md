# SIGM4 mobile

Expo SDK 57, React Native 0.86, React 19.2.3; development build Android/iOS.
Minimum Android 8/API 26 dan iOS 16.4 (`NFR-C-03`, keputusan pemilik produk 12 Oktober 2026).

## Pengembangan

Gunakan Node >=22.13. Salin `.env.example` menjadi `.env.local` dan isi `EXPO_PUBLIC_API_URL` sampai `/api/v1`.
URL HTTP hanya diizinkan pada build pengembangan; build produksi memerlukan HTTPS.

```sh
npm ci
npm run test -w apps/mobile
npm run build -w apps/mobile
npm run android -w apps/mobile
npm run ios -w apps/mobile
npm run start -w apps/mobile
npm run export -w apps/mobile
```

Android memerlukan Android SDK/JDK; iOS memerlukan macOS/Xcode. Expo Go bukan target aplikasi ini.
`export` menghasilkan bundel Hermes Android/iOS, bukan APK/IPA dan bukan bukti berjalan pada perangkat.

Proyek dan kredensial EAS harus milik sekolah (`MOB-REL-02`). Isi `EAS_PROJECT_ID` setelah proyek sekolah
tersedia untuk mengaktifkan OTA. Konfigurasi lokal tidak menjalankan build EAS atau publikasi update.
Runtime OTA mengikuti versi aplikasi; perubahan native memerlukan binary baru.

## Antrean unggah

Data operasional tidak disimpan lokal. Token satu rekaman hanya melalui SecureStore; challenge dan profil
berada di memori. SQLite hanya berisi antrean berkas, dipisahkan per akun, maksimum 50/72 jam.

Fitur pemilik foto memakai `preparePhoto` (JPEG 80%, sisi terpanjang <=1600, <=500 KB, tanpa EXIF),
memesan berkas melalui presign, kemudian menjalankan transaksi server yang menautkan file_id.
Setelah transaksi berhasil, panggil `enqueuePreparedPhoto`. Transaksi bisnis tidak boleh diantrekan.
Antrean mencoba confirm idempoten lebih dulu, lalu mengambil URL baru dari `POST /files/{id}/presign`
jika objek belum terunggah. URL/token tidak disimpan dalam SQLite. Progres dan pembatalan ada melalui port antrean.

Timer, koneksi kembali dan app foreground memicu pengiriman; akun lain tidak dapat mengirim/membatalkan
foto akun lama. Penghapusan akibat retensi diberi tahu pada layar masuk aplikasi.

## Verifikasi yang masih memerlukan perangkat/rilis

Kamera nyata, Keychain/Keystore, pratinjau app switcher, SQLite setelah force-stop,
cold start, ukuran APK/IPA dan matriks perangkat harus diuji pada development build.
Certificate pinning, root/jailbreak dan distribusi store ditutup pada pengerasan `PR-08-13`.


## Pemindai dan detail aset (PR-05-32)

Isi EXPO_PUBLIC_APP_URL dengan origin HTTPS sekolah (fallback origin API); QR URL origin lain
atau path selain /a/UUIDv4 ditolak. Pemindai tersedia dari beranda bagi asset.view; kamera QR
native mendukung lampu dan mode beruntun, izin ditolak tetap menyediakan input kode manual.
Hasil beruntun dibatasi 200 di memori layar; tidak ada transaksi opname/mutasi otomatis.
Aksi sesuai permission/status tampil nonaktif dengan alasan ketika modul tujuan belum tersedia.
Detail menampilkan foto CLEAN dari API privat dan riwayat berpaginasi. Muat ulang mengganti URL
foto kedaluwarsa. App Links / Universal Links memerlukan association files dan identitas binary
sekolah pada deployment PR-08-02; konfigurasi domain saja belum membuktikan integrasi perangkat.


### Uji perangkat sebelum merge/rilis

- Kamera izin pertama, penolakan permanen/pengaturan dan kode manual tanpa izin kamera.
- QR sah 10-30 cm, QR asing/regenerasi/tidak dikenal, jaringan gagal dan retry; ukur hasil <=3 detik.
- Beruntun, duplikat, lampu, fokus pindah layar/background; kamera tidak berjalan di latar belakang.
- Role/scope berbeda, aset dihapuskan, finansial tersembunyi, URL foto PENDING/INFECTED tidak tampil.
- Login/TOTP/enrolment/password wajib; logout dan pergantian akun tidak menampilkan sesi sebelumnya.
- Antrean foto bertahan force-stop, reconnect, backoff, pembatalan, retensi dan pemisahan akun.
- App/Universal Link setelah login; lakukan pada binary sekolah dengan association files terpasang.
- TalkBack/VoiceOver, skala font, rotasi/tablet, minimum Android8 dan iOS16.4.
