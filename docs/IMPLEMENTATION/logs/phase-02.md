# Log Phase 02 — Inti Sistem

| | |
|---|---|
| **Phase** | [`phases/phase-02.md`](../phases/phase-02.md) |
| **Milestone PRD** | `M1 (sebagian) · M2 (sebagian) · M5 (sebagian)` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | 19 September 2026 |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-02.md`](../phases/phase-02.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 19 September 2026 | Phase 02 dimulai selagi Phase 01 `In Review` (gerbang lulus bersyarat backend). `PR-02-02` dikerjakan lebih dulu: migration `0021_refresh_tokens.sql`, `JwtKeys` (EdDSA lewat `node:crypto`), refresh token buram + rotasi, modul `m01-auth` (`POST /auth/login`, `POST /auth/refresh`), `authenticate` + gerbang ganti password. 34 uji integrasi + 66 uji unit baru; delapan mutasi pada `AuthService` semuanya terdeteksi uji. | `PR-02-02` |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | Cakupan `PR-02-02`: login, refresh, `authenticate` (Bearer/cookie → `AuthContext` lewat `PermissionCache`), dan gerbang ganti password (klaim `pwd`). TANPA `LOGIN_FAILED`/penguncian (`PR-02-03`), logout (`PR-02-04`), ganti password (`PR-02-06`), 2FA (`PR-02-07`). | Rencana phase tidak menyebut `authenticate` maupun gerbang secara eksplisit, tetapi acceptance "refresh dipakai ulang → rantai dicabut" tak dapat diuji end-to-end tanpa token yang diverifikasi, dan `PR-01-15` sudah menyiapkan `authorize` yang menunggunya. | Ya — diputuskan pemilik produk (19 September 2026); `SDD-04 §4.7` ditambahkan. |
| 2 | Dua jalur token: WEB lewat cookie `httpOnly; Secure; SameSite=Strict` (body `tokens: null`), ANDROID/IOS lewat body + `Authorization: Bearer`. | `SDD-SESS-05` menetapkan cookie untuk web dan Keychain/Keystore untuk mobile, tetapi tidak bagaimana satu endpoint melayani keduanya. | Ya — `SDD-04 §4.7`, PRD `m01-auth.md` §7. |
| 3 | Body login memuat `platform` (`WEB`/`ANDROID`/`IOS`); disimpan pada `refresh_tokens.platform` dan diwarisi setiap rotasi, tidak pernah dari permintaan refresh. | Masa berlaku refresh (12 jam vs 30 hari) dan jalur token bergantung padanya; membacanya dari `User-Agent` dapat dipalsukan dan tidak andal. Enum `device_platform` sudah tertera di `SDD-04 §4.1`. | Ya — PRD Bab 11.3 (`Platform Perangkat`), `m01-auth.md` §7. |
| 4 | Kode galat `PASSWORD_CHANGE_REQUIRED` (403) ditambahkan. | Klien perlu membedakan "wajib ganti password" dari `INSUFFICIENT_PERMISSION` agar dapat mengarahkan pengguna ke layar ganti password (`FR-01.1 A4`). | Ya — PRD `api-conventions.md` Bab 17.3. |
| 5 | JWT ditulis di atas `node:crypto` (satu algoritma, satu kunci, klaim tetap), tanpa pustaka JWT. | Permukaan yang dibutuhkan < 100 baris; menghindari dependensi pada jalur autentikasi (SCA/rantai pasok). Kelas bug JWT (`alg=none`, kebingungan HS256↔kunci publik, `kid`/`crit`/`jku`, base64url longgar, kedaluwarsa pada tanda tangan palsu) diuji satu per satu di `tests/shared/security/jwt.test.ts`. | Tidak |
| 6 | `authenticate` **lenient**: token tak sah hanya ditandai, penolakan milik `authorize`. | Bila menolak di sini, `/auth/refresh` dan `/auth/login` tak dapat dipanggil dengan cookie access kedaluwarsa — padahal itulah saat refresh dibutuhkan. | Ya — `SDD-04 §4.7`. |
| 7 | Pencabutan karena pemakaian ulang di-commit meski respons `401`: hasil transaksi dikembalikan sebagai nilai, galat dilempar setelah commit. | Melempar dari dalam transaksi membatalkan pencabutan itu sendiri; acceptance justru menuntut rantai tercabut. | Ya — `SDD-04 §4.3`. |
| 8 | Pesan `401` tetap generik (`Permintaan tidak dapat diproses.`); `PESAN` di `api/chain.ts` tidak diubah. | Kontrak amplop galat lintas modul (keputusan 35 log phase-01) menguji pesan itu; klien memetakan `code` ke teks (`NFR-AC-09`). Sempat ditambahkan lalu dibatalkan setelah `error-envelope-contract.test.ts` merah. | Tidak |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| `PR-02-02`: "deteksi pemakaian ulang → cabut seluruh rantai + alarm"; `SDD-04 §4.3` menambah "notifikasi Administrator" | Rantai dicabut, entri `REFRESH_TOKEN_REUSE_DETECTED` ditulis, alarm berupa log `error` (`OBS-05`). Notifikasi ke Administrator belum terbit. | Modul notifikasi baru lahir di `PR-02-25`; tidak ada katalog `NT-xx` untuk kejadian ini. | `PR-02-25` memasang konsumennya; jika kejadian ini belum punya `NT-xx`, naikkan ke PRD lebih dulu. |
| Skema `refresh_tokens` `SDD-04 §4.1` (tanpa `parent_id`, `ip`, `user_agent`) | Ketiganya ditambahkan; `SDD-04 §4.1` diselaraskan. | Tugas `PR-02-02` mewajibkan `parent_id`; `ip`/`user_agent` bahan daftar perangkat `PR-02-04` sehingga tak perlu migration kedua. | Tidak ada. |
| Butir checklist `phase-02.md` merujuk `SDD-SESS-05` untuk deteksi pemakaian ulang dan `SDD-SESS-03` untuk `kid` | Yang berlaku adalah `SDD-SESS-04` (rantai keluarga) dan `SDD-SESS-02` (EdDSA). | Salah rujuk ID pada checklist; kode dan komentar memakai ID yang benar. | Perbaiki checklist bila `phase-02.md` disunting berikutnya. |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-02.md` §7](../phases/phase-02.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Bentuk akhir skema `booking_slots` dan alasan setiap kolomnya — ia mengikat Phase 03, 04, dan 05
- [ ] Hasil uji konkurensi `PR-02-17`: berapa permintaan serentak, berapa yang berhasil
- [ ] Hasil uji *first-responder-wins* `PR-02-21`
- [ ] Penerapan `SDD-APR-13/14/15`, `SDD-NTF-10`, dan `UXD-05`/`UXD-12` — seluruh TBD terkait sudah tertutup sebelum phase dimulai
- [ ] `assets.procurement_id` dibuat nullable tanpa FK aktif — pemutus siklus M-04 ↔ M-14

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| Staging menolak menyala setelah PR ini tergabung: `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` kini wajib pada skema API (`SDD-INF-08`). | `deploy-staging` gagal (readiness tak pernah hijau) sampai env operator diisi. | Operator menambahkan pasangan kunci ke `/etc/sigm4/staging.env` **sebelum** merge (perintah pembangkitan di `SDD-16 §4.7`). Diperingatkan pada deskripsi PR. | Ya |
| `tests/integration/users.test.ts` dan `activity-log.test.ts` (AL-03b) gagal secara lokal: `password authentication failed for user "sigm4_app"`. | Tidak terkait PR ini — akun `sigm4_app` pada `.env` lokal tidak cocok dengan basis data lokal. Lulus di CI. | Tidak diubah di PR ini. | Ya (lokal) |
| `phase-01-gate.test.ts` menuntut seluruh route tulis tersentuh dan mengecualikan probe kesehatan saja. | `POST /auth/login`/`refresh` (publik, tanpa `AuthContext`) membuatnya merah. | Route `m01-auth` dikecualikan dengan komentar; bukti `AL-01`-nya ada di `auth-login-refresh.test.ts`. Daftar route publik pada uji yang sama diperbarui. | Tidak |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-02.md` §9 dan §12](../phases/phase-02.md).

- [ ] Seluruh 29 PR tergabung (`PR-02-01` dan `PR-02-09` dipensiunkan)
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| `LOGIN_FAILED`, penghitung/penguncian akun, `NT-39` | `PR-02-03` | Direncanakan terpisah; kelas rate limit `login` (sumbu IP) sudah aktif. |
| Logout, logout semua perangkat, pencabutan saat nonaktif akun/ganti password | `PR-02-04` | Direncanakan terpisah. `cabutKeluarga` dan kolom `revoke_reason` sudah tersedia. |
| Pembersihan baris `refresh_tokens` kedaluwarsa | `TBD-SESS-B` | Retensi belum ditetapkan; indeks `expires_at` sudah ada. |
| Notifikasi Administrator atas pemakaian ulang refresh token | `PR-02-25` | Modul notifikasi belum ada (lihat Penyimpangan). |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
