# Log Phase 03 — Layanan Berbasis Aset & Reservasi Ruangan

| | |
|---|---|
| **Phase** | [`phases/phase-03.md`](../phases/phase-03.md) |
| **Milestone PRD** | `M1 — **menutup M1**` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | — |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-03.md`](../phases/phase-03.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 1 Oktober 2026 | Phase 03 dimulai selagi Phase 02 `In Review` (gerbang keluar `#119`, pola Phase 01 → 02). `PR-03-01` dikerjakan (`feature/PR-03-01-pembuatan-qr`, dari `develop` pasca `#118`) — keputusan 1; PRD m05 §7 (+2 endpoint) dan rencana `phase-03.md` §7 disunting sebelum kode. | `PR-03-01` |
| 1 Oktober 2026 | `#120` (`PR-03-01`) digabung PM ke `develop` (merge `ae6d7e0`). | `PR-03-01` |
| 2 Oktober 2026 | `PR-03-02` dikerjakan (`feature/PR-03-02-cetak-qr-massal`, dari `develop` pasca `#120`) — keputusan 2 (lima keputusan pemilik produk via `AskUserQuestion` sebelum kode); PRD m05 §7 (permission cetak), SDD-16 §4.7 (`CHROMIUM_EXECUTABLE_PATH`), dan rencana `phase-03.md` §7 disunting. | `PR-03-02` |
| 2 Oktober 2026 | `#121` (`PR-03-02`) digabung PM ke `develop` (merge `a39bbec`). `PR-03-03` dikerjakan (`feature/PR-03-03-pemindaian-qr`) — keputusan 3; SDD-03 (pengecualian `SDD-AUTH-02`) dan rencana `phase-03.md` §7 disunting sebelum PR dibuka. | `PR-03-02`, `PR-03-03` |
| 2 Oktober 2026 | Keputusan 4: `GET /assets/{id}` + linimasa → `PR-03-24` baru (rencana 175 PR). `#122` (`PR-03-03`) sudah digabung PM (merge `c8ce86a`) sebelum suntingan ini ter-push, sehingga keputusan masuk lewat cabang `chore/keputusan-detail-aset`. Sekaligus dikoreksi: total selesai di `IMPLEMENTATION-STATUS.md` tertinggal 71 → 73 (`PR-03-01`/`PR-03-02` `Done` tanpa memperbarui baris total); `PR-03-03` → `Done` (74/175). | `PR-03-03`, `PR-03-24` |
| 2 Oktober 2026 | `#123` (keputusan 4) digabung PM. `PR-03-04` dikerjakan (`feature/PR-03-04-layanan-berkas`, dari `develop` pasca `#123`) — keputusan 5 (tujuh keputusan, termasuk pemecahan menjadi `PR-03-04` + `PR-03-25`); PRD, SDD-09/16, dan rencana disunting sebelum kode. | `PR-03-04`, `PR-03-25` |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | **Cakupan `PR-03-01` — dua keputusan pemilik produk (`AskUserQuestion`, 1 Oktober 2026):** (a) "Pembuatan QR + payload + penyimpanan" = `APP_BASE_URL` di skema `shared/config` (API), pembangun payload `https://{domain}/a/{asset_uuid}` + matriks QR tingkat koreksi **M** ke SVG di `shared/qr` (dipakai `PR-03-02`), dan `qr_url` + `qr_terpasang` pada respons aset. **Tanpa berkas gambar QR**: yang disimpan hanya `assets.uuid` (sejak `PR-02-10`); QR dirender saat dibutuhkan. (b) Dua endpoint siklus hidup QR yang tak punya baris katalog maupun PR pemilik masuk ke PR ini: `POST /assets/{id}/qr/regenerate` (`asset.qr_regenerate` — inti Administrator, alasan wajib per UX §7.2, `ASSET_QR_REGENERATED`) dan `PATCH /assets/qr-terpasang` (`asset.qr_print`, 1–200 aset, `ASSET_UPDATED` per aset). | (a) FR-05.1 langkah 1 hanya menuntut URL permanen; PDF dirender worker dari HTML (`SDD-FS-12`) sehingga gambar tersimpan tak dipakai siapa pun, dan layanan berkas baru lahir `PR-03-04`. (b) Permission `asset.qr_regenerate`/`asset.qr_print` dan aksi `ASSET_QR_REGENERATED` sudah ada di PRD, tetapi endpoint-nya tidak — `PM-01` menuntut setiap endpoint ber-permission tercantum di katalog. | Ya — PRD m05 §7 (+2 baris); `phase-03.md` §7 (`PR-03-01`). |
| 2 | **Cakupan `PR-03-02` — lima keputusan pemilik produk (`AskUserQuestion`, 1–2 Oktober 2026):** (a) **render sinkron di proses API**: mesin tetap Playwright/Chromium (`SDD-FS-12`), PDF dikirim langsung di respons `POST /assets/qr/print`, dibatasi 200 label dan diukur terhadap ≤ 5 detik (`SDD-PERF-06`); (b) permission cetak = **`asset.qr_print`**, bukan `asset.update` yang tertulis di baris endpoint m05 §7; (c) **tiga preset A4** — 3×8 (70×37,125 mm, QR 25 mm), 4×10 (52,5×29,7 mm, QR 20 mm), 2×5 (105×59,4 mm, QR 40 mm) — dengan elemen opsional kode aset & nama; (d) elemen **"nama sekolah" ditunda** — belum ada sumbernya (tak ada kunci `identitas_sekolah.*` di `system_settings` maupun PR pemiliknya); (e) Chromium di image Alpine = **`apk add chromium`** + `playwright-core` (tanpa unduhan browser) lewat `CHROMIUM_EXECUTABLE_PATH` (opsional; kosong = Chrome terpasang di dev/CI); (f) header PDF Chromium `%PDF-1.4` **ditulis ulang ke `%PDF-1.7`** (`NFR-C-07`) — panjang sama, offset xref tak bergeser, isi 1.4 subset sah 1.7; (g) uji integrasi CI menegakkan AC FR-05.1/NFR-P-07 (**≤ 30 detik**), bukan ≤ 5 detik — `SDD-PERF-06` dibuktikan dengan ukuran pada image produksi dan diukur ulang di uji beban staging. | (a) `SDD-FS-12` menetapkan render di worker dan `SDD-07 §3` menggolongkan PDF asinkron, tetapi jalur itu menuntut `stored_files` + presigned URL (`PR-03-04`, belum ada) — pola identik keputusan 25 log phase-01; terukur 2,2 detik untuk 200 label. (b) Katalog permission (`roles-permissions.md`) dan UX P-24 sama-sama memakai `asset.qr_print` "Mencetak label QR"; `asset.update` di §7 tak konsisten dengan keduanya. (c) FR-05.1 langkah 3 hanya memberi contoh "3×8 per A4"; UX/DESIGN tak menetapkan ukuran; QR terkecil = batas AC 2×2 cm. (e) Unduhan Chromium Playwright tidak berjalan di musl. (f) Uji membuktikan, bukan mengasumsikan (`SDD-FS-12`). (g) CI run `36944933836` mencatat 9,7 detik pada runner 2 vCPU yang berbagi CPU dengan cakupan v8 + suite paralel; di image produksi 3,1 detik dingin. `SDD-FS-12` sendiri menempatkan `NFR-P-07` pada uji beban. | Ya — PRD m05 §7 (permission baris cetak); SDD-16 §4.7 (variabel opsional); `phase-03.md` §7 (`PR-03-02`). (a), (d), (f) adalah pembatasan/tafsiran implementasi, tercatat di sini. |
| 3 | **Cakupan `PR-03-03` — empat keputusan pemilik produk (`AskUserQuestion`, 2 Oktober 2026):** (a) `GET /assets/by-uuid/{uuid}` mengembalikan **bentuk item katalog** `GET /assets` (BR-073, `qr_url`) + `kategori_nama`, `lokasi` {gedung, area, ruang}, `dihapuskan`; `GET /assets/{id}` (m04 §7) **tidak** dikerjakan — dicatat §10; (b) scope `restricted` (Siswa/OSIS) memindai aset non-siswa → **404** seperti katalog; (c) halaman publik menampilkan aset terhapuskan dengan **`aktif: false`**; (d) jalur publik tanpa pengguna memakai **pengecualian tertulis `SDD-AUTH-02`** — `PublicAssetRepository` (pola `AuthRepository`). Ditambah tafsiran implementasi: QR tak dikenal — UUID asing, bukan UUIDv4, atau UUID lama pasca regenerasi — selalu `404 NOT_FOUND` berpesan "QR tidak dikenali. Masukkan kode aset secara manual." (A1), sebab literal `uuid` tak sah membuat PostgreSQL melempar 22P02 (→ 500). Aksi kontekstual langkah 4 dihitung klien dari `GET /me` + status aset (PM-04). | (a) Detail penuh berikut riwayat belum punya PR pemilik; bentuk katalog sudah memenuhi langkah 3 dan A2. (b) 17.5 butir 3: tidak membocorkan keberadaan data. (c) Selaras A2. (d) Pengunjung publik tidak login, `SystemAuthContext` dilarang di luar `src/worker`. | Ya — SDD-03 (pengecualian `SDD-AUTH-02` ditulis); `phase-03.md` §7 (`PR-03-03`). |
| 4 | **Pemilik detail aset — dua keputusan pemilik produk (`AskUserQuestion`, 2 Oktober 2026):** (a) `GET /assets/{id}` dimiliki **PR baru `PR-03-24`** (Phase 03: 23 → **24** PR, total 174 → **175**) — identitas lengkap, QR, kategori/lokasi, BR-073, scope `restricted`; (b) riwayat disajikan sebagai **satu endpoint linimasa** `GET /assets/{id}/timeline` (terpaginasi, entri berjenis) — `PR-03-24` mengisi jenis `KONDISI` dan `MUTASI` (tabel sudah ada sejak `PR-02-13`/`PR-02-14`); jenis lain ditambahkan PR pemilik riwayatnya: dokumen `PR-03-06`, kerusakan `PR-03-14`, pemeliharaan `PR-04-10`, peminjaman `PR-05-01`; foto aset pada detail oleh `PR-03-04`. Jenis sensitif disembunyikan bagi scope `restricted` (`FR-04.2 A1`). | `FR-04.2` langkah 5 dan P-18 tak punya backend; satu linimasa sejalan acceptance `PR-04-10` ("menyatu dengan linimasa aset") dan tidak menggembungkan respons detail tiap kali modul baru lahir. Rincian bentuk entri, kursor, dan urutan diputuskan di `PR-03-24` (SDD-API-05). | Ya — PRD m04 §7 (+ baris `GET /assets/{id}/timeline`, deskripsi `GET /assets/{id}`); `phase-03.md` §7 (+`PR-03-24`, catatan `PR-03-04`/`PR-03-06`); `phase-04.md` (`PR-04-10`); `phase-05.md` (`PR-05-01`); total di `README.md`, `DELIVERY-PLAN.md`, `IMPLEMENTATION-STATUS.md`, `validate_impl.py`, `CLAUDE.md`. |
| 5 | **Layanan berkas `PR-03-04` — tujuh keputusan pemilik produk (`AskUserQuestion`, 2 Oktober 2026):** (a) penyedia object storage produksi **Backblaze B2** lewat **API S3-compatible** dengan **AWS SDK v3** (`@aws-sdk/client-s3` + `s3-request-presigner`); MinIO tetap untuk dev/CI; variabel baru **`S3_REGION`** (wajib — SigV4 B2 mengikat region bucket); (b) kode **`409 FILE_NOT_SCANNED`** ditambahkan ke katalog tertutup Bab 17.3; (c) aksi log baru **`FILE_UPLOADED`** (m06 §11) dicatat saat confirm — presign tidak dicatat (baris pesanan yang tak dikonfirmasi dibersihkan `SDD-FS-09`); (d) foto: kolom `users.foto_file_id` + `PUT /me`/`GET /me`; foto aset (`asset_photos`) dipindah dari catatan `PR-03-04` ke `PR-03-24`; (e) MinIO **nyata** di CI dinyalakan lewat langkah `docker run` (service container tidak dapat meneruskan argumen `server`); (f) **dipecah dua**: `PR-03-04` fondasi, **`PR-03-25`** baru untuk presign/confirm + foto profil (rencana 175 → **176**). Tafsiran implementasi: dua kelompok enum baru Bab 11.3 diturunkan dari SDD-09 §4.1/§4.3 — `Status Pemindaian Berkas` dan `Jenis Pemilik Berkas` (`owner_type` wajib sejak presign, karena kebijakan §4.3 bergantung pada jenis); `checksum IS NULL` = belum dikonfirmasi; `Content-Type`/`Content-Length` ikut ditandatangani presigned PUT. | (a) INF-02 hanya menuntut S3-compatible; B2 memenuhinya, dan API S3-nya membuat desain `SDD-FS-01/13` tetap utuh serta dev/CI tetap MinIO; B2 native API akan menulis ulang alur presigned. (b) `SDD-09 §4.4` sudah memakai kode itu; katalog Bab 17.3 tertutup. (c) AL-01: confirm adalah operasi tulis yang bermakna (berkas resmi terdaftar). (f) CLAUDE.md: PR `L` wajib berdalih; batas alami ada di antara infrastruktur dan alur bisnis. | Ya — PRD `deployment-ops.md` INF-02, `api-conventions.md` Bab 17.3, `m06-documents.md` §11, `data-model.md` Bab 11.3 (+2 kelompok); SDD-09 (`SDD-FS-13`, §4.1), SDD-16 §4.7 (`S3_REGION`); `phase-03.md` §7 (`PR-03-04` ditulis ulang, `PR-03-25` baru, dependensi `PR-03-05`/`PR-03-06`, catatan `PR-03-24`); total di `README.md`, `DELIVERY-PLAN.md`, `IMPLEMENTATION-STATUS.md`, `validate_impl.py`, `CLAUDE.md`. |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| `PR-03-01` berskala `M` (≤ 400 baris kode produksi) | **+392 / −12** baris produksi (`L`, `git diff --numstat`): `shared/qr` (±60), `APP_BASE_URL` (±25), kolom & `qr_url` M-04 (±40), fungsi tulis kolom QR M-04 (±100), modul `m05-qr` (±150), perakitan (±25). Uji +282 (termasuk `appBaseUrl` pada 19 berkas uji yang merakit `createApp`). | Keputusan 1b: dua endpoint siklus hidup QR yang tidak punya pemilik masuk PR ini (pemilik produk sudah diberi tahu PR bisa menjadi `L`). Tidak dipecah: kedua endpoint memakai payload, kolom, dan perakitan yang sama. | `PR-03-02` memakai `svgQr`/`urlQrAset` dari `shared/qr`; `APP_BASE_URL` perlu ditambahkan ke skema worker saat label PDF dirender di worker. |
| `PR-03-02`: PDF label dirender **worker** (`SDD-FS-12`), asinkron (`SDD-07 §3`) | Render **sinkron di proses API**, satu Chromium per permintaan, ≤ 200 label (keputusan 2a). | Jalur asinkron menuntut `stored_files` + presigned URL (`PR-03-04`). | Setelah `PR-03-04`: pindahkan render ke worker (job ekspor + `stored_files`) — `PembangkitPdf` (`shared/pdf`) sudah terpisah dari HTTP sehingga hanya pemanggilnya yang berganti. |
| `PR-03-02`: elemen label "nama sekolah" (FR-05.1 langkah 3) | Hanya kode aset + nama aset (keputusan 2d). | Nama sekolah belum tersimpan di mana pun. | FR-05.1 langkah 3 belum penuh sampai kunci `identitas_sekolah.nama` (`FR-20.1`) punya PR pemilik — §10. |
| `PR-03-03` berskala `S` (≤ 200 baris produksi) | **+274 / −8** (`M`). | Dua endpoint (terautentikasi + publik) dengan dua jalur baca berbeda — repository bercakupan dan `PublicAssetRepository` pengecualian `SDD-AUTH-02` (keputusan 3d) — ditambah skema respons dan perakitan. Tidak dipecah: keduanya memakai kueri gabungan kategori/lokasi dan validasi UUID yang sama. | — |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-03.md` §7](../phases/phase-03.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| `PR-03-24` | Detail aset + linimasa riwayat | `GET /assets/{id}` tercantum di PRD m04 §7 sejak awal tetapi tak pernah dipetakan ke PR mana pun — rencana Phase 02 hanya memetakan katalog (`PR-02-12`, `FR-04.2` langkah 2–4), sehingga langkah 5 (detail + riwayat) jatuh di antara dua baris rencana. Deliverable Phase 02 "Inventaris aset lengkap dengan riwayat kondisi dan mutasi" pun tak punya endpoint baca untuk riwayatnya. Pola: requirement yang terbagi per *langkah* FR perlu diperiksa per langkah saat menyusun rencana, bukan per FR. |
| `PR-03-25` | Layanan berkas — unggah/konfirmasi + foto profil | Dipecah dari `PR-03-04` sebelum kode (keputusan 5f): perkiraan cakupan penuh ±690 baris produksi (`L`) terhadap rencana `M`. Rencana awal menggabungkan fondasi infrastruktur (skema, konfigurasi, adapter penyedia, kesiapan) dengan alur bisnis unggah dan foto profil dalam satu baris. |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Pengisian pertama `procurement_id` (`PR-03-19`) — kolom **tetap** nullable; aset hibah/impor manual sah bernilai `NULL`
- [ ] Apakah `SlotService` perlu diubah untuk melayani reservasi ruangan. Bila ya — catat apa yang kurang umum pada rancangan Phase 02
- [ ] Penerapan `UXD-15` (satu rumpun `/reservations`), `SDD-FS-11` (foto dipertahankan), `SDD-AI-13` (awalan statis ≥ 4.500 token), dan `UXD-11` (tablet) — seluruhnya sudah tertutup sebelum phase dimulai
- [ ] Kriteria keluar `M1` terverifikasi: 500 aset terimpor, QR dicetak & dipindai, `ST-05` lolos

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| `test:ci` penuh lokal `PR-03-01` putaran 1: `migrations.test.ts` "down mencabut seluruhnya, lalu up memulihkannya" merah sekali; `health-http.test.ts` (potret registri route/permission) belum memuat dua route M-05. | Satu merah rapuh; satu merah sungguhan. | Potret registri diperbarui. `migrations.test.ts` lulus 5/5 sendiri dan putaran 2 penuh **131 berkas / 1.853 uji hijau** — tidak direproduksi. | Tidak |

| `PR-03-02`: `clock-lint.test.ts` ("tidak ada `new Date()` telanjang…") merah karena **tenggat 5 detik** pada `npm test` lokal (5.075–6.767 ms). | Bukan regresi: merah yang sama terjadi pada `develop` bersih (diperiksa dengan `git stash`). | Tidak diubah di PR ini (di luar cakupan). | Ya |
| `PR-03-04`: suite integrasi penuh merah 2 — `users.test.ts` (daftar kolom `users` dikunci) dan `urutan-uji.test.ts` (`dbmate rollback` memakai sequence migration **terakhir**, tertulis `password_history_id_seq`). | Keduanya potret yang wajib disesuaikan tiap migration baru — bukan regresi. | Disesuaikan di PR ini (`foto_file_id`; `stored_files_id_seq`). **Butir terpisah:** `urutan-uji.test.ts` sebaiknya menurunkan sequence migration terakhir secara dinamis agar tidak merah di setiap PR bermigration — tidak dikerjakan di sini (di luar cakupan). | Ya |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| Mutasi pada QR `PR-03-01` | seluruhnya terdeteksi | **10/10** pada putaran pertama (serial, cadangan berkas, dibandingkan byte-per-byte): jalur `/a/`, tingkat koreksi M, zona tenang, validasi https `APP_BASE_URL`, `qr_url` katalog, UUID benar diganti, aksi log regenerasi, hanya yang berubah ditulis, atomik, permission regenerasi. `qr.test.ts` 5/5, `config.test.ts` 41/41, `m05-qr.test.ts` 8/8, sapuan AL-01 `phase-01-gate` 10/10 (kini memuat dua route M-05) | `logs/phase-03.md` §1 |

| Cetak 200 label `PR-03-02` (A4 3×8, HTTP penuh, Chrome terpasang, mesin dev Windows) | ≤ 30 detik (`NFR-P-07`); ≤ 5 detik jalur sinkron (`SDD-PERF-06`) | **2.193 ms**, PDF 546.508 byte, 9 halaman A4, header `%PDF-1.7` (uji integrasi `m05-qr.test.ts`). Spike awal 200 elemen sederhana: 1.043 ms (header asli `%PDF-1.4`). | keputusan 2 |
| Mutasi `PR-03-02` | seluruhnya terdeteksi | **8/8** (serial, cadangan berkas, dipulihkan byte-per-byte): header 1.7, escape HTML, paginasi per lembar, elemen opsional, id hilang → 422, aksi `ASSET_QR_PRINTED`, permission `asset.qr_print`, log hanya setelah PDF jadi. Tidak diuji mutasi: `javaScriptEnabled: false`/pemutusan jaringan Chromium (pertahanan berlapis di belakang escape yang sudah teruji). | — |
| Cetak 200 label `PR-03-02` di dalam image runtime (Alpine, Chromium apk) | ≤ 5 detik (`SDD-PERF-06`) | **3.110 ms** pertama (dingin), **1.639 ms** kedua; PDF 464.338 byte, header `%PDF-1.7`. Ukuran image 1,78 GB — dicatat di log phase-00 §8. | keputusan 2e |
| Cetak 200 label `PR-03-02` di CI (runner GitHub, `test:ci` + cakupan v8, suite paralel) | — (lingkungan bukan ukuran produksi) | **9.680 ms**, 534.249 byte (run `36944933836`) — melampaui 5 detik; uji dilonggarkan ke AC 30 detik (keputusan 2g). Profil lokal: start dingin Chromium 1,2 dtk vs hangat 0,3 dtk; render hangat ±1,3 dtk; menggabung modul QR per baris hanya memangkas PDF 30%, bukan waktu. | keputusan 2g |
| Ukuran baris `PR-03-02` | `M` (≤ 400 produksi) | **+257 / −10** produksi (`src` +247/−9, Dockerfile +6/−1, `git diff --numstat`); uji +159. | — |
| Mutasi `PR-03-03` | seluruhnya terdeteksi | **8/8** (serial, cadangan berkas, dipulihkan byte-per-byte; filter `-t "PR-03-03"` diverifikasi memilih 5 uji yang lolos tanpa mutasi): cek UUIDv4 (→ 500 tanpanya), scope `restricted`, BR-073, A2 aset terhapuskan, `aktif` terbalik, `X-Robots-Tag`, permission `asset.view`, kebocoran kolom publik. | — |
| Ukuran baris `PR-03-03` | `S` (≤ 200 produksi) | **+274 / −8** produksi (`M`; `git diff --numstat`); uji +77. | §3 |
| Mutasi `PR-03-04` | seluruhnya terdeteksi | **8/8** pada adapter `shared/storage` terhadap MinIO nyata (serial, cadangan berkas, baseline 5/5 hijau): `signableHeaders`, MIME/ukuran pada `PutObject`, `signingDate` dari Clock (unggah & unduh), path-style, penandatangan = `S3_PUBLIC_ENDPOINT`, HEAD 404 → `null`, `periksa`. Uji memakai host publik berbeda dari host server (127.0.0.1 ↔ localhost) agar penandatangan keliru ketahuan. | — |
| Ukuran baris `PR-03-04` | `M` (≤ 400 produksi) | **+218 / −1** produksi (`src`, migration, CI; `git diff --numstat`); uji +183. Perkiraan sebelum dipecah ±690 (`L`). | keputusan 5f |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-03.md` §9 dan §12](../phases/phase-03.md).

- [ ] Seluruh 23 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| Elemen label "nama sekolah" (FR-05.1 langkah 3) | **Belum ada PR pemilik** — menunggu kunci `identitas_sekolah.nama` (`FR-20.1`, `SDD-05 §4.7a`) | Keputusan 2d: belum ada sumber data. |
| ~~`GET /assets/{id}` (detail aset, m04 §7, P-18)~~ | **Ditutup keputusan 4** — dimiliki `PR-03-24` (Phase 03) | Ditemukan saat `PR-03-03`; diputuskan pemilik produk 2 Oktober 2026. |
| Ukur ulang cetak 200 label pada staging/uji beban terhadap `SDD-PERF-06` (≤ 5 detik) | Uji beban Phase 07–08 (`NFR-P-07`) | Keputusan 2g: CI bukan lingkungan ukur; bila staging > 5 detik, jalur worker (baris berikut) menjadi wajib. |
| Render PDF label di worker (`SDD-FS-12`, `SDD-07 §3`) | Setelah `PR-03-04` — **belum ada PR pemilik** | Keputusan 2a: jalur asinkron menuntut `stored_files`. Pemakai lain `SDD-FS-12`: berita acara mutasi (gerbang Phase 02), `PR-05-13`. |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
