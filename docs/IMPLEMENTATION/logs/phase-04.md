# Log Phase 04 — Siklus Hidup Aset

| | |
|---|---|
| **Phase** | [`phases/phase-04.md`](../phases/phase-04.md) |
| **Milestone PRD** | `M2 — **menutup M2**` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | — |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-04.md`](../phases/phase-04.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| — | — | — |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | **Pengecualian SCA terbatas** (pemilik produk, 24 Oktober 2026): advisory tanpa tambalan upstream boleh dikecualikan per GHSA + path paket, paling lama 30 hari (High) / 7 hari (Critical). Mekanisme dibangun PR chore tersendiri dengan daftar kosong; entri pertama (`node-forge`, `zod` milik `@expo/cli`) ikut `PR-04-16` | Fondasi mobile Expo 57 (`SDD-MOB-10`) membawa `node-forge` GHSA-86w9-cpqp-85rv tanpa versi tertambal; `CD-02` tanpa pengecualian akan menahan seluruh rantai mobile tanpa tanggal | Ya — `CD-02`, `SDD-SEC-13` |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| — | — | — | — |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-04.md` §7](../phases/phase-04.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Apakah `SlotService` perlu diubah untuk melayani reservasi aset. **Perubahan apa pun di sini wajib melalui tinjauan arsitek** — ia menandakan abstraksi Phase 02 kurang umum
- [ ] Kriteria keluar `M2` terverifikasi: 50 permintaan simultan atas slot sama → tepat 1 sukses

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| — | — | — | — |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-04.md` §9 dan §12](../phases/phase-04.md).

- [ ] Seluruh 14 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| — | — | — |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*

### PR-04-15: URL unggah ulang - 12 Oktober 2026

Pendahulu PR-04-16 disetujui pemilik produk melalui fitur pertanyaan. Kontrak POST /files/{id}/presign ditetapkan dalam PRD m06 sebelum kode: 200 presign 300 detik pada object key/MIME/ukuran lama, tidak membuat baris baru; hanya milik pemanggil yang checksum-nya masih null. Anonim 401, berkas asing/tidak ada 404, sudah dikonfirmasi 422. Tidak ada perubahan data atau entri aktivitas baru; log unggah tetap saat confirm. Tanpa migration. TypeScript API dan uji lulus; 13 uji integrasi file dengan PostgreSQL/MinIO nyata pada DB terisolasi lulus. Cabang lokal feature/PR-04-15-url-unggah-ulang; belum dipublikasikan.

### PR-04-16: fondasi mobile - 12 Oktober 2026

Keputusan pemilik produk melalui fitur pertanyaan: Expo SDK 57, minimum iOS 16.4 (perubahan NFR-C-03), Android 8 tetap; PR-04-15 pendahulu terpisah; cabang berurutan dari develop. Antrean SQLite menyimpan hanya berkas tertunda dan metadata pemilik akun; token/URL presign tidak disimpan. Lima uji Node SQLite nyata lulus: persistensi buka ulang DB, retensi 50 berkas/72 jam, backoff, pengiriman tunggal dan pembatalan aktif/pemisahan akun. Belum merupakan bukti native expo-sqlite atau build perangkat. Integrasi SDK/auth/unggah sedang dikerjakan. PR-05-32 mengikuti fondasi; keputusan aksi yang layarnya belum ada nonaktif dengan alasan, API baca foto CLEAN ditambahkan pada PR-05-32.

Validasi PR-04-16 lokal: 15 uji pada tiga berkas lulus (SQLite nyata, token/refresh/sesi, pemulihan unggah); TypeScript mobile dan lint lulus. Expo export menghasilkan Hermes Android/iOS. Ini belum bukti APK/IPA/perangkat nyata: host Windows tidak menyediakan adb/Android SDK terdeteksi atau Xcode. Native Keychain/Keystore, kamera, force-stop SQLite, cold start dan app switcher tetap memerlukan development build perangkat. SCA terhalang dua advisory HIGH transitif tanpa patch upstream saat verifikasi 12 Oktober: GHSA-vfj7-8cjw-p6xm (braces <=3.0.3; registry terbaru 3.0.3), GHSA-86w9-cpqp-85rv (node-forge <=1.4.0; registry terbaru 1.4.0). Audit melaporkan 20 HIGH karena propagasi paket Expo/Metro, bukan 20 advisory berbeda. Tidak menjalankan npm audit fix --force (menawarkan downgrade Expo44/RN0.72 yang tidak kompatibel). Gerbang CI/SCA belum dinyatakan hijau. Tidak ada publikasi EAS, store, GitHub atau deploy.


### Review ulang PR-04-15 - 13 Oktober 2026

Pemilik produk memilih review dan validasi ulang implementasi lokal melalui fitur pertanyaan.
Commit yang ditinjau 7aeffc7, branch feature/PR-04-15-url-unggah-ulang. Cabang aktif tetap
feature/PR-05-32-pemindai-mobile; git diff 7aeffc7..HEAD pada m06-documents dan m06-files.test.ts
kosong, sehingga kode fitur yang diuji identik dengan PR-04-15. Tidak ada perubahan kode produksi.
Review kontrak, registry route, autentikasi, filter uploaded_by, penolakan checksum terisi,
metadata/TTL dari registri dan tidak adanya mutasi tidak menemukan masalah yang perlu diperbaiki.

PostgreSQL uji awal tidak tersedia (ECONNREFUSED 127.0.0.1:55432); Docker Desktop dimulai
secara tersembunyi, container lokal yang sudah ada otomatis kembali hidup. Uji memakai DB baru
terisolasi yang dihapus setelah selesai, bukan basis data aplikasi. Validasi ulang 13 integrasi
PostgreSQL/MinIO dan 11 registry/OpenAPI lulus. Uji registry memakai maxWorkers2/testTimeout30000;
integrasi testTimeout30000. Tidak ada publish, merge atau deployment. Status PR tetap lokal.

Typecheck API (termasuk source uji) dan lint m06-documents lulus setelah pengujian ulang.
