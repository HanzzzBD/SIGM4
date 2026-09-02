# SDD-16 — Infrastruktur & Deployment

**Area:** `INF` · **Status:** Draft · **Basis:** [`deployment-ops.md`](../PRD/03-architecture/deployment-ops.md)

---

## 1. Konteks

| Kelompok | ID |
|---|---|
| Keputusan infrastruktur | `INF-01` … `INF-07` |
| CI/CD & rilis | `CD-01` … `CD-07` |
| Lingkungan | `NFR-M-09`, PRD 27.5 |
| Backup & DR | `BR-DR-01` … `BR-DR-06`, `NFR-R-01` … `NFR-R-04` |
| Rahasia | `SEC-CFG-01` … `SEC-CFG-04` |
| Sizing & biaya | PRD 27.3, 27.9 |
| Ketersediaan | `NFR-A-01` … `NFR-A-04` |
| Skalabilitas | `NFR-SC-01`, `JOB-01` |

Keputusan platform sudah ditetapkan PRD Bab 27.1 dan tidak diulang. Berkas ini menetapkan **cara menjalankannya**.

---

## 2. Keputusan Desain

| ID | Keputusan |
|---|---|
| **SDD-INF-01** | Satu **image container** melayani API dan worker; keduanya dibedakan oleh *entrypoint* dan variabel lingkungan (`SDD-SYS-08`). |
| **SDD-INF-02** | *Build* memakai **multi-stage** dengan image runtime non-root, tanpa perkakas build. |
| **SDD-INF-03** | Migration dijalankan sebagai **job terpisah sebelum** instance baru menerima trafik, dengan akun DB ber-DDL yang berbeda dari akun aplikasi (`CD-04`, `SEC-CFG-03`). |
| **SDD-INF-04** | Deployment memakai pola **rolling dengan readiness gate**; instance lama tetap melayani sampai instance baru siap. |
| **SDD-INF-05** | Worker **di-drain lebih dulu** saat deploy: berhenti mengambil pekerjaan baru, selesaikan yang berjalan, baru diganti. |
| **SDD-INF-06** | Cadangan basis data memakai **base backup harian + arsip WAL berkelanjutan** (PITR), bukan hanya `pg_dump` (`BR-DR-01`). |
| **SDD-INF-07** | Uji restore **otomatis bulanan** ke lingkungan sementara; hasilnya menjadi metrik, bukan laporan manual (`BR-DR-04`). |
| **SDD-INF-08** | Seluruh konfigurasi lewat **variabel lingkungan**, divalidasi skema saat *startup*; konfigurasi tidak valid mencegah proses berjalan. |
| **SDD-INF-09** | Zona waktu container dan basis data **UTC**, dipaksa lewat variabel lingkungan dan diverifikasi saat startup (`INF-07`). |
| **SDD-INF-10** | Orkestrasi memakai **Docker Compose**, bawaan `INF-05`. *Rolling deploy* `SDD-INF-04` dicapai lewat **koreografi pipeline** — reverse proxy (`INF-06`) memeriksa kesehatan upstream, instance API diganti satu per satu — bukan lewat fitur platform. Pengecualian Kubernetes pada `INF-05` **tidak berlaku**: `SDD-INF-11` menetapkan sekolah tidak menjalankan klaster Kubernetes. |
| **SDD-INF-11** | **Penyedia infrastruktur: VPS ber-region Indonesia** untuk API, worker, Redis, dan reverse proxy, ditambah **PostgreSQL sebagai layanan terkelola ber-region Indonesia** — bukan container PostgreSQL yang dipelihara sendiri. Object storage `INF-02` mengikuti batasan region yang sama (`SDD-SEC-10`). Menutup `TBD-INF-A` (keputusan pemilik produk, 25 Agustus 2026). Yang diputuskan **hanya penyedianya**; sizing dan biaya nyata (PRD 27.3, 27.9) tetap ditetapkan setelah uji beban `NFR-P-09` bersama `TBD-AVL-C`. |

---

## 3. Alasan

**SDD-INF-01 — satu image.** Dua image berarti dua *build*, dua tag, dan kemungkinan API versi X berjalan bersama worker versi Y. Karena keduanya berbagi basis kode (`SDD-SYS-08`), satu image dengan *entrypoint* berbeda menghilangkan seluruh kelas masalah itu.

**SDD-INF-03 — migration sebagai job terpisah.** Menjalankan migration saat *startup* aplikasi menyebabkan beberapa instance mencoba bermigrasi bersamaan, dan menuntut akun aplikasi memiliki hak DDL — yang justru dilarang `SEC-CFG-03`. Job terpisah berjalan sekali, dengan akun berbeda, sebelum trafik berpindah.

