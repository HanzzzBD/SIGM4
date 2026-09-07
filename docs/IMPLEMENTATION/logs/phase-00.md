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
| 7 September 2026 | `PR-00-10` dibuka: `0005_idempotency_keys.sql` + `runIdempotent`. Acceptance dibuktikan terhadap PostgreSQL nyata untuk ketiga jalur `ID-03`/`ID-04`/`ID-05`. Uji sendiri menangkap satu bug nyata: kunci **kedaluwarsa** tidak terbaca `SELECT` tetapi barisnya masih ada, sehingga `INSERT` polos menabrak primary key — diperbaiki dengan `ON CONFLICT DO UPDATE`. | — |
| 7 September 2026 | `PR-00-09` tergabung ke `develop`. | [#24](https://github.com/HanzzzBD/SIGM4/pull/24) |
| 7 September 2026 | `PR-00-09` dibuka: `shared/http/` (`defineRoute`, `RouteRegistry`) + generator OpenAPI di `api/`. Acceptance dijaga **dua lapis** — tipe menolaknya saat kompilasi, `validateOrThrow` menolaknya saat runtime. Mencabut lapis runtime membuat 4 uji merah; mencabut lapis tipe menggagalkan typecheck sebelum uji berjalan. | — |
| 7 September 2026 | `PR-00-08` tergabung ke `develop`. | [#23](https://github.com/HanzzzBD/SIGM4/pull/23) |
| 7 September 2026 | `PR-00-08` dibuka: `0004_work_calendar.sql` (`work_days`, `holidays`, enum `holiday_type`) + `BusinessCalendarService`. Acceptance dibuktikan terhadap PostgreSQL nyata; mencabut penanganan `holidays` membuat 6 uji merah, mencabut offset WIB membuat **14** uji merah. | — |
| 7 September 2026 | `PR-00-07` tergabung ke `develop`; `#22` (pemisahan estimasi §7) juga tergabung. | [#21](https://github.com/HanzzzBD/SIGM4/pull/21) · [#22](https://github.com/HanzzzBD/SIGM4/pull/22) |
| 7 September 2026 | `PR-00-07` dibuka: `document_counters` (0003) + `DocumentNumberService`. Acceptance dibuktikan terhadap PostgreSQL nyata — **1.000 permintaan paralel menghasilkan 1.000 nomor unik, berurutan 1–1000 tanpa lompatan, dalam 1,27 detik**. Menukar `ON CONFLICT DO UPDATE` dengan baca-lalu-tulis (pola yang `SEQ-02` larang) membuat dua uji paralel merah. | — |
| 7 September 2026 | `PR-00-06` tergabung ke `develop`. | [#20](https://github.com/HanzzzBD/SIGM4/pull/20) |
| 7 September 2026 | `PR-00-06` dibuka: `Clock` (`SDD-SYS-07`), katalog kode galat + `ErrorMapper` (`SDD-06 §4.4`), `RequestContext`, dan logger terstruktur ber-*redaction*. Aturan lint `no-restricted-syntax` menolak `new Date()` **dan** `Date.now()` di luar `shared/clock`. 88 uji berkas lulus; kedua gerbang acceptance dibuktikan dengan mencabut logikanya. | — |
| 7 September 2026 | `PR-00-04` tergabung ke `develop`. | [#14](https://github.com/HanzzzBD/SIGM4/pull/14) |
| 7 September 2026 | `PR-00-05` dibuka: dbmate ber-pembungkus advisory lock, `0001_extensions.sql` (btree_gist, pgcrypto), `0002_enums.sql` (**27** tipe enum). Diverifikasi terhadap PostgreSQL 15 nyata: 27 tipe terbentuk dengan nilai identik Bab 11.3, exclusion constraint gaya `SDD-01 §4.1` benar-benar dapat dibuat dan menolak irisan dengan `23P01`, serta siklus `down`→`up` bersih. 44 uji berkas + 9 uji integrasi lulus. | — |
| 7 September 2026 | `PR-00-05` dan kedua sapuan audit tergabung ke `develop` lewat `#18`. `#16` dan `#17` sempat berstatus *merged* tetapi tergabung ke cabang antara, bukan ke `develop`; cabang itu lalu dihapus sehingga isinya sempat yatim di remote. Dipulihkan dari salinan lokal dengan dua kali *rebase*, diverifikasi pohon berkasnya identik byte-per-byte sebelum dan sesudah. | [#18](https://github.com/HanzzzBD/SIGM4/pull/18) |
| 7 September 2026 | **Sapuan kedua audit**, atas area yang sapuan pertama sentuh tipis: kolom tabel SDD vs atribut entitas PRD, traceability, nama role, dan ID menggantung. Lima mismatch lagi ditemukan, lima keputusan pemilik produk. Terbesar: kolom waktu-dibuat punya **tiga** ejaan di 13 tabel SDD (`created_at`, `dibuat_pada`, `waktu`) sementara `SDD-05 §4.2` mewajibkan satu — dan tidak satu pun tabel memenuhi aturannya sendiri. ID menggantung: **0** dari 786 ID terdefinisi. | — |
| 7 September 2026 | **Audit konsistensi lintas dokumen** atas seluruh `docs/` (±24.000 baris, 7 kategori). Tujuh pertentangan menuntut keputusan pemilik produk dan seluruhnya ditutup hari itu; tiga lagi diperbaiki langsung karena aturan otoritatifnya sudah tegas. Temuan terbesar: katalog Lampiran C berisi **79** kode permission sementara enam tempat menulis 78 — riwayat git menunjukkan selisih itu **selalu satu sejak commit pertama**, jadi hitungannya memang tidak pernah benar. | — |
| 7 September 2026 | Verifikasi `SDD-DB-12` di `PR-00-05` menemukan dbmate 2.35.1 **tidak mengambil advisory lock**: `pg_locks` kosong pada 5 sampel berturut sementara migration `pg_sleep(6)` terbukti aktif, dan CLI-nya tidak punya opsi lock. Opt-out transaksi terbukti ada (`25001` tanpa `transaction:false`, berhasil dengannya). Dinaikkan ke pemilik produk; diputuskan mempertahankan dbmate dan memindahkan lock ke pembungkus. `SDD-DB-12` disunting. | — |
| 7 September 2026 | Persiapan `PR-00-05` menemukan dua pertentangan di dalam docs, dinaikkan ke pemilik produk sebelum satu baris migration ditulis: (1) `booking_status` ditulis `'Tentative'` di `SDD-01 §4.1` dan `PRD 26.2` padahal `SDD-DB-02` mewajibkan kode huruf besar; (2) `Bab 11.3` mendaftarkan "Kanal Notifikasi" sebagai enum sedangkan `SDD-08 §4.1` mendeklarasikan kolomnya `text`. Keduanya diputuskan ke huruf besar; docs diselaraskan lebih dulu di cabang `chore/`. | — |
| 7 September 2026 | `PR-00-04` dibuka: `shared/auth` (`AuthContext`) dan `shared/db` (koneksi Kysely+`pg`, `withTransaction`, `BaseRepository`). Vitest dipasang di `apps/api` karena inilah PR pertama yang menulis uji — `npm run test` di akar kini bermakna (`SDD-17 §4.4`). 28 uji lulus; gerbang kompilasi `ScopedRepository` dibuktikan dengan mencabut batasannya (4 `@ts-expect-error` berubah merah). | [#14](https://github.com/HanzzzBD/SIGM4/pull/14) |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 14 | `ID-05` (`409 REQUEST_IN_PROGRESS`) tidak dapat tercapai oleh alur `SDD-01 §4.4`: kunci pemblokir + satu transaksi (`SDD-AVL-08`) membuat baris ber-`status_code NULL` tidak pernah terlihat sesi lain, sehingga cabang itu kode mati. Dinaikkan ke pemilik produk lebih dulu; diputuskan `pg_try_advisory_xact_lock`, dan `SDD-01 §4.4` dikoreksi pada commit pertama PR ini. | Selain membuat `ID-05` mustahil, kunci pemblokir menahan satu koneksi pool selama bisnis berjalan. Mutation-check membuktikannya bukan teori: mengembalikan kunci ke versi pemblokir membuat **lima uji timeout 60 detik**. | Ya — sudah dinaikkan dan diputuskan; log ini hanya mencatat bahwa hal itu terjadi. |
| 13 | Registri route tidak punya rumah: `SDD-06 §4.6` menaruh deklarasi route di `modules/*/routes.ts`, `SDD-00 §4.2` hanya mengizinkan `modules/*` mengimpor `shared/*`, dan daftar tertutup `SDD-SYS-06` (10 anggota sejak `SDD-SYS-11`) tidak memuatnya. Dinaikkan ke pemilik produk lebih dulu; diputuskan `shared/http/`, ditulis sebagai `SDD-SYS-12` pada commit pertama PR ini. Generator OpenAPI **tidak** ikut — ia tinggal di `api/`. | Menaruh `defineRoute` di `api/` membuat seluruh modul tidak dapat mendeklarasikan route-nya. Satu folder dipilih agar rantai middleware `SDD-06 §4.2` yang `PR-00-10`/`PR-00-15` perluas tidak menuntut suntingan daftar tertutup lagi. | Ya — sudah dinaikkan dan diputuskan; log ini hanya mencatat bahwa hal itu terjadi. |
| 12 | Tabel `holidays` diklaim **dua PR di dua phase** — `PR-00-08` (judul §7) dan `PR-01-11` (judul §7 serta scope §2) — sementara `academic_year_id` miliknya menunjuk `academic_years` yang baru lahir di `PR-01-11`. Dinaikkan ke pemilik produk lebih dulu; diputuskan `PR-00-08` membuat `work_days` + `holidays` **tanpa** FK itu, dan `PR-01-11` menambahkannya sebagai migration `expand`. | `PR-00-08` tidak dapat membuat `holidays` utuh karena tabel rujukan FK-nya belum ada, tetapi menundanya seluruhnya membuat acceptance-nya tidak dapat dibuktikan — separuhnya persis tentang hari libur. Dua PR yang membuat tabel sama juga akan bertabrakan sebagai dua `CREATE TABLE`. | Ya — sudah dinaikkan dan diputuskan; log ini hanya mencatat bahwa hal itu terjadi. |
| 11 | Kolom `Kompleksitas` pada §7 kesembilan phase dipecah menjadi **`Kode`** dan **`Uji`**. Nilai `Kode` dipertahankan apa adanya; `Uji` diturunkan aturan yang dikalibrasi terhadap empat PR Phase 00 yang sudah terukur dan mereproduksi keempatnya. Definisi kanoniknya di [`PHASE-TEMPLATE.md`](../templates/PHASE-TEMPLATE.md); `DELIVERY-PLAN.md` dan `CLAUDE.md` menunjuk ke sana. | Empat PR berturut "meleset" dari perkiraannya, padahal setiap kali kode produksinya berada di dalam batas — `PR-00-07` membuktikannya paling tajam: diperkirakan `S`, terkirim 417 baris, kode produksinya **134**. Perkiraannya benar; yang keliru adalah membaca satu angka sebagai dua hal. Dibiarkan, angka §7 akan berhenti dipercaya justru saat Phase 01 mulai memakainya. | Tidak — bentuk tabel perencanaan, bukan requirement maupun keputusan desain. Skalanya sendiri tidak berubah. |
| 10 | Katalog prefiks `SEQ-04` tidak cocok dengan entitas bernomor **di dua arah**: `material_requests` (M-22) punya kolom `nomor` tanpa prefiks, sementara `OPN` punya prefiks tanpa entitas penyimpan. Dinaikkan ke pemilik produk lebih dulu; diputuskan melengkapi keduanya — `PMB` ditambahkan dan `audit_sessions` memperoleh kolom `nomor` — lalu `PRD 26` memperoleh **tabel pemilik prefiks** agar celah semacam ini terlihat sebagai baris kosong, bukan tersembunyi di dalam regex. | Tanpa prefiks bahan, `NT-50` tidak punya nomor untuk dirender dan M-22 terhalang di Phase 05. Tanpa kolom penyimpan, nomor `OPN` tidak dapat bertahan — `SEQ-02` mewajibkannya lahir dari penghitung basis data, bukan dirakit ulang setiap PDF dibuat. | Ya — sudah dinaikkan dan diputuskan; log ini hanya mencatat bahwa hal itu terjadi. |
| 9 | `Logger` dan `RequestContext` tidak punya rumah: `SDD-SYS-06` mendaftar isi *shared kernel* sebagai daftar **tertutup** berisi delapan anggota, dan pohon `SDD-00 §4.1` tidak punya foldernya — padahal `phase-00.md §7` menugaskan keduanya ke `PR-00-06`. Dinaikkan ke pemilik produk lebih dulu; diputuskan `shared/observability/`, dan `SDD-SYS-11` ditulis sebagai commit **pertama** PR ini, sebelum satu baris kode. | Menaruhnya di `api/` mustahil — `SDD-SYS-02` melarang `shared/*` dan `modules/*` mengimpor entrypoint, sehingga seluruh kernel dan seluruh modul menjadi tidak dapat mencatat log; `SDD-OBS-03` juga menuntut `request_id` sampai ke worker. Satu folder dipilih agar metrik (`SDD-OBS-05`) dan tracing (`SDD-OBS-08`) Phase 08 tidak menuntut suntingan daftar tertutup dua kali lagi. | Ya — sudah dinaikkan dan diputuskan; log ini hanya mencatat bahwa hal itu terjadi. |
| 8 | Sapuan kedua audit tidak menghasilkan keputusan di log ini. Lima pertentangan dinaikkan lebih dulu dan diterapkan setelah dijawab: `stored_files.scan_status` (PRD kehilangan `FAILED`), `path` vs `object_key`, `notifications.kanal`/`dikirim_pada` yang sebenarnya milik `notification_deliveries`, penyeragaman `created_at`/`created_by` beserta perjelasan cakupan `§4.2`, dan tiga kolom domain berbahasa Inggris (`verified_by`/`verified_at`/`last_login_at`). | Seluruhnya kontrak data yang akan menjadi migration Phase 01–05. Aturan `§4.2` yang dilanggar oleh ke-13 contohnya sendiri tidak akan menahan apa pun; memperjelas cakupannya lebih jujur daripada membiarkannya. | Ya — seluruhnya sudah dinaikkan dan diputuskan. |
| 7 | Audit konsistensi lintas dokumen 7 September 2026 tidak menghasilkan keputusan di log ini. Tujuh pertentangan dinaikkan ke pemilik produk lebih dulu lewat pertanyaan berstruktur (konflik · sumber A · sumber B · dampak · rekomendasi · konsekuensi tiap opsi), lalu keputusannya diterapkan ke berkas pemiliknya: `SDD-DB-02` (himpunan nilai tetap = native enum huruf besar), `stocktake_result` (enum 5, kolom dibatasi 4), pemetaan kelompok notifikasi (52 dari 52), katalog kode galat (tertutup, 22 → 25), dua endpoint yang hanya hidup di diagram, jumlah permission 78 → 79, dan otorisasi `/health*`. | Ketujuhnya menyentuh kontrak data, kontrak klien, atau katalog ber-satu-pemilik — bukan bentuk kode. Memutuskannya di dalam PR implementasi akan membuat Phase 01–05 berdiri di atas pilihan yang tidak beralamat ID. | Ya — seluruhnya sudah dinaikkan dan diputuskan; log ini hanya mencatat bahwa hal itu terjadi. |
| 6 | Penyelarasan kode enum 7 September 2026 tidak diputuskan di log ini. Kedua pertentangan dinaikkan ke pemilik produk lebih dulu, lalu `PRD 26.2`, `SDD-01 §4.1`, dan `SDD-08 §4.1` disunting di cabang `chore/` **sebelum** `PR-00-05` menulis `0002_enums.sql`. Suntingan dibatasi pada titik definisi dan literal SQL; ±30 sebutan prosa di 12 berkas sengaja tidak disentuh, dan sebuah kalimat normatif ditambahkan pada `PRD 26.2` agar setiap sebutan itu terbaca sebagai nama keadaan, bukan nilai kolom. | Nilai enum adalah kontrak data: bila `0002_enums.sql` dan `SDD-01 §4.1` berselisih, `PR-02-16` akan ditulis dari salah satunya dan selisihnya baru terlihat saat runtime. Menyunting seluruh sebutan prosa akan menyentuh teks `BR-017`/`BR-023b` yang dimiliki berkas modul, sehingga melanggar aturan satu-pemilik demi keseragaman kosmetik. | Ya — sudah dinaikkan dan diputuskan pemilik produk; log ini hanya mencatat bahwa hal itu terjadi. |
| 5 | Berkas uji `apps/api` diletakkan di `apps/api/tests/`, di luar `rootDir` build (`./src`), dan di-*typecheck* proyek terpisah `tsconfig.test.json` yang dijalankan `npm run test -w apps/api` sebelum Vitest. | Uji di dalam `src/` akan ikut ter-*emit* ke `dist/` dan masuk image produksi — dilarang `CLAUDE.md` ("tidak ada data uji pada jalur produksi"). Kompilasi terpisah itu juga yang **menjadikan** acceptance `PR-00-04` sebuah gerbang: uji negatifnya berupa `@ts-expect-error`, yang hanya menolak sesuatu bila ada yang benar-benar mengkompilasinya. | Tidak — `SDD-17 §4.1` menyatakan hanya tingkat yang dimilikinya, dan letak berkas uji tidak termasuk. |
| 4 | Vitest dipasang di `apps/api` pada `PR-00-04`, bukan menunggu `PR-00-17`. | `SDD-REPO-11` sudah memilih perkakasnya; yang menjadi milik `PR-00-17` adalah *tahap pipeline*-nya, bukan pemasangan runner-nya. Acceptance `PR-00-04` dan DoD 29.5 sama-sama menuntut uji, dan PR pertama yang menulis uji adalah PR yang harus menyediakan cara menjalankannya. | Tidak — perkakasnya sudah ditetapkan `SDD-REPO-11`. |
| 3 | `AuthContext.scopeOf()` **melempar** untuk permission yang tidak dipegang, alih-alih mengembalikan scope bawaan. | Nilai bawaan di titik ini mengubah kelalaian pemanggil menjadi kebocoran diam-diam — persis kelas kesalahan yang `SDD-AUTH-02` hilangkan dengan mewajibkan `ctx`. Diuji dengan tiga syarat `SDD-AUTH-11` dan lolos ketiganya: tidak ada perilaku pengguna yang berubah, tidak ada baris baru pada empat katalog, dan ia semata cara memenuhi `PM-03`. | Tidak — mekanisme teknis, lolos uji tiga syarat `SDD-AUTH-11`. |
| 2 | Audit stack 6 September 2026 tidak menghasilkan keputusan di log ini. Keempat celah dinaikkan lebih dulu ke SDD pemiliknya (`SDD-DB-15`, `SDD-REPO-11`, `SDD-INF-12`, `SDD-FE-13`) dan dicatat di [`TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md) sebagai `TBD-DB-B`, `TBD-QA-A`, `TBD-INF-C`, `TBD-FE-C` — dibuka dan ditutup pada hari yang sama. | Ketiganya menyentuh bentuk kode dan perkakas, bukan requirement, sehingga masuk kelompok C. Menuliskannya hanya di log akan membuat `PR-00-04` dan `PR-00-05` berdiri di atas keputusan yang tidak beralamat ID. | Ya — sudah dinaikkan; log ini hanya mencatat bahwa hal itu terjadi. |
| 1 | Cuplikan Dockerfile `SDD-16 §4.1` diadaptasi ke tata letak monorepo saat `PR-00-03`: seluruh manifest workspace disalin sebelum `npm ci`, tahap runtime ikut menyalin manifest dan `dist` tiap workspace yang dipakainya, dan hanya `apps/api` yang dibangun. | Cuplikan itu ditulis untuk satu paket, sebelum `SDD-17` menetapkan monorepo. `npm ci` menolak berjalan tanpa seluruh manifest yang disebut `package-lock.json`; `node_modules` datar menaruh `@sigm4/schemas` sebagai symlink, sehingga tanpa direktori tujuannya impor gagal saat proses dinyalakan. Ketiga perintah inti (`npm ci`, `npm run build`, `npm prune --omit=dev`) tetap dipakai apa adanya sesuai `SDD-REPO-03`. | Tidak — bentuknya sudah ditetapkan `SDD-REPO-03`/`SDD-REPO-09`. Yang tertinggal adalah cuplikan `SDD-16 §4.1`; penyelarasannya diusulkan sebagai suntingan SDD tersendiri, bukan bagian PR implementasi. |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| `PR-00-07` direncanakan berkompleksitas **S** (≤ 200 baris berubah) — [`phase-00.md` §7](../phases/phase-00.md). | Terkirim **417 baris** di luar `package-lock.json` — lebih dari dua kali batasnya. | **Pemisahannya kali ini tegas dan menyelesaikan perdebatan:** kode produksi **134 baris** (migration 22 · service 83 · barrel 3 · tipe tabel 26) — **muat di dalam `S`**. Uji **222 baris**, dokumentasi dan konfigurasi ±61. Estimasi `S` ternyata benar terhadap kode produksinya, dan hanya keliru karena tidak menghitung uji. | Tidak ada pada scope. **Ini PR keempat berturut yang meleset dengan sebab yang sama, dan yang pertama membuktikan estimasinya sebenarnya akurat.** Tindak lanjut yang sudah dicatat pada baris `PR-00-06` — memisahkan estimasi §7 antara kode produksi dan uji — karena itu bukan lagi usulan melainkan koreksi terhadap cara §7 dibaca: angka `S`/`M`/`L` yang ada **sudah** menggambarkan kode produksi dengan benar. |
| `PR-00-06` direncanakan berkompleksitas **M** (≤ 400 baris berubah) — [`phase-00.md` §7](../phases/phase-00.md). | Terkirim **L**: ±810 baris di luar `package-lock.json`, dengan 287 baris di antaranya uji. | **PR ketiga berturut** dengan sebab yang persis sama. Pola ini sekarang cukup jelas untuk ditindaklanjuti, bukan sekadar dicatat lagi. | Tidak ada pada scope. **Tindak lanjut: estimasi §7 Phase 01 dinyatakan terpisah antara kode produksi dan uji.** Tanpa itu, setiap PR Phase 01 akan meleset dengan cara yang sama dan angkanya berhenti bermakna. |
| `PR-00-05` direncanakan berkompleksitas **M** (≤ 400 baris berubah) — [`phase-00.md` §7](../phases/phase-00.md). | Terkirim **L**: 702 baris berubah di luar `package-lock.json`. Scope tidak melebar — runner, `0001`, `0002`, tidak lebih — tetapi 458 baris di antaranya adalah uji dan helper-nya, dan 68 baris lagi adalah pembungkus advisory lock yang tidak ada dalam rencana karena kebutuhannya baru diketahui **hari itu** dari hasil verifikasi. | Pola yang sama dengan `PR-00-04`, ditambah satu sebab baru: acceptance PR ini menuntut pembuktian terhadap PostgreSQL nyata, sehingga lapis uji integrasi beserta perkakasnya lahir di sini. | Tidak ada pada scope. Untuk perencanaan phase berikutnya: dua PR berturut meleset dari **M** ke **L** dengan sebab yang sama — estimasi §7 menghitung kode produksi dan tidak menghitung uji. Estimasi Phase 01 sebaiknya dinyatakan terpisah antara keduanya. |
| `PR-00-04` direncanakan berkompleksitas **M** (≤ 400 baris berubah) — [`phase-00.md` §7](../phases/phase-00.md). | Terkirim **L**: 546 baris berubah di luar `package-lock.json`. Scope-nya tidak melebar — keempat butir §8 persis — tetapi 245 baris di antaranya adalah uji dan ±90 baris komentar penelusuran ID yang diwajibkan `CLAUDE.md`. | Estimasi M dibuat sebelum `SDD-DB-15` dan `SDD-REPO-11` ditetapkan (6 September 2026), sehingga tidak memperhitungkan pemasangan Vitest maupun empat berkas uji. | Tidak ada; scope `PR-00-05` tidak berubah. Pelajarannya untuk perencanaan phase berikutnya: PR pertama yang memperkenalkan sebuah perkakas menanggung biaya pemasangannya, dan estimasi §7 belum mencerminkan itu. |
| `develop` direncanakan berdiri bersama `staging` pada `PR-00-18`. | `develop` dibuat manual dari `main` pada 6 September 2026 saat pemulihan cabang; jalur kerja sejak itu `feature/*` → PR → `develop`. `staging` tetap scope `PR-00-18`. | Cabang `main` lokal sempat menyimpang dari `origin/main`; pemulihan memerlukan cabang integrasi lebih dahulu. | Tidak mengubah scope Phase 00; `BRANCHING-STRATEGY.md` dan `GITHUB-CI-STATE.md` disegarkan agar keadaan aktual tidak disamarkan. |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-00.md` §7](../phases/phase-00.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| `chore/tsconfig-akar-typecheck` | `tsconfig.json` akar agar `npm run typecheck` hijau | Bukan PR bernomor. `TS5083` sudah ada sejak `PR-00-01` dan tercatat di §7, tetapi berada di luar scope `PR-00-02` maupun `PR-00-03`; memasukkannya ke salah satunya akan mencampur perbaikan perkakas dengan pekerjaan yang sedang ditinjau (`CLAUDE.md` — "sekalian rapikan"). `PR-00-17` menuntut perintah ini hijau, jadi ia tidak dapat menunggu lebih lama. |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [x] Runner migration **dbmate** (`SDD-DB-12`) dibuktikan di `PR-00-05`, dan pembuktiannya **gagal separuh**: opt-out transaksi per-migration terpenuhi, *advisory lock* **tidak ada sama sekali** pada dbmate 2.35.1. Temuan dinaikkan ke pemilik produk; `SDD-DB-12` disunting sehingga advisory lock menjadi syarat **jalur** migration dan dipegang pembungkus `scripts/migrate.mjs`. Butir inilah yang menangkapnya — nama yang dikunci memang tidak menggantikan pembuktian
- [x] Tipe tabel Kysely (`SDD-DB-15`) disegarkan pada PR yang sama dengan migration yang mengubah bentuk tabel — **berlaku pertama kali di `PR-00-07`**: `0003` membuat `document_counters`, dan `Database` pada `shared/db/schema.ts` ikut terisi pada PR yang sama. Butir ini tetap berlaku bagi setiap migration berikutnya
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
| Tipe enum terbentuk di PostgreSQL 15 | Seluruh kelompok Bab 11.3 | **27 dari 27**, nilai & urutan identik | acceptance `PR-00-05` |
| `btree_gist` dapat dipakai exclusion constraint | Irisan ditolak | Ditolak `23P01`; resource berbeda tetap lolos | `CI-01`, `SDD-AVL-01` |
| Advisory lock dbmate polos | Ada | **Tidak ada** — `pg_locks` kosong pada 5 sampel selama `pg_sleep(6)` aktif | `SDD-DB-12` |
| Advisory lock lewat `scripts/migrate.mjs` | Ada | Ada; terlepas setelah migration selesai | `SDD-DB-12`, `SDD-INF-03` |
| Opt-out transaksi per-migration dbmate | Ada | Ada — `25001` tanpa `transaction:false`, berhasil dengannya | `SDD-DB-12` |
| Kode permission Lampiran C | — | **79** (bukan 78; selisih satu sejak commit pertama) | `PR-00-16` |
| Kode `NT-xx` terpetakan ke kelompok preferensi | 52 dari 52 | 48 → **52** setelah audit | `SDD-NTF-06`, `FR-17.3` |
| Endpoint dirujuk alur tetapi tak berkatalog | 0 | 2 → **0** setelah audit | `PM-01` |
| Kolom berhimpunan tetap bertipe `text` | 0 | 6 → **0** setelah audit | `SDD-DB-02` |
| Nomor dokumen unik pada 1.000 permintaan paralel | 1.000 | **1.000 dari 1.000**, urut 1–1000 tanpa lompatan, 1,27 detik | acceptance `PR-00-07`, `SEQ-02` |
| Cakupan gabungan uji berkas + integrasi | ≥ 70% (`CD-02`) | `PR-00-07`: **93,43%** pernyataan · `PR-00-08`: **95,37%** pernyataan · 92,54% cabang · 96,72% fungsi | `NFR-M-03` |
| Jam kerja melewati akhir pekan & hari libur | benar | Terbukti: akhir pekan, satu hari libur, dan libur beruntun (Minggu + 2 hari cuti bersama) | acceptance `PR-00-08`, `CAL-01` |
| Route tanpa permission menggagalkan bootstrap | gagal | Terbukti dua lapis: tipe menolak saat kompilasi, `validateOrThrow` menolak saat runtime | acceptance `PR-00-09`, `PM-01` |
| Kunci sama+body sama → tersimpan; body beda → 409 | sesuai `ID-03`/`ID-04` | Terbukti; ditambah `ID-05` yang dijawab **seketika** (< 1 detik) alih-alih menunggu | acceptance `PR-00-10` |
| Baris **kode produksi** vs **uji**, `PR-00-04` | — | 301 / **245** (kode `M`, uji `M`) | kalibrasi §7 |
| idem, `PR-00-05` | — | 244 / **458** (kode `M`, uji `L`) | idem |
| idem, `PR-00-06` | — | ±400 / **391** (kode `M`, uji `M`) | idem |
| idem, `PR-00-07` | — | **134** / **222** (kode `S`, uji `M`) | idem |
| idem, `PR-00-08` | kode `M` · uji `M` (§7) | **299** / **291** — **kedua estimasi tepat** | verifikasi pertama setelah §7 dipisah |
| idem, `PR-00-09` | kode `M` · uji `M` (§7) | **315** / **333** — **kedua estimasi tepat** | verifikasi kedua |
| idem, `PR-00-10` | kode `M` · uji `M` (§7) | **186** (`S`) / **252** (`M`) — **kode meleset satu kelas ke bawah**, uji tepat | verifikasi ketiga |
| Atribut entitas PRD tanpa padanan kolom SDD | 0 | 6 → **0** setelah sapuan kedua | `SDD-05 §4.1` |
| Ejaan kolom waktu-dibuat di tabel SDD | 1 | 3 → **1** (`created_at`; `activity_logs.waktu` dikecualikan tertulis) | `SDD-05 §4.2` |
| ID dirujuk tetapi tak pernah didefinisikan | 0 | **0** dari 786 ID | `audit_docs.py` |
| Endpoint pada indeks tergenerate | — | 119 → **124** | `gen_indexes.py` |

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
