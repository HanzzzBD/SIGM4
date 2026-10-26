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
| **SDD-INF-05** | Worker **di-drain lebih dulu** saat deploy: berhenti mengambil pekerjaan baru, selesaikan yang berjalan, baru diganti. Drain dipicu `SIGTERM` yang **ditangkap proses sendiri** — `node` sebagai PID 1 container mengabaikan `SIGTERM` tanpa penangkap — dan dibatasi **tenggat internal di bawah `stop_grace_period`**; lewat tenggat, job aktif dilepas tanpa ditunggu, proses keluar dengan kode bukan nol, dan job kembali ke antrean untuk dijalankan ulang (`JOB-03`). API memakai mekanisme yang sama: readiness tidak siap, port berhenti menerima koneksi baru, permintaan berjalan dituntaskan (keputusan pemilik produk, 15 September 2026). |
| **SDD-INF-06** | Cadangan basis data memakai **base backup harian + arsip WAL berkelanjutan** (PITR), bukan hanya `pg_dump` (`BR-DR-01`). |
| **SDD-INF-07** | Uji restore **otomatis bulanan** ke lingkungan sementara; hasilnya menjadi metrik, bukan laporan manual (`BR-DR-04`). |
| **SDD-INF-08** | Seluruh konfigurasi lewat **variabel lingkungan**, divalidasi skema saat *startup*; konfigurasi tidak valid mencegah proses berjalan. |
| **SDD-INF-09** | Zona waktu container dan basis data **UTC** (`INF-07`). Container dipaksa lewat variabel lingkungan `TZ`; sesi basis data dipaksa lewat parameter sesi `TimeZone=UTC` pada setiap koneksi aplikasi dan jalur migration, sehingga tidak bergantung pada setelan penyedia. Keduanya diverifikasi saat startup api dan worker (keputusan pemilik produk, 15 September 2026). |
| **SDD-INF-10** | Orkestrasi memakai **Docker Compose**, bawaan `INF-05`. *Rolling deploy* `SDD-INF-04` dicapai lewat **koreografi pipeline** — reverse proxy (`INF-06`) memeriksa kesehatan upstream, instance API diganti satu per satu — bukan lewat fitur platform. Pengecualian Kubernetes pada `INF-05` **tidak berlaku**: `SDD-INF-11` menetapkan sekolah tidak menjalankan klaster Kubernetes. |
| **SDD-INF-11** | *(Tidak berlaku lagi: production → `SDD-INF-14` sejak 24 Oktober 2026, staging → `SDD-INF-15` sejak 25 Oktober 2026. Dipertahankan sebagai riwayat keputusan.)* **Penyedia infrastruktur: VPS ber-region Indonesia** untuk API, worker, Redis, dan reverse proxy, ditambah **PostgreSQL sebagai layanan terkelola ber-region Indonesia** — bukan container PostgreSQL yang dipelihara sendiri. Object storage `INF-02` mengikuti batasan region yang sama (`SDD-SEC-10`). Menutup `TBD-INF-A` (keputusan pemilik produk, 25 Agustus 2026). Yang diputuskan **hanya penyedianya**; sizing dan biaya nyata (PRD 27.3, 27.9) tetap ditetapkan setelah uji beban `NFR-P-09` bersama `TBD-AVL-C`. |
| **SDD-INF-12** | **Penyedia CI/CD adalah GitHub Actions.** Seluruh tahap §4.3 dijalankan sebagai *workflow* di `.github/workflows/` ([SDD-17 §4.1](17-repo-layout.md)). Gerbang `CD-01`/`CD-02` ditegakkan sebagai *required status check* pada `develop`, `staging`, dan `main`; penegakan itu adalah bagian dari keputusan ini, bukan setelan opsional sesudahnya. Pipeline dibangun `PR-00-17` dan `PR-00-18`. |
| **SDD-INF-13** | *Reverse proxy* adalah **Nginx**, memilih satu dari dua nama yang `INF-06` sebut. Perpanjangan sertifikat Let's Encrypt (`INF-06`) dijalankan **certbot sebagai komponen tersendiri** pada topologi §4.2, bukan oleh proxy. Pemeriksaan kesehatan upstream `SDD-INF-04` memakai mekanisme **pasif** Nginx OSS (`max_fails`/`fail_timeout`) ditambah *readiness gate* pada skrip deploy milik kita (`SDD-INF-10`); *active health check* tidak dipakai karena hanya tersedia pada NGINX Plus. |
| **SDD-INF-14** | **Production berjalan di server milik sekolah** (`INF-05`) dan **menggantikan `SDD-INF-11` untuk production**; staging menyusul ke server yang sama lewat `SDD-INF-15`. Tiga konsekuensi yang ditetapkan sekaligus (keputusan pemilik produk, 24 Oktober 2026): (a) **deploy ditarik, bukan didorong** — pengembang tidak memegang akses ke server, sehingga IT sekolah memasang **self-hosted runner GitHub Actions** berlabel `sigm4-produksi` (koneksi keluar saja) dan job deploy berjalan di sana di bawah environment `production` ber-*required reviewers*; (b) **PostgreSQL berjalan sebagai container** pada Compose production, bukan layanan terkelola; (c) object storage **tetap Backblaze B2** (`INF-02`). Server dapat diakses publik lewat domain, sehingga `INF-06`/`SDD-INF-13` (Let's Encrypt HTTP-01 + certbot) tetap berlaku. Pipeline dibangun `PR-08-17`. |
| **SDD-INF-15** | **Staging berjalan di server sekolah yang sama dengan production, di belakang satu proxy tepi bersama** (keputusan pemilik produk, 25 Oktober 2026). (a) **Dua stack Compose terpisah dari satu berkas** `deploy/production/` — proyek `sigm4-staging` dan `sigm4-production`, masing-masing dengan PostgreSQL, Redis, ClamAV, volume, dan berkas env sendiri; (b) **proxy tepi** `deploy/edge/` (Nginx + certbot) menjadi satu-satunya pemegang port 80/443 dan TLS untuk kedua domain, meneruskan ke Nginx tiap stack lewat jaringan Docker `sigm4-edge`; Nginx stack tidak memegang port host; (c) deploy staging **ditarik self-hosted runner berlabel `sigm4-staging`** pada push ke cabang `staging` — jalur yang sama dengan production (`SDD-INF-14` a) — sedangkan smoke test (`CD-07`) tetap dari luar server. Pipeline dibangun `PR-08-18`. |

---

## 3. Alasan

**SDD-INF-01 — satu image.** Dua image berarti dua *build*, dua tag, dan kemungkinan API versi X berjalan bersama worker versi Y. Karena keduanya berbagi basis kode (`SDD-SYS-08`), satu image dengan *entrypoint* berbeda menghilangkan seluruh kelas masalah itu.

**SDD-INF-03 — migration sebagai job terpisah.** Menjalankan migration saat *startup* aplikasi menyebabkan beberapa instance mencoba bermigrasi bersamaan, dan menuntut akun aplikasi memiliki hak DDL — yang justru dilarang `SEC-CFG-03`. Job terpisah berjalan sekali, dengan akun berbeda, sebelum trafik berpindah.

**SDD-INF-05 — drain worker.** Worker menjalankan pekerjaan yang menyentuh uang dan tenggat: penerbitan denda, pembatalan slot, pengiriman notifikasi. Mematikannya di tengah pekerjaan memang aman karena job idempoten (`JOB-03`), tetapi menghasilkan percobaan ulang dan alarm yang tidak perlu. Drain lebih rapi.

**SDD-INF-06 — PITR, bukan dump harian.** `NFR-R-01` menetapkan RPO ≤ 24 jam, yang secara harfiah dipenuhi `pg_dump` harian. Tetapi itu berarti kehilangan hingga 24 jam transaksi pada skenario terburuk — untuk sistem yang mencatat serah terima aset dan denda, itu mahal. Arsip WAL menurunkan kehilangan nyata ke hitungan menit dengan biaya penyimpanan yang kecil. Ini melampaui requirement secara sengaja, bukan kebetulan.

**SDD-INF-07 — restore diuji otomatis.** Cadangan yang tidak pernah dipulihkan bukan cadangan. `BR-DR-04` mewajibkan uji berkala; mengotomasinya membuat kegagalan terdeteksi dalam sebulan, bukan saat bencana.

**SDD-INF-08 — konfigurasi divalidasi saat startup.** Konfigurasi yang salah sebaiknya mencegah proses berjalan, bukan menghasilkan perilaku aneh di produksi. Bila `CHAT_ENABLED=true`, kunci Gemini API kosong menggagalkan *startup*. Bila false, kunci boleh kosong dan chatbot mengembalikan 503 tanpa mengganggu modul lain (keputusan pengguna 14 Oktober 2026, M-19 §7).

**SDD-INF-13 — Nginx, dan dua konsekuensi yang ikut dengannya.** `INF-06` menyebut dua nama; memilih di antaranya bukan soal selera karena `deployment-ops.md` §Topologi dan [SDD-13 §3](13-security-design.md) sudah menulis "Nginx" dalam prosa, sehingga garis miring itu sebenarnya sudah berselisih dengan dua berkas. Keputusan ini menyelaraskannya ke arah yang sudah tertulis.

Yang tidak boleh disembunyikan adalah harganya, karena Caddy — kandidat yang ditolak — menyediakan keduanya secara bawaan. **Pertama**, HTTPS otomatis: Nginx tidak memperbarui sertifikatnya sendiri, sehingga `INF-06` ("diperbarui otomatis") menuntut certbot hadir sebagai komponen dan pembaruannya ikut dipantau — sebuah sertifikat yang gagal diperpanjang mematikan seluruh sistem dan gejalanya baru muncul pada hari ke-90. **Kedua**, `SDD-INF-04` menuntut *readiness gate*, dan Nginx OSS hanya memiliki pemeriksaan **pasif**: ia menandai upstream mati setelah permintaan nyata gagal, bukan sebelumnya. Konsekuensinya bukan bahwa `SDD-INF-04` tidak terpenuhi, melainkan bahwa pemenuhannya berpindah sepenuhnya ke skrip deploy — yang memang sudah menjadi milik kita menurut `SDD-INF-10`, dan yang §5 sudah wajibkan diuji di staging serta ditutup *smoke test* (`CD-07`).

Alasan menerimanya: keduanya jatuh pada pekerjaan yang sudah ada pemiliknya, sementara keunggulan Nginx — jumlah contoh operasional dan kemudahan mencari jawaban saat ada yang salah — jatuh tepat pada pihak yang [§6](#6-risiko-teknis) tandai sebagai risiko kapasitas operasional.

**SDD-INF-12 — GitHub Actions, dinyatakan alih-alih tersirat.** Sebelum keputusan ini yang ditetapkan hanyalah **letak** berkasnya — `.github/workflows/` pada [SDD-17 §4.1](17-repo-layout.md) — sehingga penyedianya tersirat dari tata letak dan tidak pernah tertulis di mana pun. Itu bukan detail administratif: `CD-01` dan `CD-02` adalah gerbang yang **memblokir merge**, dan sebuah gerbang yang memblokir merge hanya ada bila ia berupa *required status check* pada penyedia yang sama dengan tempat pull request dinilai. Repositori, `CODEOWNERS` (`BRANCHING §3.1`), template PR, dan proteksi cabang sudah berada di GitHub; menaruh eksekusi pipeline di tempat lain berarti gerbang rilis dinilai di satu sistem dan ditegakkan di sistem lain.

Penyedia lain ditolak atas dasar itu, bukan atas dasar fitur. **GitLab CI** membawa tahap SAST/SCA/DAST bawaan yang relevan bagi `ST-01`…`ST-03`, tetapi menuntut repositori dan seluruh perkakas tata kelolanya ikut pindah atau dicerminkan — dan cermin adalah dua sumber. **CI swa-kelola** ditolak dengan alasan yang sama dengan penolakan observability swa-kelola pada [SDD-15 §3](15-observability-logging.md): ia menambah satu layanan lagi yang dioperasikan sekolah, tepat pada risiko kapasitas operasional yang §6 sudah tandai.

Keputusan ini **tidak** mengubah isi maupun urutan §4.3. Tahapnya ditetapkan `CD-01`; yang ditetapkan di sini hanya siapa yang menjalankannya.

**SDD-INF-10 — Docker Compose.** `INF-05` sudah menetapkan bawaannya sekaligus syarat pengecualiannya, jadi yang tersisa bukan memilih bebas melainkan memeriksa apakah syarat itu terpenuhi — dan `SDD-INF-11` menetapkan bahwa ia **tidak** terpenuhi: sekolah tidak menjalankan klaster Kubernetes. Keputusan #1 (single sekolah, satu instansi) juga menghapus argumen terkuat Kubernetes sejak awal: tidak ada armada instalasi yang perlu dikelola seragam.

Gesekan yang nyata hanya satu, dan sebaiknya dinyatakan terbuka: `SDD-INF-04` menuntut *rolling deploy* ber-*readiness gate*, dan Compose tidak menyediakannya sebagai fitur platform. Kubernetes memberikannya gratis (`readinessProbe`, rolling update, `preStop`, `Job` untuk migration). Yang membuat itu tidak cukup sebagai alasan adalah bahwa biayanya sudah dibayar kebijakan: `NFR-A-01` menetapkan ketersediaan ≥ 99,5% pada jam operasional — bukan angka yang menuntut deploy tanpa jeda — sementara `CD-06` dan `NFR-A-03` memindahkan deploy ke luar jam operasional dengan anggaran *downtime* terencana 4 jam/bulan (`NFR-A-04`). Keunggulan utama Kubernetes karena itu sebagian besar membeli sesuatu yang tidak sedang kurang, dengan menurunkan *control plane* kepada pihak yang §6 sudah tandai berisiko.

**SDD-INF-11 — PostgreSQL terkelola, sisanya swa-kelola.** Keputusan ini memilah komponen menurut apa yang terjadi bila ia terabaikan, bukan menurut biaya.

API, worker, Redis, dan reverse proxy gagal dengan **berisik**: layanan mati, alarm berbunyi, seseorang memperbaikinya. Menjalankannya sendiri di VPS dapat diterima karena kegagalannya terlihat pada hari yang sama.

PostgreSQL gagal dengan **diam**. `SDD-INF-06` menuntut base backup harian + arsip WAL berkelanjutan, dan `SDD-INF-07` menuntut uji restore otomatis bulanan — dua kewajiban yang, bila dijadikan skrip milik sendiri, akan bertahan persis selama ada yang memeliharanya. Setelah hypercare `IMP-06` berakhir, pemeliharaan itu jatuh ke pihak yang §6 sudah tandai sebagai risiko dengan mitigasi berupa pelatihan. Arsip WAL yang berhenti tidak menampilkan gejala apa pun sampai ada yang mencoba memulihkan; pada saat itu RPO `NFR-R-01` sudah terlanggar berbulan-bulan tanpa satu pun alarm berbunyi.

Menyerahkan PITR dan uji restore kepada penyedia memindahkan dua kewajiban itu dari disiplin ke kontrak. Harganya nyata dan ditanggung sadar — ia adalah baris biaya pada PRD 27.9, ditukar dengan satu-satunya komponen yang kehilangannya tidak dapat diperbaiki.

Region Indonesia berlaku bagi seluruh komponen sebagai konsekuensi langsung `SDD-SEC-10`, bukan sebagai pilihan terpisah.

**SDD-INF-14 — server sekolah, dan apa yang hilang karenanya.** Keputusan ini datang dari pemilik produk, bukan dari perbandingan teknis: server production milik sekolah dan pengembang tidak diberi akses. Yang ditetapkan di sini adalah cara menjalankannya tanpa akses itu.

*Runner, bukan SSH.* Deploy staging didorong lewat SSH dari runner GitHub (`PR-00-18`) — jalur yang mustahil tanpa akses. Tiga alternatif ditimbang: paket rilis yang dijalankan manual oleh IT sekolah, agen *pull* swa-tulis bertimer, dan self-hosted runner. Paket manual membuat migration, readiness gate, dan smoke test bergantung pada disiplin operator di setiap rilis; agen swa-tulis adalah satu layanan lagi milik kita yang hasilnya tidak terlihat di GitHub. Runner mempertahankan `SDD-INF-12` utuh — gerbang, persetujuan, dan log rilis tetap di satu tempat — dengan biaya satu kali pemasangan oleh IT sekolah, dan tanpa membuka port masuk.

*PostgreSQL container — alasan `SDD-INF-11` kini berbalik menjadi kewajiban.* `SDD-INF-11` memilih layanan terkelola justru karena PITR dan uji restore yang diswa-kelola "bertahan persis selama ada yang memeliharanya". Pada server sekolah tidak ada layanan terkelola yang dapat memikulnya, sehingga `SDD-INF-06` (base backup + arsip WAL) kembali menjadi skrip milik kita, dimiliki `PR-08-07`, dan alarm cadangan gagal (`OBS-05`) tidak lagi opsional. Dump pra-migration pada setiap deploy (`RELEASE-PLAN §3` langkah 2) bukan pengganti PITR; ia hanya jaring pengaman untuk satu rilis.

*Staging sempat tidak identik dengan production* pada lapisan basis data (terkelola vs container); `SDD-INF-15` menghapus selisih itu — keduanya kini PostgreSQL container dari berkas Compose yang sama.

**SDD-INF-15 — staging menumpang server production, dan harganya.** Pemilik produk menetapkan staging juga di server sekolah, dideploy lewat jalur yang sama. Tiga bentuk ditimbang untuk dua stack di satu server: proxy tepi bersama, staging pada port lain, dan staging yang hanya hidup sebelum go-live. Port lain menuntut port tambahan dibuka dan sertifikat DNS-01 yang bergantung pada penyedia DNS sekolah; staging sementara meniadakan staging tepat ketika rilis berikutnya membutuhkannya. Proxy tepi bersama memindahkan TLS dan certbot (`SDD-INF-13`) dari tiap stack ke satu komponen yang merender situs per domain — blok HTTPS baru dipasang setelah sertifikat domain itu ada, sehingga penerbitan pertama tidak terkunci — sementara Nginx tiap stack tetap memegang koreografi rolling deploy (`SDD-INF-04`, keputusan 61). Harganya dinyatakan: (a) staging berbagi CPU, memori, dan disk dengan production — uji beban `NFR-P-09` tidak dijalankan pada staging di jam operasional, dan IT sekolah boleh menghentikan stack staging bila production membutuhkan sumber dayanya; (b) proxy tepi menjadi titik tunggal kedua domain — konfigurasinya diuji `nginx -t` sebelum dimuat ulang dan konfigurasi lama dikembalikan bila ditolak; (c) satu hop proxy bertambah — Nginx stack memercayai `X-Forwarded-For` yang ditimpa proxy tepi (`real_ip`), sehingga API tetap melihat IP klien satu hop (`NFR-S-07`).

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
server sekolah (SDD-INF-14, SDD-INF-15)                                   layanan eksternal
──────────────────────────────────────────────────────────────────    ─────────────────
proxy tepi  ─┬─→ stack sigm4-production: nginx → api ×2, worker ×1      object storage B2 (INF-02)
 nginx (TLS,  │                           postgres, redis, ClamAV        FCM
 HSTS)        └─→ stack sigm4-staging:    (topologi sama, data
 certbot                                  teranonimisasi DP-08)
        jaringan Docker sigm4-edge; hanya proxy tepi memegang 80/443
```

Web (hasil build Vite, `SDD-FE-14`) disajikan sebagai aset statis **oleh Nginx pada origin yang sama dengan API** — web di `/`, API di `/api/v1` — bukan dari CDN berorigin lain dan bukan dari proses Node. Konsekuensinya `cors` tidak dipasang ([SDD-06 §4.2](06-api-design.md)).

**Pengiriman & job migration** (keputusan pemilik produk, 15 September 2026). Image yang lulus pipeline — artefak yang sama dengan yang dipindai Trivy — diterbitkan ke **GHCR** bertag SHA commit, lalu ditarik runner di server sekolah. Job migration (`SDD-INF-03`) berjalan sebagai container sekali-jalan dari **image yang sama**, sehingga api, worker, dan skema berasal dari satu tag (`SDD-INF-01`); runtime image karena itu memuat `apps/api/migrations/`, `scripts/migrate.mjs`, dan dbmate, tetapi tidak npm. Topologi kedua stack beserta koreografinya berada di `deploy/production/`, proxy tepi di `deploy/edge/`, dan smoke test (`CD-07`) di `deploy/staging/` ([SDD-17 §4.1](17-repo-layout.md)).

**Production (`SDD-INF-14`)** memakai topologi yang sama di server sekolah dengan satu tambahan: `postgres` sebagai container tanpa port host, membaca berkas env migration (akun pemilik skema); `sigm4_app` tetap dibuat migration. Berkasnya di `deploy/production/` dan sejak `SDD-INF-15` dipakai juga oleh stack staging; TLS dan certbot berada di proxy tepi `deploy/edge/`, sehingga Nginx stack tidak memegang port host. Aset web per tag diterbitkan sebagai GitHub Release, sehingga rollback memakai aset yang persis sama.

**Replika dan arsip WAL bukan container pada topologi ini.** Pada production keduanya skrip milik `PR-08-07` (`SDD-INF-14`); staging cukup dengan dump pra-migration tiap deploy karena datanya salinan teranonimisasi yang dapat disegarkan ulang (`DP-08`). Redis tetap swa-kelola di tiap stack: kehilangannya berarti kehilangan cache dan *rate limit* — degradasi yang `SDD-SEC-05` dan §6 sudah antisipasi — bukan kehilangan data.

### 4.3 Pipeline CI/CD

```
push / PR                     .github/workflows/ci.yml — required check `CI lulus`
 ├─ lint
 ├─ unit test
 ├─ integration test          termasuk uji konkurensi CC-01..07
 │                            cakupan gabungan unit+integrasi < 70% statements/lines → stop
 │                            (CD-02, NFR-M-03); uji ter-skip → stop
 ├─ uji otorisasi tergenerate SEC-T-01
 ├─ build image
 ├─ SAST                      ST-01  CodeQL — security-severity ≥ 7,0 → stop   (SDD-SEC-11)
 ├─ SCA                       ST-02  dependency-review + npm audit — Critical/High → stop
 │                                   (harian: sca-harian.yml; alert & PR: Dependabot)
 ├─ image scan                CD-01  Trivy — HIGH/CRITICAL → stop
 └─ deploy staging  →  DAST (ST-03, OWASP ZAP)  →  smoke test (CD-07)

tag rilis                      .github/workflows/rilis-produksi.yml (SDD-INF-14)
 ├─ seluruh gerbang di atas   ci.yml dipanggil ulang; image hasil run itu → GHCR :vX.Y.Z
 ├─ persetujuan + jendela     environment `production`; CD-06 dinilai saat deploy berjalan
 ├─ dump pra-migration        RELEASE-PLAN §3 langkah 2
 ├─ migration job (akun DDL)                        CD-04
 ├─ rolling deploy api (readiness gate)             SDD-INF-04
 ├─ drain + ganti worker                            SDD-INF-05
 └─ smoke test produksi                             CD-07  (dari runner GitHub, fixture [SMOKE])
```

Job deploy berjalan di self-hosted runner server sekolah; smoke test berjalan dari runner GitHub terhadap domain publik. Rollback (`CD-05`) adalah `workflow_dispatch` dengan tag terdahulu: tanpa build ulang, image dari GHCR dan aset web dari GitHub Release tag itu.

Deploy produksi berjalan di luar jam operasional dan diumumkan H-2 (`NFR-A-03`, `CD-06`).

`PR-03-36` menjalankan `deploy/staging/smoke-test.sh <origin> --full` dari runner terhadap origin publik; Python 3 standar menjalankan alur API dengan sesi JWT hasil login nyata. Kredensial, termasuk TOTP bila aktif, hanya lewat environment secret staging; token dan URL unggah tidak dicetak atau ditulis ke artefak. URL wajib HTTPS, redirect ditolak, dan unggah foto memakai presigned PUT tanpa header otorisasi API. Pembersihan dijalankan setelah keberhasilan maupun kegagalan; kegagalan pembersihan menggagalkan gerbang. Kebijakan fixture mengikuti `CD-07`; petunjuk operasional ada di [runbook smoke](../IMPLEMENTATION/runbooks/smoke-test.md). `--health-only` hanya pemeriksaan diagnostik eksplisit. Pengecualian HTTP loopback memerlukan `SMOKE_ALLOW_HTTP_LOOPBACK=1` untuk uji lokal, bukan konfigurasi deploy.

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
DATABASE_URL, REDIS_URL, S3_ENDPOINT, S3_PUBLIC_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
CLAMAV_URL        (tcp://host:port — api: av_scanner di /health; worker: pemindaian, SDD-FS-04)
JWT_PRIVATE_KEY, JWT_PUBLIC_KEY, TOTP_ENCRYPTION_KEY
GEMINI_API_KEY   (wajib hanya bila CHAT_ENABLED=true)
APP_BASE_URL, TZ=UTC

# Opsional dengan bawaan
LOG_LEVEL=info, DB_POOL_SIZE=<TBD-AVL-C>, CHAT_ENABLED=false
WORKER_HEALTH_PORT=3000   (worker saja, SDD-SYS-08: port /health. Ubah HANYA bila api & worker berbagi satu host pengembangan; container dan healthcheck deploy memakai 3000)

# Opsional tanpa bawaan — kosong berarti fitur dilewati, bukan startup gagal
FCM_CREDENTIALS   (keputusan 80a, SDD-08 §4.4a: push dilewati, `fcm` di /health tidak memengaruhi `ready`)
CHROMIUM_EXECUTABLE_PATH   (SDD-FS-12, PR-03-02: kosong = Chrome terpasang; image runtime mengisinya dengan Chromium dari apk)
```

**Kunci JWT** (`PR-02-02`). `JWT_PRIVATE_KEY` dan `JWT_PUBLIC_KEY` berformat PEM Ed25519 (PKCS#8 dan SPKI; `\n` literal diterima untuk berkas env satu baris). Membangkitkan pasangan: `openssl genpkey -algorithm ed25519 -out jwt-private.pem && openssl pkey -in jwt-private.pem -pubout -out jwt-public.pem`. Startup menolak pasangan yang tak cocok tanpa mencetak isinya. Kunci publik cukup bagi komponen yang hanya memverifikasi (`SDD-SESS-02`).

**Kunci TOTP** (`PR-02-07`). `TOTP_ENCRYPTION_KEY` berformat base64 dari tepat **32 byte** (`openssl rand -base64 32`); ia mengenkripsi secret TOTP (AES-256-GCM, `SDD-SESS-08`) dan **terpisah** dari kunci JWT karena siklus rotasinya berbeda. Startup menolak nilai yang bukan base64 sah atau bukan 32 byte tanpa mencetak isinya. Kehilangan kunci ini berarti seluruh 2FA harus didaftarkan ulang (SDD-04 §6): cadangkan terpisah dari basis data. API memvalidasinya sejak `PR-02-07`; worker (termasuk CLI break-glass, `SDD-SESS-11`) memvalidasinya sejak `PR-02-08` — meski logikanya sendiri tidak mendekripsi apa pun, validasi menutup celah startup diam-diam (`SDD-INF-08`).

**Validasi bertahap.** Daftar di atas adalah keadaan akhir. Skema `shared/config` (`SDD-SYS-14`) memuat sebuah variabel sejak PR pertama yang memakainya; sebelum itu variabel tersebut tidak dituntut. `S3_ENDPOINT` dipakai operasi sisi server, sedangkan `S3_PUBLIC_ENDPOINT` — origin yang dapat dijangkau peramban dan aplikasi mobile — dipakai presigned URL dan `img-src` (`SDD-FS-13`). `CLAMAV_URL` (`PR-03-05`, keputusan 8a log phase-03) wajib bagi API dan worker; worker sejak PR yang sama juga menuntut `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` karena pemindai membaca dan menghapus objek, tetapi tidak `S3_PUBLIC_ENDPOINT`. `APP_BASE_URL` adalah origin halaman publik QR (`https://{domain}/a/{asset_uuid}`, `FR-05.1`) dan masuk skema bersama `PR-03-01`.

**Dua akun basis data, dua variabel.** `DATABASE_URL` memuat akun **aplikasi** — `sigm4_app`, tanpa hak DDL dan tanpa `UPDATE`/`DELETE` atas `activity_logs` (`SEC-CFG-03`, `AL-03b`, `SDD-DB-11`). `MIGRATION_DATABASE_URL` memuat akun **migration** ber-DDL yang memiliki skema, dan **hanya** job migration (`SDD-INF-03`) yang membacanya; proses API dan worker tidak pernah menerimanya. Bila ia tidak diisi, jalur migration jatuh kembali ke `DATABASE_URL` — kemudahan pengembangan yang di production ditutup oleh kenyataan bahwa akun aplikasi memang tidak dapat menjalankan DDL.

Rahasia berasal dari *secret manager* (`SEC-CFG-01`), tidak pernah dari berkas di repositori. Validasi skema saat startup mencetak **nama** variabel yang hilang, tidak pernah nilainya.

### 4.8 Lingkungan

| Lingkungan | Data | Deploy | Catatan |
|---|---|---|---|
| Development | Sintetis (`TD-01`) | Lokal | Docker Compose |
| Staging | Salinan produksi **teranonimisasi** (`DP-08`) | Push ke cabang `staging`; runner `sigm4-staging` di server sekolah (`SDD-INF-15`) | Topologi sama dengan produksi; berbagi server, sehingga uji beban di luar jam operasional |
| Production | Nyata | Tag rilis + persetujuan environment `production`; runner di server sekolah (`SDD-INF-14`) | Akses tercatat (`DP-11`); server dioperasikan IT sekolah |

Menyalin data produksi ke staging tanpa anonimisasi dilarang keras; skrip anonimisasi adalah bagian dari pipeline penyegaran staging, bukan langkah manual.

---

## 5. Konsekuensi

- Satu image berarti *build* memuat kode API dan worker sekaligus; ukurannya sedikit lebih besar, ditukar dengan jaminan versi yang selaras.
- Migration sebagai job terpisah menambah satu langkah pada deploy dan memerlukan kredensial DDL yang hanya dipegang pipeline.
- PITR menambah kebutuhan penyimpanan arsip WAL yang harus dipantau bersama disk (`OBS-05`).
- Aturan expand/contract berarti perubahan skema yang menghapus kolom memerlukan **dua rilis** — perlu diperhitungkan dalam perencanaan milestone.
- Worker tunggal (`SDD-SYS-08`) berarti drain saat deploy menghentikan sementara pemrosesan job; karena job idempoten dan berjadwal, jeda beberapa menit dapat diterima.
- **Jeda serah terikat pada Nginx.** Container yang `healthy` belum tentu dipakai Nginx lagi: nama upstream diselesaikan ulang setelah `valid` resolver dan tanda gagal lepas setelah `fail_timeout` (keduanya 5 s). `deploy.sh` karena itu menunggu `JEDA_SERAH_DETIK` (12 s) setelah `api-1` siap sebelum mengganti `api-2`; tanpanya kedua upstream dianggap mati dan Nginx menjawab 502 (keputusan pemilik produk, 15 September 2026).
- **Tenggat drain terikat pada `stop_grace_period`.** Worker: tenggat 50 s dari 60 s; API: 25 s dari 30 s (`deploy/production/docker-compose.yml`). Mengubah salah satunya tanpa yang lain mengembalikan pemutusan paksa tanpa jejak. Job yang lebih lama dari tenggat worker selalu terputus saat deploy dan dijalankan ulang; bila itu terjadi dua kali pada job yang sama, BullMQ menandainya `failed` (`maxStalledCount` 1) dan alarm `JOB-06` berbunyi — perilaku yang dipertahankan dengan sengaja.
- **certbot menjadi komponen kelima pada topologi §4.2** (`SDD-INF-13`), sejak `SDD-INF-15` hidup di proxy tepi dan memperpanjang sertifikat kedua domain, dan kegagalan perpanjangannya wajib memicu alarm (`OBS-05`) — bukan diketahui saat sertifikat sudah kedaluwarsa.
- **Turunan gambar membawa libvips ke dalam image** lewat `sharp` (`SDD-FS-07`, `PR-03-07`): biner siap pakai musl, ikut pindaian `CD-01` seperti Chromium.
- **Pembangkit PDF membawa Chromium ke dalam image** (`SDD-FS-12`). Karena API dan worker berbagi satu image (`SDD-INF-01`), image API ikut membesar dan permukaan yang dipindai `CD-01` ikut bertambah. Diterima sadar; bila ukurannya menjadi persoalan, jalannya adalah memisahkan image — perubahan pada `SDD-INF-01`, bukan penggantian pembangkit PDF secara diam-diam.
- `SDD-INF-12` menjadikan proteksi cabang bagian dari infrastruktur, bukan kebiasaan: daftar *required status check* pada `develop`, `staging`, dan `main` wajib disetel manual di GitHub dan **tidak dapat diberkaskan** — keadaannya dilacak [`IMPLEMENTATION/GITHUB-CI-STATE.md §4`](../IMPLEMENTATION/GITHUB-CI-STATE.md). Pipeline yang hijau tanpa setelan itu tidak memblokir apa pun.
- Karena Compose tidak menyediakan *rolling deploy* ber-*readiness gate* (`SDD-INF-10`), `SDD-INF-04` dan `SDD-INF-05` menjadi **koreografi milik kita**: pemeriksaan kesehatan upstream pada reverse proxy, penggantian instance API satu per satu, `stop_grace_period` bagi drain worker, dan migration sebagai container sekali-jalan. Semuanya wajib diuji di staging dan ditutup *smoke test* (`CD-07`) — sebuah skrip deploy yang tidak diuji adalah *readiness gate* yang tidak ada.
- Compose menggoda menaruh rahasia pada berkas `.env` di repositori. Itu dilarang `SEC-CFG-01`: nilai tetap berasal dari *secret manager* dan disuntikkan ke lingkungan proses (§4.7), dan `SEC-CFG-04` memindai repositori untuk memastikannya.
- Pengecualian `INF-05` **tertutup**: `SDD-INF-11` menetapkan sekolah tidak menjalankan Kubernetes, sehingga Docker Compose (`SDD-INF-10`) berlaku tanpa syarat dan tidak ada cabang manifest kedua yang perlu dipelihara.
- PostgreSQL terkelola (`SDD-INF-11`) memindahkan `SDD-INF-06` dari skrip menjadi konfigurasi langganan, tetapi **tidak** memindahkan `SDD-INF-07`: uji restore tetap milik kita, karena yang diuji adalah aplikasi berjalan di atas hasil pemulihan — bukan keberadaan berkas cadangan.
- Akun DB ber-DDL yang terpisah dari akun aplikasi (`SDD-INF-03`, `SEC-CFG-03`) kini dibuat lewat antarmuka penyedia; batas hak istimewanya diverifikasi sekali saat penyediaan, bukan diasumsikan dari bawaan.
- `DB_POOL_SIZE` (`TBD-AVL-C`) menjadi lebih terikat: batas koneksi ditetapkan tier langganan yang dipilih, bukan oleh konfigurasi PostgreSQL yang dapat kita ubah sendiri.
- Residensi Indonesia (`SDD-SEC-10`) mengikat seluruh komponen §4.2 sekaligus, termasuk object storage `INF-02` dan lokasi cadangan `BR-DR-03`.
- **`SDD-INF-14` memindahkan `SDD-INF-06` kembali ke kita untuk production.** Baris "disediakan layanan terkelola" pada §4.5 hanya berlaku bagi staging; base backup + arsip WAL production dibangun dan diuji `PR-08-07` pada server sekolah, dan cadangannya wajib keluar dari server itu (`BR-DR-03`).
- **Gerbang rilis bergantung pada runner sekolah.** Runner yang mati atau server yang tidak menjangkau GitHub/GHCR menahan deploy di status *queued* — gagal dengan berisik, bukan diam. Pemasangan dan pemeliharaan runner masuk runbook serah terima (`IMP-08`).
- Smoke test produksi memakai fixture `[SMOKE]` yang sama polanya dengan staging (`CD-07`); tiket uji dan auditnya tersimpan di data production (keputusan pemilik produk, 24 Oktober 2026).

---

## 6. Risiko Teknis

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Migration gagal di tengah | Skema tidak konsisten, deploy tertahan | Setiap migration dalam transaksi bila memungkinkan; diuji di staging dengan salinan skema produksi |
| Arsip WAL penuh | Cadangan berhenti diam-diam, RPO terancam | Alarm disk + alarm cadangan gagal (`OBS-05`) |
| Uji restore bulanan tidak dijalankan | Cadangan tidak terbukti | Diotomasi dan menghasilkan metrik; ketiadaannya sendiri memicu alarm |
| Rahasia bocor lewat log startup | Kredensial terekspos | Validasi mencetak nama, bukan nilai; redaction formatter (`SDD-OBS-04`) |
| Sertifikat TLS kedaluwarsa | Layanan tidak dapat diakses | Pembaruan otomatis + alarm < 14 hari |
| Deploy di jam operasional | Gangguan bagi pengguna | Dibatasi kebijakan (`CD-06`); pipeline menolak deploy produksi **di dalam** jam operasional (Senin–Sabtu 06.00–18.00 WIB) kecuali dipaksa dengan alasan yang tercatat di log job (`deploy/production/jendela-deploy.sh`) |
| Repositori **publik** + self-hosted runner: workflow dari PR fork menarget label `sigm4-produksi` atau `sigm4-staging` (`SDD-INF-15`) dan mengeksekusi kode di server sekolah (akses Docker ≈ root) | Server production disusupi — stack staging berbagi server yang sama | Risiko diterima sadar (keputusan pemilik produk, 24 Oktober 2026) dengan empat mitigasi wajib: workflow fork **selalu** menunggu persetujuan (*Require approval for all external contributors*); ruleset tag `v*` hanya untuk pemilik repo; environment `production` ber-*required reviewers* dan dibatasi cabang `main` + tag `v*`; runner berjalan dengan akun khusus tanpa sudo. Job staging tidak ber-reviewer, sehingga cabang `staging` diproteksi (push hanya pemilik repo/maintainer, *required status check* `CI lulus`) dan environment `staging` dibatasi cabang itu. Menyetujui run fork tanpa membaca diff `.github/workflows/` dilarang |
| Runner sekolah mati atau dicabut | Rilis dan rollback tertahan | Runbook pemasangan ulang untuk IT sekolah; `deploy.sh` tetap dapat dijalankan manual dari server sebagai jalur darurat (`SDD-INF-14`) |
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