**SDD-INF-05 — drain worker.** Worker menjalankan pekerjaan yang menyentuh uang dan tenggat: penerbitan denda, pembatalan slot, pengiriman notifikasi. Mematikannya di tengah pekerjaan memang aman karena job idempoten (`JOB-03`), tetapi menghasilkan percobaan ulang dan alarm yang tidak perlu. Drain lebih rapi.

**SDD-INF-06 — PITR, bukan dump harian.** `NFR-R-01` menetapkan RPO ≤ 24 jam, yang secara harfiah dipenuhi `pg_dump` harian. Tetapi itu berarti kehilangan hingga 24 jam transaksi pada skenario terburuk — untuk sistem yang mencatat serah terima aset dan denda, itu mahal. Arsip WAL menurunkan kehilangan nyata ke hitungan menit dengan biaya penyimpanan yang kecil. Ini melampaui requirement secara sengaja, bukan kebetulan.

**SDD-INF-07 — restore diuji otomatis.** Cadangan yang tidak pernah dipulihkan bukan cadangan. `BR-DR-04` mewajibkan uji berkala; mengotomasinya membuat kegagalan terdeteksi dalam sebulan, bukan saat bencana.

**SDD-INF-08 — konfigurasi divalidasi saat startup.** Konfigurasi yang salah sebaiknya mencegah proses berjalan, bukan menghasilkan perilaku aneh di produksi. Kunci Gemini API yang kosong lebih baik menggagalkan *startup* daripada membuat chatbot gagal diam-diam pada permintaan pertama pengguna.

**SDD-INF-10 — Docker Compose.** `INF-05` sudah menetapkan bawaannya sekaligus syarat pengecualiannya, jadi yang tersisa bukan memilih bebas melainkan memeriksa apakah syarat itu terpenuhi — dan `SDD-INF-11` menetapkan bahwa ia **tidak** terpenuhi: sekolah tidak menjalankan klaster Kubernetes. Keputusan #1 (single sekolah, satu instansi) juga menghapus argumen terkuat Kubernetes sejak awal: tidak ada armada instalasi yang perlu dikelola seragam.

Gesekan yang nyata hanya satu, dan sebaiknya dinyatakan terbuka: `SDD-INF-04` menuntut *rolling deploy* ber-*readiness gate*, dan Compose tidak menyediakannya sebagai fitur platform. Kubernetes memberikannya gratis (`readinessProbe`, rolling update, `preStop`, `Job` untuk migration). Yang membuat itu tidak cukup sebagai alasan adalah bahwa biayanya sudah dibayar kebijakan: `NFR-A-01` menetapkan ketersediaan ≥ 99,5% pada jam operasional — bukan angka yang menuntut deploy tanpa jeda — sementara `CD-06` dan `NFR-A-03` memindahkan deploy ke luar jam operasional dengan anggaran *downtime* terencana 4 jam/bulan (`NFR-A-04`). Keunggulan utama Kubernetes karena itu sebagian besar membeli sesuatu yang tidak sedang kurang, dengan menurunkan *control plane* kepada pihak yang §6 sudah tandai berisiko.

**SDD-INF-11 — PostgreSQL terkelola, sisanya swa-kelola.** Keputusan ini memilah komponen menurut apa yang terjadi bila ia terabaikan, bukan menurut biaya.

API, worker, Redis, dan reverse proxy gagal dengan **berisik**: layanan mati, alarm berbunyi, seseorang memperbaikinya. Menjalankannya sendiri di VPS dapat diterima karena kegagalannya terlihat pada hari yang sama.

PostgreSQL gagal dengan **diam**. `SDD-INF-06` menuntut base backup harian + arsip WAL berkelanjutan, dan `SDD-INF-07` menuntut uji restore otomatis bulanan — dua kewajiban yang, bila dijadikan skrip milik sendiri, akan bertahan persis selama ada yang memeliharanya. Setelah hypercare `IMP-06` berakhir, pemeliharaan itu jatuh ke pihak yang §6 sudah tandai sebagai risiko dengan mitigasi berupa pelatihan. Arsip WAL yang berhenti tidak menampilkan gejala apa pun sampai ada yang mencoba memulihkan; pada saat itu RPO `NFR-R-01` sudah terlanggar berbulan-bulan tanpa satu pun alarm berbunyi.

Menyerahkan PITR dan uji restore kepada penyedia memindahkan dua kewajiban itu dari disiplin ke kontrak. Harganya nyata dan ditanggung sadar — ia adalah baris biaya pada PRD 27.9, ditukar dengan satu-satunya komponen yang kehilangannya tidak dapat diperbaiki.

