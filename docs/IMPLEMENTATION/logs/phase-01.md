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
| 15 September 2026 | `PR-01-01` dibuka di `feature/PR-01-01-skema-users`. Sebelum migration ditulis, empat titik ternyata tidak dapat diterapkan dari docs apa adanya dan dinaikkan ke pemilik produk (keputusan 1–4): Bab 11.3 tidak mendaftarkan status pengguna, penanda 2FA berejaan tiga, akun berpassword sementara lahir sebelum hashing Argon2id tersedia, dan foto profil menuntut `stored_files` yang belum ada. | [#42](https://github.com/HanzzzBD/SIGM4/pull/42) |
| 15 September 2026 | Rencana disunting sebelum phase dimulai: middleware otorisasi `PR-02-09` dipindah menjadi `PR-01-15` dan mendahului seluruh PR endpoint (keputusan 63). Phase 01 boleh dimulai selagi Phase 00 `In Review`, lewat `DELIVERY-PLAN §10` butir 1 (keputusan 62). Keduanya dicatat di [log phase-00 §2](phase-00.md). | — |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
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
| — | — | — | — |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| Acceptance `PR-01-01` terhadap PostgreSQL 15 nyata | naik-turun bersih; `role_id` merujuk role hasil seed | **Terbukti** — 14 uji `users.test.ts`: FK ke role `R-07` hasil seed; role tak ada `23503`; tanpa role `23502`; email beda huruf besar `23505`; `nip_nis` ganda `23505`; `status` dan `must_change_password` tanpa bawaan `23502`; status di luar enum `22P02`; kolom persis 15; trigger menimpa `updated_at` yang dipaksakan pada `users` dan `roles`; `roles.created_by` → `users`; akun `sigm4_app` menulis tanpa GRANT susulan. `down` mencabut tabel, 4 kolom baku, fungsi, dan tipe tanpa menyentuh 7 role dan grant seed; `up` memulihkannya | `FR-02.1`, `BR-066`, `SDD-05 §4.2/§4.7`, `CD-05` |
| Mutation-check `0012` | setiap pengaman merah bila dicabut | trigger `users` dicabut → 1 uji merah · trigger `roles` → 1 · indeks `lower(email)` menjadi `(email)` → 1 · `status DEFAULT 'AKTIF'` → 1 · `down` tanpa pencabutan kolom `roles` → 1. Putaran pertama **tidak sah**: `migrate.mjs` dipanggil dari direktori yang salah sehingga tiap putaran menguji mutasi sebelumnya; diulang terisolasi dengan `0012` dibersihkan di antara mutasi | `SDD-05 §4.2`, `SL-06`, `FR-02.1 A1` |
| Gerbang CI lokal (`test:ci`) | cakupan ≥ 70%, 0 ter-skip | **41 berkas / 441 uji**, 0 ter-skip; **97,96%** statements · **98,13%** lines · 91,70% branches · 97,61% functions. Uji berkas 306/306; lint, typecheck, `check:boundaries` hijau | `CD-01`, `CD-02` |
| Baris kode produksi vs uji, `PR-01-01` | kode `M` · uji `M` (§7) | **124** (`S`: migration 85, tipe Kysely 39) / **241** (`M`) — kode meleset satu kelas ke bawah karena kolom autentikasi dan foto tidak masuk (keputusan 2, 4) | kalibrasi §7 |

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
| `failed_login_count`, `locked_until`, `totp_secret_enc`, `totp_enabled_at` pada `users` | `PR-02-03`, `PR-02-07` (`SDD-04 §4.1`) | Kolom autentikasi milik Phase 02 |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
