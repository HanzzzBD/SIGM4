# Log Phase 05 — Penutupan Siklus

| | |
|---|---|
| **Phase** | [`phases/phase-05.md`](../phases/phase-05.md) |
| **Milestone PRD** | `M3 & M4 — **menutup keduanya**` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | 12 Oktober 2026 (PR-05-32 lokal) |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-05.md`](../phases/phase-05.md).

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
| — | — | — | — |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| — | — | — | — |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-05.md` §7](../phases/phase-05.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] **Penutupan `SL-04`** (`PR-05-09`) — definisi final 'kewajiban aktif'. Wajib tercatat di sini **dan** di [`phase-01.md`](phase-01.md)
- [ ] Penghapusan aset tidak pernah `DELETE` baris (`BR-008`) — bukti verifikasinya
- [ ] Kriteria keluar `M3` terverifikasi: alur reservasi → serah terima → pengembalian → denda → tiket → work order → selesai berjalan di staging
- [ ] Kriteria keluar `M4` terverifikasi: opname 1.000 unit di perangkat nyata; pengadaan menghasilkan aset; penghapusan menghasilkan berita acara
- [ ] Seluruh modul wajib-mobile selesai (`M4`)

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

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-05.md` §9 dan §12](../phases/phase-05.md).

- [ ] Seluruh 25 PR tergabung
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


### PR-05-32: pemindai native dan detail aset - 12 Oktober 2026

Keputusan produk melalui fitur pertanyaan: pisah PR dari fondasi; aksi berizin sesuai status
nonaktif dengan alasan bila layar tujuan belum tersedia; API foto aman ikut PR ini. Tabel fisik
asset_photos memakai asset_id/file_id FK, urutan, is_primary dan diunggah_oleh; API baca
GET /assets/{id}/photos mengikuti asset.view/scope, tidak mengirim identitas pengunggah atau
object key tersendiri. Penautan/unggah tetap PR pengelolaan aset. PRD/SDD dan indeks API diperbarui.

MS-07 memakai expo-camera, mode beruntun FlatList maksimal 200 hasil memori, deduplikasi,
input kode manual persis, pengaturan izin, lampu, lifecycle fokus/foreground dan AbortSignal.
MS-08/09 memuat identitas, status/kondisi/lokasi, foto privat CLEAN dan riwayat berpaginasi;
BR-073 disaring server dan UI. QR asing tidak dipanggil atau dinavigasikan. Konfigurasi App Links
mengikuti domain sekolah; association files/binary dan perangkat nyata belum diverifikasi.
Token enrolment dan hasil /me terlambat dibatasi revision agar tidak memulihkan sesi lama.
Konfigurasi EXPO_PUBLIC memakai dot notation; URL API terbukti tertanam pada Hermes Android.

Validasi lokal: 21 uji mobile lulus, 12 integrasi detail/foto dan 17 integrasi QR PostgreSQL
nyata lulus pada DB terisolasi; 13 uji file PostgreSQL/MinIO lulus; 11 uji registry/OpenAPI lulus.
Migration 0052 dibuktikan oleh constraint FK, pasangan unik, satu primary dan urutan nonnegatif.
Penandatangan URL pada uji foto memakai port storage; bukan bukti byte foto di perangkat.
Tinjauan arsitek migration belum dilakukan. SCA HIGH upstream dari fondasi tetap terbuka;
tidak menyatakan CI/deployment siap. Kamera 10-30 cm, target hasil 3 detik, APK/IPA, cold start,
perangkat minimum, association files dan lifecycle native memerlukan development build.


Bundel Hermes Android/iOS dengan expo-image cachePolicy none lulus; bukan APK/IPA.
TypeScript produksi/uji, lint, audit docs dan 13 kasus batas impor (termasuk mobile) lulus.
Percobaan npm ci lokal ditolak Windows saat menghapus DLL rolldown web yang sedang dipakai;
bukan kesalahan kesesuaian lockfile. Dependency dipulihkan melalui npm install tanpa menghentikan
proses pengguna. Dependency peer lama dipertahankan; versi paket lama tidak dinaikkan oleh PR ini.


Pemulihan npm install selesai (exit 0); DLL sementara yang terkunci hanya menghasilkan warning
cleanup Windows. Perbandingan lockfile terhadap fondasi: tidak ada paket lama dihapus atau
versi lama berubah. Binding native argon2/sharp dapat dimuat. 21 uji mobile dan typecheck/lint
lulus lagi setelah pemulihan. Suite unit API lengkap: 1.292 uji/84 berkas lulus memakai
--maxWorkers=2 --testTimeout=30000. Percobaan paralel awal dengan checker batas impor gagal
(timeout dan file probe sementara hilang); diulang tanpa checker berjalan bersamaan.
Introspect konfigurasi native lulus: Android minSdk26, iOS deployment16.4, izin kamera ada,
NSMicrophoneUsageDescription tidak ada, Android RECORD_AUDIO bertanda remove.