Region Indonesia berlaku bagi seluruh komponen sebagai konsekuensi langsung `SDD-SEC-10`, bukan sebagai pilihan terpisah.

**Kubernetes tidak dipakai.** `INF-05` membuka pengecualian hanya bila sekolah sudah menjalankannya; `SDD-INF-11` menetapkan tidak. `SDD-INF-10` karena itu berdiri tanpa syarat, dan §5 tidak lagi menyimpan cabang yang menunggu.

**Docker Swarm mode** dipertimbangkan sebagai jalan tengah dan layak secara teknis: sintaks compose yang sama ditambah pembaruan bertahap ber-*readiness* sebagai fitur platform, tanpa *control plane*. Ia ditolak bukan karena kemampuannya melainkan karena ekologinya — pengembangan dan pengetahuan operasionalnya menipis, dan beban itu jatuh tepat ke sekolah setelah hypercare (`IMP-06`) berakhir.

Konsekuensi pilihan ini tidak disembunyikan: koreografi deploy menjadi milik kita dan karena itu wajib ditulis, diuji di staging, dan ditutup *smoke test* (`CD-07`) — lihat §5.

---

## 4. Rancangan

### 4.1 Image

```dockerfile
# Tahap build
FROM node:lts-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Tahap runtime — tanpa perkakas build, non-root
FROM node:lts-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
USER app
ENV NODE_ENV=production TZ=UTC
EXPOSE 3000
CMD ["node", "dist/api/index.js"]        # worker: dist/worker/index.js
```

### 4.2 Topologi runtime

```
VPS (region Indonesia)                         layanan terkelola (region Indonesia)
──────────────────────────────────         ──────────────────────────────────
reverse proxy (TLS, HSTS)  →  api ×2        →  postgres terkelola (SDD-INF-11)
                              worker ×1     →  object storage (S3-compatible)
                              av-scanner    →  FCM
                              redis         
                              ClamAV        
```

Web (React build) disajikan sebagai aset statis dari CDN atau reverse proxy, bukan dari proses Node.

**Replika dan arsip WAL tidak lagi menjadi container pada topologi ini.** Keduanya adalah tanggung jawab layanan PostgreSQL terkelola (`SDD-INF-11`) dan tampil sebagai konfigurasi langganan, bukan sebagai proses yang di-*compose*. Redis tetap swa-kelola di VPS: kehilangannya berarti kehilangan cache dan *rate limit* — degradasi yang `SDD-SEC-05` dan §6 sudah antisipasi — bukan kehilangan data.

### 4.3 Pipeline CI/CD

```
push / PR
 ├─ lint
 ├─ unit test                 gagal < 70% cakupan inti → stop   (CD-02, NFR-M-03)
 ├─ integration test          termasuk uji konkurensi CC-01..07
 ├─ uji otorisasi tergenerate SEC-T-01
 ├─ SAST                      ST-01
 ├─ SCA                       ST-02 — Critical/High → stop
 ├─ build image
 ├─ image scan                CD-01
 └─ deploy staging  →  DAST (ST-03)  →  smoke test (CD-07)

tag rilis
 ├─ migration job (akun DDL)                        CD-04
 ├─ rolling deploy api (readiness gate)             SDD-INF-04
 ├─ drain + ganti worker                            SDD-INF-05
 └─ smoke test produksi                             CD-07
```

Deploy produksi berjalan di luar jam operasional dan diumumkan H-2 (`NFR-A-03`, `CD-06`).

### 4.4 Migration & rollback

Pola **expand → migrate → contract** (`SDD-DB-08`):

| Tahap | Boleh rollback aplikasi? |
|---|---|
| Expand — tambah kolom/tabel *nullable* | Ya |
| Migrate — isi data, kode memakai bentuk baru | Ya |
| Contract — hapus kolom lama (rilis berikutnya) | Tidak |

Rollback aplikasi:

```
1. deploy image versi sebelumnya (dipertahankan 5 rilis terakhir)   CD-05
2. verifikasi /health/ready
3. jalankan smoke test
Target: ≤ 15 menit
```

Rollback skema hanya lewat migration `down` yang telah diuji di staging — dan hanya diperlukan bila tahap contract sudah dijalankan, yang menurut aturan §4.4 tidak pernah satu rilis dengan expand-nya.

### 4.5 Backup & DR

