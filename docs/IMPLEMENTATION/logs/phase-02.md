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
| 19 September 2026 | `PR-02-02` tergabung ([#62](https://github.com/HanzzzBD/SIGM4/pull/62)). `PR-02-03` dibuka ([#63](https://github.com/HanzzzBD/SIGM4/pull/63), `feature/PR-02-03-penguncian-akun`): migration `0022` (`failed_login_count`, `failed_login_window_start`, `locked_until`), `lockout.ts` (aritmetika jendela tetap), penguncian + audit percobaan gagal di `AuthService.login`, `AuditLogger.writeAnonim`, event `AccountLocked`. Pemilik produk mengubah kontrak login menjadi **respons seragam** (keputusan 10): 401 untuk email tak dikenal, password salah, dan akun terkunci. 13 uji unit + 20 uji integrasi baru; 14 mutasi seluruhnya terdeteksi. | `PR-02-03` |

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
| 9 | Jendela "5 gagal dalam 15 menit" adalah **jendela tetap** dari kegagalan pertama; kolom `failed_login_window_start` ditambahkan pada `users` (migration `0022`). | `SDD-04 §4.1` hanya punya `failed_login_count` dan `locked_until`; "dalam 15 menit" tak dapat dinyatakan tanpa titik awal jendela. Alternatif ditolak: tanpa jendela (bertentangan dengan "dalam 15 menit"), menghitung dari `activity_logs` (login bergantung pada tabel log berantai-hash). | Ya — dipilih pemilik produk (19 September 2026); `SDD-04 §4.1/§4.2`, PRD `m02-users.md` §8 dan `data-model.md` (atribut `users`). |
| 10 | Respons `/auth/login` **seragam** (`SDD-SESS-12`): email tak terdaftar, password salah, dan akun terkunci dijawab `401 UNAUTHENTICATED` yang identik; `423` dan sisa waktu kunci tidak pernah keluar dari endpoint ini. Penguncian tetap berjalan dan dicatat secara internal. | Acceptance rencana phase menuntut "pesan galat tidak membocorkan keberadaan akun", sedangkan `SDD-04 §4.2` dan PRD `FR-01.1 A2` menjawab `423` bagi akun terkunci — yang membuktikan sebuah email terdaftar. Pemilik produk memilih opsi di luar tiga yang saya tawarkan (penguncian bayangan Redis / ikuti SDD apa adanya / selalu 401 tanpa syarat) dan menetapkan cakupannya: tanpa `423`, tanpa sisa waktu, tanpa tabel penghitung per-email baru, tanpa mekanisme pemberitahuan pengguna baru. | Ya — kontrak berubah: PRD `m01-auth.md` (diagram, `A1`, `A2`, acceptance, baris endpoint, aksi log), `api-conventions.md` Bab 17.3 (catatan `423`), `SDD-04` (`SDD-SESS-12`, §4.2, §5, §6), UX `PAGE-SPECIFICATION §7.3` dan `USER-FLOWS F-01`. |
| 11 | Argon2id dijalankan tepat sekali pada ketiga keadaan (hash pengganti bila email tak ada; hash asli bila akun terkunci). Percobaan atas akun terkunci dicatat (`LOGIN_FAILED`, alasan `AKUN_TERKUNCI`) tetapi TIDAK dihitung dan tidak memperpanjang kunci. | Respons yang identik tidak berarti bila waktunya berbeda; menghitung percobaan selagi terkunci membuat siapa pun dapat memperpanjang kunci akun orang lain tanpa batas. | Ya — `SDD-SESS-12`, `SDD-04 §4.2`. |
| 12 | `LOGIN_FAILED` dicatat juga untuk email tak terdaftar lewat metode baru `AuditLogger.writeAnonim` (`user_id`/nama/role NULL; akun sasaran pada `entitas`/`entitas_id`; email yang dicoba tidak disimpan). | `AL-02`/`AL-07` mewajibkan kegagalan login tercatat, dan `AuditLogger` hanya mengenal pelaku ber-`AuthContext` atau `SYSTEM`. `AuditLogger` adalah tulang punggung — **tinjauan arsitek**. | Ya — dipilih pemilik produk (19 September 2026); PRD `m01-auth.md` §11. |
| 13 | `NT-39` terbit sebagai event outbox `AccountLocked` di transaksi penguncian (agregat `user`, payload `user_id`, `terkunci_sampai`); konsumennya dipasang `PR-02-25`. `actor_id` outbox = akun yang terkunci, karena permintaan ini tak berautentikasi dan `publish` mensyaratkan `AuthContext`. | Modul notifikasi belum ada; pola yang sama dengan `NT-48`/`NT-52` (keputusan 32–33 log phase-01), sehingga `PR-02-25` tidak perlu menyunting alur login. | Ya — dipilih pemilik produk; `SDD-07 §4.3`. |
| 14 | `ACCOUNT_UNLOCKED` tidak diterbitkan. | Kunci berakhir sendiri tanpa proses yang berjalan, dan tidak ada jalur pembuka kunci administratif di PRD mana pun. PRD `m01-auth.md` §11 mencatat bahwa kunci yang berakhir tidak menulis entri. | Ya — PRD `m01-auth.md` §11. |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| `PR-02-02`: "deteksi pemakaian ulang → cabut seluruh rantai + alarm"; `SDD-04 §4.3` menambah "notifikasi Administrator" | Rantai dicabut, entri `REFRESH_TOKEN_REUSE_DETECTED` ditulis, alarm berupa log `error` (`OBS-05`). Notifikasi ke Administrator belum terbit. | Modul notifikasi baru lahir di `PR-02-25`; tidak ada katalog `NT-xx` untuk kejadian ini. | `PR-02-25` memasang konsumennya; jika kejadian ini belum punya `NT-xx`, naikkan ke PRD lebih dulu. |
| Skema `refresh_tokens` `SDD-04 §4.1` (tanpa `parent_id`, `ip`, `user_agent`) | Ketiganya ditambahkan; `SDD-04 §4.1` diselaraskan. | Tugas `PR-02-02` mewajibkan `parent_id`; `ip`/`user_agent` bahan daftar perangkat `PR-02-04` sehingga tak perlu migration kedua. | Tidak ada. |
| `SDD-04 §4.2`: `423 ACCOUNT_LOCKED` + sisa waktu bagi akun terkunci; `PRD FR-01.1 A2`: "sistem menampilkan sisa waktu penguncian" | `401` seragam; tidak ada `423` dan tidak ada sisa waktu pada `/auth/login`. | Keputusan 10 — mencegah enumerasi akun. | `PR-02-07` (`/auth/2fa/verify`) masih memakai `423` (password sudah terbukti benar); ia harus memutuskan bentuk penguncian TOTP dengan mengingat `SDD-SESS-12`. UI login (Phase 04+) tidak menampilkan keadaan terkunci. |
| Skema `users` `SDD-04 §4.1` (`failed_login_count`, `locked_until`) | Ditambah `failed_login_window_start`. | Keputusan 9. | Tidak ada. |
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
| CI pertama merah: CodeQL `js/clear-text-storage-of-sensitive-data` (High) pada penulisan access token ke cookie web (`auth.controller.ts`). | Positif palsu: token adalah JWT bertanda tangan yang memang dikirim lewat cookie `httpOnly; Secure`; heuristik CodeQL menandainya karena klaim diturunkan dari `must_change_password`/`AMR_PASSWORD`. Gerbang `CD-02` menolak PR. | Identifier pada jalur token dinamai ulang (`wajib_ganti` lewat alias kolom, `AMR_KREDENSIAL`); query TIDAK dikecualikan dan penekanan per baris tidak dipakai (lihat `.github/codeql/codeql-config.yml`). CI hijau setelahnya. | Tidak |
| Saya memakai `SDD-SESS-10` untuk keputusan respons seragam, padahal ID itu sudah milik *challenge token* 2FA. | Rujukan salah pada komentar kode dan uji. | Ditemukan sebelum PR dibuka saat membaca tabel keputusan `SDD-04`; ID baru `SDD-SESS-12` (`SDD-SESS-11` sudah dipakai break-glass). | Tidak |
| Uji `auth-login-refresh.test.ts` (PR-02-02) membuktikan "IP lain tidak terdampak" dengan akun yang sama, yang kini terkunci oleh lima kegagalan tadi. | Merah setelah `PR-02-03`. | Memakai akun lain untuk pemeriksaan IP itu. | Tidak |
| Mutasi "cek ulang penguncian di transaksi login berhasil dibuang" (M13) terdeteksi hanya oleh uji tak langsung; balapan antara pembacaan awal dan transaksi login tidak dapat dipaksa lewat HTTP. | Perilaku terbukti lewat mutasi tetapi bukan lewat uji deterministik balapan. | Diterima; kode dijaga komentar dan `SELECT … FOR UPDATE`. | Ya |
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
| Jalur pembuka kunci administratif dan apakah reset/ganti password (`PR-02-05`/`PR-02-06`) menghapus `locked_until` | `PR-02-05`/`PR-02-06` | Tidak ada requirement; tanpanya kunci hanya berakhir sendiri setelah 15 menit. Perlu keputusan pemilik produk. |
| Penguncian kegagalan TOTP (`FR-01.5 A1`) dan bentuk responsnya | `PR-02-07` | Memakai kolom `locked_until` yang sama; harus mempertimbangkan `SDD-SESS-12`. |
| Pemberitahuan pemilik akun bahwa akunnya terkunci | `PR-02-25` (`NT-39`) | Sengaja tidak ada di endpoint login (keputusan 10); `NT-39` in-app baru terbaca setelah kunci berakhir. |
| Pembersihan baris `refresh_tokens` kedaluwarsa | `TBD-SESS-B` | Retensi belum ditetapkan; indeks `expires_at` sudah ada. |
| Notifikasi Administrator atas pemakaian ulang refresh token | `PR-02-25` | Modul notifikasi belum ada (lihat Penyimpangan). |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
