# Log Phase 01 — Master Data Independen

| | |
|---|---|
| **Phase** | [`phases/phase-01.md`](../phases/phase-01.md) |
| **Milestone PRD** | `M1 (sebagian) · M5 (sebagian)` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | 15 September 2026 |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-01.md`](../phases/phase-01.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 16 September 2026 | `PR-01-15` dibuka di `feature/PR-01-15-middleware-otorisasi`. `authorize()` menegakkan permission atas `AuthContext` yang sudah ada di `res.locals`; `authenticate` (verifikasi token) tetap di luar cakupan — menyusul `PR-02-02`. `/health` ringkasan dipasang `healthSummaryRouter` di belakang otorisasi dan terdaftar ke registri; dua uji `health-http.test.ts` yang mengklaim ringkasan TIDAK terpasang diperbarui ke perilaku barunya (404 → 401). Uji SEC-T-01 dibangun tergenerate dari `registry.guarded()`, bukan daftar route yang ditulis manual. Tiga keputusan teknis (13–15) dan satu koreksi rujukan (§7). | [#45](https://github.com/HanzzzBD/SIGM4/pull/45) |
| 16 September 2026 | `PR-01-16` tergabung ([#43](https://github.com/HanzzzBD/SIGM4/pull/43)), **dengan *squash*** — `BRANCHING §3` kembali ditaati setelah #41 dan #42 memakai *merge commit*. Skema label PR ditetapkan dan langsung diterapkan (keputusan 12): 13 label phase dan jenis dibuat, sembilan label bawaan GitHub dihapus setelah dipastikan tidak dipakai satu pun issue maupun PR. Pertanyaannya datang dari pemilik produk — label memang tersedia di repositori tetapi tidak pernah dipakai di 43 PR, dan ternyata tidak pernah diminta docs mana pun. | [#43](https://github.com/HanzzzBD/SIGM4/pull/43) |
| 16 September 2026 | `PR-01-01` tergabung ([#42](https://github.com/HanzzzBD/SIGM4/pull/42)). `PR-01-16` dibuka di `feature/PR-01-16-hash-password`. Empat keputusan pemilik produk diambil sebelum kode ditulis (7–10): letak kode, pustaka Argon2id, cakupan `NFR-S-03a`, dan letak parameternya. Temuan saat menurunkan rujukan: baris rencana `PR-01-16` — warisan `PR-02-01` — menyebut `NFR-S-01`, yang sebenarnya soal HTTPS/TLS (§7). | [#43](https://github.com/HanzzzBD/SIGM4/pull/43) |
| 15 September 2026 | `PR-01-01` dibuka di `feature/PR-01-01-skema-users`. Sebelum migration ditulis, empat titik ternyata tidak dapat diterapkan dari docs apa adanya dan dinaikkan ke pemilik produk (keputusan 1–4): Bab 11.3 tidak mendaftarkan status pengguna, penanda 2FA berejaan tiga, akun berpassword sementara lahir sebelum hashing Argon2id tersedia, dan foto profil menuntut `stored_files` yang belum ada. | [#42](https://github.com/HanzzzBD/SIGM4/pull/42) |
| 15 September 2026 | Rencana disunting sebelum phase dimulai: middleware otorisasi `PR-02-09` dipindah menjadi `PR-01-15` dan mendahului seluruh PR endpoint (keputusan 63). Phase 01 boleh dimulai selagi Phase 00 `In Review`, lewat `DELIVERY-PLAN §10` butir 1 (keputusan 62). Keduanya dicatat di [log phase-00 §2](phase-00.md). | — |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 15 | `authorize()` melempar lewat `next(galat)` (`AuthError`/`ForbiddenError`), bukan menulis respons sendiri. | Menyamakan pola dengan seluruh service lain di basis kode: galat domain ditangkap satu tempat oleh `errorMapper` (`SDD-06 §4.4`), sehingga amplop, `request_id`, dan pemetaan kode tidak disalin ke middleware ini. | Tidak — mekanisme teknis. |
| 14 | `/health` ringkasan dipasang `healthSummaryRouter` — router terpisah dari `healthRouter`, bukan digabung. | Probe publik dan endpoint berpermission adalah dua kelas akses berbeda; menyatukannya ke satu router mengaburkan mana yang menuntut apa. | Tidak — mekanisme teknis. |
| 13 | Slot `AuthContext` per-permintaan adalah `res.locals["authContext"]` (akses kurung, `getAuthContext`/`setAuthContext`) — **bukan** augmentasi tipe global `Express.Request`. | Menyamakan pola dengan `res.locals["cspNonce"]` (`PR-00-15`); augmentasi tipe global akan membocorkan bentuk `AuthContext` ke setiap handler di seluruh basis kode meski kebanyakan tidak membutuhkannya. | Tidak — mekanisme teknis. |
| 12 | PR memakai **dua label wajib** — `phase-NN` dan jenis (`feature`/`fix`/`chore`) — ditambah `tinjauan-arsitek` bila berlaku; sembilan label bawaan GitHub dihapus. | Label bawaan (`bug`, `enhancement`, `good first issue`, …) adalah set otomatis GitHub yang tidak mencerminkan alur kerja proyek, dan tidak pernah dipakai di 43 PR. Yang berguna saat menyaring daftar PR justru phase dan jenis — keduanya sudah ada pada ID PR dan nama cabang, sehingga label hanya memindahkannya ke tempat yang dapat disaring. Sengaja **bukan gerbang**: tidak ada workflow yang membacanya, jadi PR tanpa label tidak tertahan. | Ya — `BRANCHING §4.2`, `GITHUB-CI-STATE §4`, `templates/PULL-REQUEST.md`; diputuskan pemilik produk (16 September 2026). |
| 11 | `algorithm: 2` (Argon2id) ditulis sebagai angka, bukan lewat `Algorithm.Argon2id`. | Enum paket bersifat `const enum`, yang tidak dapat diakses saat `verbatimModuleSyntax` aktif. Bahwa hash benar-benar `argon2id` tidak bersandar pada konstanta ini melainkan pada uji yang memeriksa keluarannya. | Tidak. |
| 10 | Parameter Argon2id tetap **konstanta di kode**, dijaga uji yang membandingkannya dengan angka pada `SDD-SESS-01`. | `SDD-04 §6` menyebut parameter dapat diturunkan lewat konfigurasi sebagai mitigasi beban CPU, bukan sebagai kewajiban sekarang; memindahkannya ke env hari ini menambah tiga variabel tanpa satu pun yang menyetelnya. Dipindah bila uji beban `NFR-P-09` menuntut (Phase 08). | Tidak — pelaksanaan; diputuskan pemilik produk (16 September 2026). |
| 9 | Cakupan `NFR-S-03a` dipecah: `PR-01-16` menegakkan panjang ≥ 12, komposisi huruf besar/kecil/angka, dan larangan memuat identitas; **daftar password bocor dan riwayat 3 password terakhir menjadi `PR-02-31`** di Phase 02. Rencana total 164 → **165** PR. | Kedua aturan itu menuntut sumber daftar bocor dan tabel riwayat yang tidak ada di SDD mana pun, dan tidak ada PR yang memilikinya — memasukkannya ke sini menaikkan PR `S` menjadi `M`/`L` sekaligus menyentuh migration. `FR-01.4` sudah milik Phase 02, jadi pemiliknya berdekatan dengan `PR-02-06`. | Tidak — rencana implementasi; diputuskan pemilik produk (16 September 2026); `phase-01.md` §2/§7, `phase-02.md` §2/§7. |
| 8 | Pustaka Argon2id **`@node-rs/argon2` 2.2.1**, ditulis sebagai `SDD-SEC-12`. | Tahap build `Dockerfile` berjalan di `node:22-alpine` tanpa `build-base` (`SDD-INF-02`), sehingga pustaka ber-`node-gyp` menuntut perkakas kompilasi ditambahkan hanya demi satu dependensi; `@node-rs/argon2` menyediakan biner napi `linux-x64-musl` siap pakai. `hash-wasm` ditolak karena lebih lambat pada parameter yang sama. | Ya — `SDD-13` (`SDD-SEC-12`); diputuskan pemilik produk (16 September 2026). |
| 7 | Hash password dan kebijakan kata sandi bermukim di *shared kernel* **`shared/security/`**, ditulis sebagai `SDD-SYS-15` sebelum satu baris kode. | Daftar `SDD-SYS-06` tertutup dan tidak memuatnya, sementara dua modul berbeda memakainya: M-02 membuat akun berpassword sementara dan M-01 memverifikasinya. Menaruhnya di salah satu modul membuat kontrol keamanan bergantung pada modul yang kebetulan lahir lebih dulu. | Ya — `SDD-00` §2 dan §4.1; diputuskan pemilik produk (16 September 2026). |
| 6 | Satu fungsi trigger `set_updated_at()` dipakai bersama tabel entitas domain; `must_change_password` juga **tanpa nilai bawaan**. | `SDD-05 §4.2` mewajibkan trigger pada setiap tabel entitas domain, dan satu fungsi menghindari salinan per tabel. Nilai bawaan pada kolom keamanan mengubah kelalaian pemanggil menjadi keadaan diam-diam — pola keputusan 3 log phase-00. | Tidak. |
| 5 | Keunikan email ditegakkan indeks unik `lower(email)`, bukan `UNIQUE (email)`. | Lampiran E.5.2 menuntut email unik sistem-wide; `Budi@…` dan `budi@…` adalah kotak surat yang sama, dan `UNIQUE` polos meloloskan duplikat yang menyalahi `FR-02.1 A1`. Tanpa ekstensi `citext`, yang tidak dipasang `0001`. | Tidak — cara menegakkan aturan yang sudah ada. |
| 4 | Foto profil **ditunda ke Phase 03**: `users.foto_file_id` → `stored_files(id)` ditambahkan (expand) bersama `PR-03-04`; bagian foto `PR-02-06` menunggu. | `SDD-FS-02` mewajibkan entitas merujuk `stored_files.id`, yang baru lahir di Phase 03; kolom tanpa FK tidak dapat diisi dengan sah sebelum itu. | Tidak — rencana implementasi; diputuskan pemilik produk (15 September 2026); `phase-02.md` §7, `phase-03.md` §7. |
| 3 | `PR-02-01` (hash Argon2id) **dipindah ke Phase 01** sebagai `PR-01-16` dan mendahului `PR-01-02`; ID `PR-02-01` dipensiunkan. `users.password_hash` `NOT NULL`. Phase 01: 16 PR, Phase 02: 28; total tetap 164. | `FR-02.1` langkah 4 membuat akun berpassword sementara di `PR-01-02`, sementara hashing baru ada di Phase 02 yang bergantung Phase 01 — bentuk yang sama dengan keputusan 63 log phase-00. Kolom nullable menyimpang dari langkah 4 selama Phase 01. | Tidak — rencana implementasi; diputuskan pemilik produk (15 September 2026); `phase-01.md` §2/§4/§5/§7, `phase-02.md` §3/§7. |
| 2 | Penanda 2FA adalah **`totp_enabled_at`** (`SDD-04 §4.1`, Phase 02) saja; `PR-01-01` tidak membuat kolom 2FA. Atribut `2fa_enabled`/`two_fa_enabled` di PRD diganti. | Tiga ejaan untuk satu fakta: `2fa_enabled` (tidak sah sebagai identifier SQL), `two_fa_enabled` (ERD), dan `totp_enabled_at`. Boolean dan waktu sekaligus berarti dua penanda yang wajib selalu sinkron tanpa manfaat tambahan. | Ya — PRD tabel entitas `users` dan ERD; diputuskan pemilik produk (15 September 2026). |
| 1 | Kelompok **Status Pengguna** (Aktif, Nonaktif) ditambahkan ke Bab 11.3; `users.status` bertipe enum `user_status` **tanpa nilai bawaan**. | ERD PRD menulis `enum status` dan `FR-02.1` memakai kedua nilai, tetapi Bab 11.3 tidak mendaftarkannya, sementara `SDD-DB-02` mewajibkan native enum — pola `activity_result`/`holiday_type`/`permission_scope`. Tanpa bawaan agar akun siswa tidak diam-diam aktif sebelum persetujuan wali (`SL-06`). | Ya — PRD Bab 11.3; diputuskan pemilik produk (15 September 2026). |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| `PR-01-01` — skema `users` dengan atribut PRD M-02 §8; kode `M` · uji `M`. | Tanpa penanda 2FA, kolom penguncian/TOTP, dan foto; PRD Bab 11.3 dan atribut 2FA disunting pada PR yang sama; `PR-02-01` dipindah menjadi `PR-01-16`. Kode **124** (`S`) · uji **241** (`M`). | Keputusan 1–4: tiga atribut PRD tidak dapat diterapkan apa adanya, dan hashing yang dituntut `PR-01-02` berada di phase sesudahnya. | `PR-01-16` wajib tergabung sebelum `PR-01-02`; foto profil `PR-02-06` menunggu `PR-03-04`. |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-01.md` §7](../phases/phase-01.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| — | — | — |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Titik ekstensi `SL-04` — di mana ia ditinggalkan terbuka (`PR-01-13`); **ditutup di Phase 05 `PR-05-09`**
- [ ] Migrasi `users.unit_kerja` → `work_unit_id`: tahap expand & migrate selesai; **contract ditunda ke `PR-08-11`**
- [ ] Penerapan `SDD-AUTH-11` (uji tiga syarat) dan `SDD-EVT-10` (kartu dead letter baca-saja) — keduanya ditutup 25 Agustus 2026, sebelum phase dimulai

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| `phase-01.md` §5 menulis `SDD-AUTH-05` (`GET /me`) berada dalam kelompok "(middleware otorisasi, `PR-01-15`)", padahal `GET /me` menuntut token terverifikasi nyata dan tercatat sebagai endpoint `m01-auth.md` (Phase 02) — PR-01-15 sendiri bergantung `PR-01-01` saja, tanpa autentikasi. | Pembaca dapat menyimpulkan `PR-01-15` wajib membangun `/me`, padahal mustahil sebelum Phase 02 punya JWT. | **Selesai 16 September 2026**: baris §5 diperbaiki, `SDD-AUTH-05` dipisah dari kelompok dan ditandai milik Phase 02. | tidak |
| Baris rencana `PR-01-16` (warisan `PR-02-01`) merujuk `NFR-S-01`, yang isinya HTTPS/TLS — bukan `NFR-S-02` (hash password) maupun `NFR-S-03a` (kebijakan kata sandi). Rujukan itu ikut terbawa saat PR dipindah ke Phase 01. | PR dapat selesai dan lulus tinjauan tanpa pernah menguji requirement yang sebenarnya dilayaninya; `NFR-S-03a` bahkan tidak dimiliki PR mana pun sampai keputusan 9. | **Selesai 16 September 2026**: `phase-01.md` §4 dan §7 diperbaiki ke `NFR-S-02` dan `NFR-S-03a`, dan sisa `NFR-S-03a` memperoleh pemilik (`PR-02-31`). | tidak |
| `tests/shared/clock-lint.test.ts` merah satu kali pada run penuh (timeout 6,1 detik), lalu hijau saat berkasnya dijalankan sendiri. | Uji yang kadang merah tanpa sebab kode membuat orang mengulang run alih-alih membacanya, dan lama-lama mengabaikan pipeline. | Dibuktikan bukan cacat aturan: memanggil ESLint langsung atas berkas probe tetap menghasilkan `no-restricted-syntax`. Penyebabnya ESLint dijalankan di bawah 27 worker paralel. Dibiarkan apa adanya pada PR ini; bila berulang, yang disesuaikan adalah jumlah worker atau `testTimeout` uji itu, bukan ujinya dihapus. | **ya** |
| Mutation-check pertama atas `MISSING_DIGIT` tidak menyentuh berkas: pola `perl` gagal karena `\d` ikut ditafsirkan shell. | Pengaman itu sempat tampak terbukti padahal ujinya tidak pernah dijalankan terhadap kode yang berubah. | Terlihat karena skrip membandingkan berkas sebelum dan sesudah mutasi lalu berteriak; mutasi diulang dengan pola lain dan memerah. Pelajaran yang sama dengan putaran mutasi `PR-01-01`: mutasi yang tidak mengubah berkas wajib gagal berisik, bukan lolos. | tidak |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| Acceptance `PR-01-01` terhadap PostgreSQL 15 nyata | naik-turun bersih; `role_id` merujuk role hasil seed | **Terbukti** — 14 uji `users.test.ts`: FK ke role `R-07` hasil seed; role tak ada `23503`; tanpa role `23502`; email beda huruf besar `23505`; `nip_nis` ganda `23505`; `status` dan `must_change_password` tanpa bawaan `23502`; status di luar enum `22P02`; kolom persis 15; trigger menimpa `updated_at` yang dipaksakan pada `users` dan `roles`; `roles.created_by` → `users`; akun `sigm4_app` menulis tanpa GRANT susulan. `down` mencabut tabel, 4 kolom baku, fungsi, dan tipe tanpa menyentuh 7 role dan grant seed; `up` memulihkannya | `FR-02.1`, `BR-066`, `SDD-05 §4.2/§4.7`, `CD-05` |
| Mutation-check `0012` | setiap pengaman merah bila dicabut | trigger `users` dicabut → 1 uji merah · trigger `roles` → 1 · indeks `lower(email)` menjadi `(email)` → 1 · `status DEFAULT 'AKTIF'` → 1 · `down` tanpa pencabutan kolom `roles` → 1. Putaran pertama **tidak sah**: `migrate.mjs` dipanggil dari direktori yang salah sehingga tiap putaran menguji mutasi sebelumnya; diulang terisolasi dengan `0012` dibersihkan di antara mutasi | `SDD-05 §4.2`, `SL-06`, `FR-02.1 A1` |
| Gerbang CI lokal (`test:ci`) | cakupan ≥ 70%, 0 ter-skip | **41 berkas / 441 uji**, 0 ter-skip; **97,96%** statements · **98,13%** lines · 91,70% branches · 97,61% functions. Uji berkas 306/306; lint, typecheck, `check:boundaries` hijau | `CD-01`, `CD-02` |
| Baris kode produksi vs uji, `PR-01-01` | kode `M` · uji `M` (§7) | **124** (`S`: migration 85, tipe Kysely 39) / **241** (`M`) — kode meleset satu kelas ke bawah karena kolom autentikasi dan foto tidak masuk (keputusan 2, 4) | kalibrasi §7 |
| Acceptance `PR-01-15`: tanpa `AuthContext` → 401, tanpa permission → 403, keduanya sebelum controller | keduanya | **Terbukti** — 10 uji `middleware.test.ts` (unit) + 3×1 uji `sec-t-01.test.ts` (tergenerate atas `registry.guarded()`, saat ini 1 route: `GET /health`) + 1 uji HTTP penuh lewat `createApp()` tanpa konteks apa pun → `401 UNAUTHENTICATED`. Mutation-check: pemeriksaan `ctx===undefined` dicabut → 2 uji merah · pemeriksaan `ctx.can` dicabut → 3 · kode galat ditukar ke `FORBIDDEN` → 2 · `allowedFields` selalu buka `extra` → 2 uji merah | `PM-02`, `SDD-03 §4.4`, `SEC-T-01` |
| Baris kode produksi vs uji, `PR-01-15` | kode `M` · uji `M` (§7) | **124** (`S`: `middleware.ts` 45, `fields.ts` 29, perubahan `health.ts`+`index.ts`+`auth/index.ts` 50) / **313** (`L`) — kode meleset satu kelas ke bawah: tidak ada `authenticate` maupun cache permission di PR ini (keputusan 63 log phase-00 sudah membatasi cakupannya) | kalibrasi §7 |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-01.md` §9 dan §12](../phases/phase-01.md).

- [ ] Seluruh 16 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| `users.foto_file_id` → `stored_files(id)` (foto profil `FR-01.4`) | `PR-03-04` (keputusan 4) | `stored_files` belum ada (`SDD-FS-02`) |
| Daftar password bocor + riwayat 3 password terakhir (`NFR-S-03a`) | `PR-02-31` (keputusan 9) | Menuntut sumber daftar dan tabel riwayat yang belum ditetapkan SDD mana pun |
| `failed_login_count`, `locked_until`, `totp_secret_enc`, `totp_enabled_at` pada `users` | `PR-02-03`, `PR-02-07` (`SDD-04 §4.1`) | Kolom autentikasi milik Phase 02 |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