| Aspek | Implementasi |
|---|---|
| Base backup | Harian, terenkripsi, ke penyimpanan terpisah (`BR-DR-03`) — **disediakan layanan terkelola** (`SDD-INF-11`) |
| Arsip WAL | Berkelanjutan → PITR (`BR-DR-01`) — **disediakan layanan terkelola** (`SDD-INF-11`) |
| Object storage | *Versioning* + replikasi ke bucket/wilayah lain (`BR-DR-02`) |
| Konfigurasi | Parameter sistem, approval rules, matriks permission diekspor tiap perubahan (`BR-DR-06`) |
| Retensi | 30 hari bergulir (`NFR-R-03`) |
| Uji restore | Otomatis bulanan ke lingkungan sementara; hasil menjadi metrik (`SDD-INF-07`). **Tetap milik kita** — penyedia menjamin cadangan ada, bukan bahwa aplikasi berjalan di atas hasil pemulihannya |
| DR drill penuh | Tiap 6 bulan (`NFR-R-04`), memakai runbook §4.6 |

### 4.6 DR runbook (kerangka)

`BR-DR-05` menyatakan RTO ≤ 4 jam tidak sah tanpa runbook. Kerangkanya:

```
0. Deklarasi insiden — siapa berwenang menyatakan DR (Kepala Sekolah / Administrator)
1. Tetapkan titik pemulihan (timestamp PITR)
2. Sediakan instance PostgreSQL baru
3. Pulihkan base backup + putar WAL sampai titik pemulihan
4. Verifikasi: jumlah baris kunci, sidik jari rantai activity log, transaksi terakhir
5. Arahkan aplikasi ke instance baru (variabel lingkungan)
6. Pulihkan object storage bila terdampak
7. Jalankan smoke test alur kritis
8. Umumkan pemulihan; catat kehilangan data aktual vs RPO
9. Post-mortem tertulis dalam 5 hari kerja
```

Setiap langkah memiliki penanggung jawab bernama dan cara verifikasi. Runbook wajib ada **sebelum** go-live (`GL-06`).

### 4.7 Konfigurasi & rahasia

```
# Wajib — startup gagal bila kosong (SDD-INF-08)
DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, TOTP_ENCRYPTION_KEY
GEMINI_API_KEY, FCM_CREDENTIALS
APP_BASE_URL, TZ=UTC

# Opsional dengan bawaan
LOG_LEVEL=info, DB_POOL_SIZE=<TBD-AVL-C>, CHAT_ENABLED=true
```

Rahasia berasal dari *secret manager* (`SEC-CFG-01`), tidak pernah dari berkas di repositori. Validasi skema saat startup mencetak **nama** variabel yang hilang, tidak pernah nilainya.

### 4.8 Lingkungan

| Lingkungan | Data | Deploy | Catatan |
|---|---|---|---|
| Development | Sintetis (`TD-01`) | Lokal | Docker Compose |
| Staging | Salinan produksi **teranonimisasi** (`DP-08`) | Otomatis tiap merge | Menyerupai produksi untuk uji beban |
| Production | Nyata | Manual pada tag rilis | Akses tercatat (`DP-11`) |

Menyalin data produksi ke staging tanpa anonimisasi dilarang keras; skrip anonimisasi adalah bagian dari pipeline penyegaran staging, bukan langkah manual.

---

## 5. Konsekuensi

