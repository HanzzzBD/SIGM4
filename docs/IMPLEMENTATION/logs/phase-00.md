# Log Phase 00 — Foundation

| | |
|---|---|
| **Phase** | [`phases/phase-00.md`](../phases/phase-00.md) |
| **Milestone PRD** | `M0` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | 6 September 2026 |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-00.md`](../phases/phase-00.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 6 September 2026 | `PR-00-01` tergabung ke `develop`: monorepo `apps/*` dan `packages/schemas`, TypeScript, lint, serta uji batas antar-pohon dan lapisan tersedia. | [#6](https://github.com/HanzzzBD/SIGM4/pull/6) |
| 6 September 2026 | `PR-00-02` tergabung ke `develop`: batas impor antar-modul ditambahkan; uji negatif `check_import_boundaries.mjs` lulus 10 dari 10 kasus. | [#9](https://github.com/HanzzzBD/SIGM4/pull/9) |
| 6 September 2026 | `PR-00-03` tergabung ke `develop`: Dockerfile multi-stage + compose pengembangan. | [#11](https://github.com/HanzzzBD/SIGM4/pull/11) |
| 6 September 2026 | Audit keputusan stack sebelum `PR-00-04`. Empat celah ditemukan — perkakas yang dirujuk rencana PR tetapi tidak pernah dinyatakan di berkas mana pun — lalu ditutup pemilik produk pada hari yang sama: `SDD-DB-15`, `SDD-REPO-11`, `SDD-INF-12`, `SDD-FE-13`. Tidak ada requirement, business rule, maupun kriteria penerimaan yang berubah. | — |
| 6 September 2026 | Sapuan audit **kedua** atas sisa `docs/`, dijalankan setelah sapuan pertama selesai. Sembilan celah lagi dengan pola sama ditemukan dan ditutup hari itu juga: `SDD-INF-13`, `SDD-SEC-11`, `SDD-API-13`, `SDD-FE-14/15/16`, `SDD-MOB-11/12`, `SDD-FS-12`. Tiga di antaranya memblokir `PR-00-09`, `PR-00-17`, dan `PR-00-18`. | — |
| 6 September 2026 | Sapuan audit **ketiga**, atas lima butir menggantung di luar keputusan stack. Tiga ditutup: `SDD-SYS-10` (letak `SlotService`), proteksi cabang `main`/`develop` dinyalakan, dan `TS5083` diperbaiki di cabang `chore/`. Dua tetap terbuka karena bergantung pihak luar — nomor surat `SDD-AI-16` dan pemilik `CODEOWNERS`. | — |
| 7 September 2026 | `PR-00-04` dibuka: `shared/auth` (`AuthContext`) dan `shared/db` (koneksi Kysely+`pg`, `withTransaction`, `BaseRepository`). Vitest dipasang di `apps/api` karena inilah PR pertama yang menulis uji — `npm run test` di akar kini bermakna (`SDD-17 §4.4`). 28 uji lulus; gerbang kompilasi `ScopedRepository` dibuktikan dengan mencabut batasannya (4 `@ts-expect-error` berubah merah). | — |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 5 | Berkas uji `apps/api` diletakkan di `apps/api/tests/`, di luar `rootDir` build (`./src`), dan di-*typecheck* proyek terpisah `tsconfig.test.json` yang dijalankan `npm run test -w apps/api` sebelum Vitest. | Uji di dalam `src/` akan ikut ter-*emit* ke `dist/` dan masuk image produksi — dilarang `CLAUDE.md` ("tidak ada data uji pada jalur produksi"). Kompilasi terpisah itu juga yang **menjadikan** acceptance `PR-00-04` sebuah gerbang: uji negatifnya berupa `@ts-expect-error`, yang hanya menolak sesuatu bila ada yang benar-benar mengkompilasinya. | Tidak — `SDD-17 §4.1` menyatakan hanya tingkat yang dimilikinya, dan letak berkas uji tidak termasuk. |
| 4 | Vitest dipasang di `apps/api` pada `PR-00-04`, bukan menunggu `PR-00-17`. | `SDD-REPO-11` sudah memilih perkakasnya; yang menjadi milik `PR-00-17` adalah *tahap pipeline*-nya, bukan pemasangan runner-nya. Acceptance `PR-00-04` dan DoD 29.5 sama-sama menuntut uji, dan PR pertama yang menulis uji adalah PR yang harus menyediakan cara menjalankannya. | Tidak — perkakasnya sudah ditetapkan `SDD-REPO-11`. |
| 3 | `AuthContext.scopeOf()` **melempar** untuk permission yang tidak dipegang, alih-alih mengembalikan scope bawaan. | Nilai bawaan di titik ini mengubah kelalaian pemanggil menjadi kebocoran diam-diam — persis kelas kesalahan yang `SDD-AUTH-02` hilangkan dengan mewajibkan `ctx`. Diuji dengan tiga syarat `SDD-AUTH-11` dan lolos ketiganya: tidak ada perilaku pengguna yang berubah, tidak ada baris baru pada empat katalog, dan ia semata cara memenuhi `PM-03`. | Tidak — mekanisme teknis, lolos uji tiga syarat `SDD-AUTH-11`. |
| 2 | Audit stack 6 September 2026 tidak menghasilkan keputusan di log ini. Keempat celah dinaikkan lebih dulu ke SDD pemiliknya (`SDD-DB-15`, `SDD-REPO-11`, `SDD-INF-12`, `SDD-FE-13`) dan dicatat di [`TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md) sebagai `TBD-DB-B`, `TBD-QA-A`, `TBD-INF-C`, `TBD-FE-C` — dibuka dan ditutup pada hari yang sama. | Ketiganya menyentuh bentuk kode dan perkakas, bukan requirement, sehingga masuk kelompok C. Menuliskannya hanya di log akan membuat `PR-00-04` dan `PR-00-05` berdiri di atas keputusan yang tidak beralamat ID. | Ya — sudah dinaikkan; log ini hanya mencatat bahwa hal itu terjadi. |
| 1 | Cuplikan Dockerfile `SDD-16 §4.1` diadaptasi ke tata letak monorepo saat `PR-00-03`: seluruh manifest workspace disalin sebelum `npm ci`, tahap runtime ikut menyalin manifest dan `dist` tiap workspace yang dipakainya, dan hanya `apps/api` yang dibangun. | Cuplikan itu ditulis untuk satu paket, sebelum `SDD-17` menetapkan monorepo. `npm ci` menolak berjalan tanpa seluruh manifest yang disebut `package-lock.json`; `node_modules` datar menaruh `@sigm4/schemas` sebagai symlink, sehingga tanpa direktori tujuannya impor gagal saat proses dinyalakan. Ketiga perintah inti (`npm ci`, `npm run build`, `npm prune --omit=dev`) tetap dipakai apa adanya sesuai `SDD-REPO-03`. | Tidak — bentuknya sudah ditetapkan `SDD-REPO-03`/`SDD-REPO-09`. Yang tertinggal adalah cuplikan `SDD-16 §4.1`; penyelarasannya diusulkan sebagai suntingan SDD tersendiri, bukan bagian PR implementasi. |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| `PR-00-04` direncanakan berkompleksitas **M** (≤ 400 baris berubah) — [`phase-00.md` §7](../phases/phase-00.md). | Terkirim **L**: 546 baris berubah di luar `package-lock.json`. Scope-nya tidak melebar — keempat butir §8 persis — tetapi 245 baris di antaranya adalah uji dan ±90 baris komentar penelusuran ID yang diwajibkan `CLAUDE.md`. | Estimasi M dibuat sebelum `SDD-DB-15` dan `SDD-REPO-11` ditetapkan (6 September 2026), sehingga tidak memperhitungkan pemasangan Vitest maupun empat berkas uji. | Tidak ada; scope `PR-00-05` tidak berubah. Pelajarannya untuk perencanaan phase berikutnya: PR pertama yang memperkenalkan sebuah perkakas menanggung biaya pemasangannya, dan estimasi §7 belum mencerminkan itu. |
| `develop` direncanakan berdiri bersama `staging` pada `PR-00-18`. | `develop` dibuat manual dari `main` pada 6 September 2026 saat pemulihan cabang; jalur kerja sejak itu `feature/*` → PR → `develop`. `staging` tetap scope `PR-00-18`. | Cabang `main` lokal sempat menyimpang dari `origin/main`; pemulihan memerlukan cabang integrasi lebih dahulu. | Tidak mengubah scope Phase 00; `BRANCHING-STRATEGY.md` dan `GITHUB-CI-STATE.md` disegarkan agar keadaan aktual tidak disamarkan. |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-00.md` §7](../phases/phase-00.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| `chore/tsconfig-akar-typecheck` | `tsconfig.json` akar agar `npm run typecheck` hijau | Bukan PR bernomor. `TS5083` sudah ada sejak `PR-00-01` dan tercatat di §7, tetapi berada di luar scope `PR-00-02` maupun `PR-00-03`; memasukkannya ke salah satunya akan mencampur perbaikan perkakas dengan pekerjaan yang sedang ditinjau (`CLAUDE.md` — "sekalian rapikan"). `PR-00-17` menuntut perintah ini hijau, jadi ia tidak dapat menunggu lebih lama. |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Runner migration **dbmate** (`SDD-DB-12`) dibuktikan memenuhi kedua syaratnya di `PR-00-05` — opt-out transaksi per-migration dan *advisory lock*. Nama yang dikunci tidak menggantikan pembuktian
- [ ] Tipe tabel Kysely (`SDD-DB-15`) disegarkan pada PR yang sama dengan migration yang mengubah bentuk tabel — tidak pernah tertinggal ke PR berikutnya
- [ ] Perpanjangan sertifikat certbot (`SDD-INF-13`, `INF-06`) terpantau alarm — kegagalannya tidak boleh baru diketahui saat sertifikat kedaluwarsa
- [ ] *Readiness gate* `SDD-INF-04` dibuktikan di staging: Nginx OSS hanya memeriksa upstream secara **pasif**, sehingga gerbangnya sepenuhnya bersandar pada skrip deploy `SDD-INF-10`
- [ ] Ukuran image setelah Chromium masuk (`SDD-FS-12`) diukur dan dicatat di §8 — bila menjadi persoalan, jalannya memisahkan image (`SDD-INF-01`), bukan mengganti pembangkit PDF
- [ ] `CODEOWNERS` diganti tim arsitek, lalu *required approvals* dan *Code Owners review* dinyalakan bersamaan (`GITHUB-CI-STATE §4`) — keduanya sengaja mati selama pemiliknya satu orang
- [ ] Nomor surat persetujuan lintas yurisdiksi (`SDD-AI-16`) dilengkapi sebelum `GL-07` diperiksa — pelacakannya sudah ada di `phase-08.md` §8/§9 dan `RELEASE-PLAN.md` §2
- [ ] Pembangkitan OpenAPI dari skema Zod berjalan (`SDD-API-11`, `SDD-API-02`) dan `/api/docs` tidak aktif di produksi (`SDD-API-12`)
- [ ] Perkakas observability terpasang sesuai `SDD-OBS-09`, dan penyedianya **ber-region Indonesia** (`SDD-OBS-10`, `SDD-SEC-10`) — region diverifikasi sebelum kontrak, bukan sesudahnya
- [ ] Koreografi deploy `SDD-INF-10` teruji di staging — penggantian instance API satu per satu dan drain worker
- [ ] Penyediaan mengikuti `SDD-INF-11` — VPS ber-region Indonesia + PostgreSQL terkelola; ketersediaan `btree_gist` diverifikasi sebelum langganan dibuka (§10 `phases/phase-00.md`)

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| `TBD-DB-B` | `SDD-DB-15` — akses data memakai **Kysely + `pg`**; skema tetap milik berkas `.sql` (`SDD-DB-08`) | Pemilik produk | 6 September 2026 |
| `TBD-QA-A` | `SDD-REPO-11` — **Vitest** (unit & integration) · **Playwright** (E2E Web) · **Maestro** (E2E Mobile) | Pemilik produk | 6 September 2026 |
| `TBD-INF-C` | `SDD-INF-12` — penyedia CI/CD adalah **GitHub Actions** | Pemilik produk | 6 September 2026 |
| `TBD-FE-C` | `SDD-FE-13` — **Radix UI** bawaan; **React Aria** hanya untuk tanggal/kalender dan number field | Pemilik produk | 6 September 2026 |
| `TBD-INF-D` | `SDD-INF-13` — *reverse proxy* **Nginx**; certbot sebagai komponen tersendiri | Pemilik produk | 6 September 2026 |
| `TBD-SEC-C` | `SDD-SEC-11` — **CodeQL · Dependabot · Trivy · OWASP ZAP** | Pemilik produk | 6 September 2026 |
| `TBD-API-C` | `SDD-API-13` — **`zod-openapi`** lewat registri route `PR-00-09` | Pemilik produk | 6 September 2026 |
| `TBD-FE-D` | `SDD-FE-14` — **Vite**, satu konfigurasi dengan Vitest | Pemilik produk | 6 September 2026 |
| `TBD-FE-E` | `SDD-FE-15` — **TanStack Router** | Pemilik produk | 6 September 2026 |
| `TBD-FE-F` | `SDD-FE-16` — **axios**, identik di web dan mobile | Pemilik produk | 6 September 2026 |
| `TBD-MOB-C` | `SDD-MOB-11` — **expo-sqlite** untuk antrean unggah | Pemilik produk | 6 September 2026 |
| `TBD-MOB-D` | `SDD-MOB-12` — **expo-router** | Pemilik produk | 6 September 2026 |
| `TBD-FS-C` | `SDD-FS-12` — **Playwright (Chromium)** HTML → PDF | Pemilik produk | 6 September 2026 |
| `TBD-SYS-A` | `SDD-SYS-10` — `SlotService` di *shared kernel* `shared/booking/`; `SDD-SYS-06` disunting | Pemilik produk | 6 September 2026 |

Ketiga belasnya dibuka dan ditutup pada hari yang sama, dalam dua sapuan. Yang dicatat bukan penundaannya melainkan **temuannya**: `SDD-DB-12` menyebut "kelas dbmate/Postgrator" tanpa nama, `PRD 30` menetapkan ambang cakupan tanpa alat pengukur, `SDD-17 §4.1` menetapkan letak workflow tanpa penyedianya, dan `SDD-FE-12` menulis "Radix UI / React Aria" dengan garis miring. Empat kali pola yang sama — kelas keputusan ditulis, anggotanya tidak — dan keempatnya baru terlihat saat PR yang memakainya hendak dikerjakan. Sapuan kedua atas sisa `docs/` menemukan sembilan lagi dengan pola identik; satu di antaranya (`INF-06` "Nginx/Caddy") bahkan sudah berselisih dengan dua berkas yang menulis "Nginx" dalam prosa. **Temuan yang sebenarnya bukan ketiga belas perkakasnya, melainkan bahwa pola ini tidak terdeteksi sampai ada yang menyisirnya** — tidak ada validator yang menangkap kelas keputusan tanpa anggota.

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| `npm run typecheck` di akar gagal: `TS5083`, `tsconfig.json` akar tidak ada. | Validasi typecheck akar belum dapat dijalankan; lint dan build per-workspace tetap hijau. | **Selesai 6 September 2026** lewat cabang `chore/tsconfig-akar-typecheck`: berkas solution akar (`files: []` + `references` ke empat proyek) ditambahkan. Tidak ada compiler option baru — `composite: true` sudah ada di `tsconfig.base.json`. `typecheck`, `lint`, `build`, dan `check:boundaries` hijau. | tidak |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-00.md` §9 dan §12](../phases/phase-00.md).

- [ ] Seluruh 18 PR tergabung
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