- Satu image berarti *build* memuat kode API dan worker sekaligus; ukurannya sedikit lebih besar, ditukar dengan jaminan versi yang selaras.
- Migration sebagai job terpisah menambah satu langkah pada deploy dan memerlukan kredensial DDL yang hanya dipegang pipeline.
- PITR menambah kebutuhan penyimpanan arsip WAL yang harus dipantau bersama disk (`OBS-05`).
- Aturan expand/contract berarti perubahan skema yang menghapus kolom memerlukan **dua rilis** — perlu diperhitungkan dalam perencanaan milestone.
- Worker tunggal (`SDD-SYS-08`) berarti drain saat deploy menghentikan sementara pemrosesan job; karena job idempoten dan berjadwal, jeda beberapa menit dapat diterima.
- Karena Compose tidak menyediakan *rolling deploy* ber-*readiness gate* (`SDD-INF-10`), `SDD-INF-04` dan `SDD-INF-05` menjadi **koreografi milik kita**: pemeriksaan kesehatan upstream pada reverse proxy, penggantian instance API satu per satu, `stop_grace_period` bagi drain worker, dan migration sebagai container sekali-jalan. Semuanya wajib diuji di staging dan ditutup *smoke test* (`CD-07`) — sebuah skrip deploy yang tidak diuji adalah *readiness gate* yang tidak ada.
- Compose menggoda menaruh rahasia pada berkas `.env` di repositori. Itu dilarang `SEC-CFG-01`: nilai tetap berasal dari *secret manager* dan disuntikkan ke lingkungan proses (§4.7), dan `SEC-CFG-04` memindai repositori untuk memastikannya.
- Pengecualian `INF-05` **tertutup**: `SDD-INF-11` menetapkan sekolah tidak menjalankan Kubernetes, sehingga Docker Compose (`SDD-INF-10`) berlaku tanpa syarat dan tidak ada cabang manifest kedua yang perlu dipelihara.
- PostgreSQL terkelola (`SDD-INF-11`) memindahkan `SDD-INF-06` dari skrip menjadi konfigurasi langganan, tetapi **tidak** memindahkan `SDD-INF-07`: uji restore tetap milik kita, karena yang diuji adalah aplikasi berjalan di atas hasil pemulihan — bukan keberadaan berkas cadangan.
- Akun DB ber-DDL yang terpisah dari akun aplikasi (`SDD-INF-03`, `SEC-CFG-03`) kini dibuat lewat antarmuka penyedia; batas hak istimewanya diverifikasi sekali saat penyediaan, bukan diasumsikan dari bawaan.
- `DB_POOL_SIZE` (`TBD-AVL-C`) menjadi lebih terikat: batas koneksi ditetapkan tier langganan yang dipilih, bukan oleh konfigurasi PostgreSQL yang dapat kita ubah sendiri.
- Residensi Indonesia (`SDD-SEC-10`) mengikat seluruh komponen §4.2 sekaligus, termasuk object storage `INF-02` dan lokasi cadangan `BR-DR-03`.

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Migration gagal di tengah | Skema tidak konsisten, deploy tertahan | Setiap migration dalam transaksi bila memungkinkan; diuji di staging dengan salinan skema produksi |
| Arsip WAL penuh | Cadangan berhenti diam-diam, RPO terancam | Alarm disk + alarm cadangan gagal (`OBS-05`) |
| Uji restore bulanan tidak dijalankan | Cadangan tidak terbukti | Diotomasi dan menghasilkan metrik; ketiadaannya sendiri memicu alarm |
| Rahasia bocor lewat log startup | Kredensial terekspos | Validasi mencetak nama, bukan nilai; redaction formatter (`SDD-OBS-04`) |
| Sertifikat TLS kedaluwarsa | Layanan tidak dapat diakses | Pembaruan otomatis + alarm < 14 hari |
| Deploy di jam operasional | Gangguan bagi pengguna | Dibatasi kebijakan (`CD-06`); pipeline menolak tag produksi di luar jendela kecuali dipaksa dan dicatat |
| Sekolah tidak punya kapasitas operasional | Sistem tidak terpelihara | Pelatihan Administrator (`IMP-07`); runbook tertulis; hypercare 8 minggu (`IMP-06`) |
| Ketergantungan pada satu penyedia PostgreSQL terkelola | Perpindahan mahal; kenaikan harga sulit ditolak | Skema dan migration memakai PostgreSQL standar (`SDD-DB-12`), tanpa ekstensi khusus penyedia; ekspor logis rutin memastikan data selalu dapat dibawa keluar |
| Region penyedia berubah atau layanan dipindah | Residensi `SDD-SEC-10` terlanggar tanpa disadari | Region dinyatakan dalam kontrak; diperiksa ulang pada rotasi kredensial 6 bulanan ([SDD-13 §4.4](13-security-design.md)) |

---

## 7. Requirement Terkait

`INF-01` … `INF-07` · `CD-01` … `CD-07` · `BR-DR-01` … `BR-DR-06` · `SEC-CFG-01` … `SEC-CFG-04` ·
`NFR-R-01` … `NFR-R-04` · `NFR-A-01` … `NFR-A-04` · `NFR-M-04` `NFR-M-09` `NFR-M-10` · `NFR-SC-01` `NFR-SC-04` ·
`JOB-01` `JOB-03` · `DP-08` `DP-11` · `GL-06` `GL-12` · `IMP-06` `IMP-07` · PRD 27.3, 27.5, 27.9

---

## 8. TBD

| ID | Pertanyaan |
|---|---|
| **TBD-AVL-C** *(dari SDD-01)* | `DB_POOL_SIZE` — bergantung batas koneksi penyedia; ditetapkan setelah uji beban. |

**Tertutup 25 Agustus 2026:** `TBD-INF-A` → `SDD-INF-11`. Sizing dan biaya nyata tetap terbuka bersama `TBD-AVL-C`.
