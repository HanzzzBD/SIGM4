# Log Phase 08 — Pengerasan & Kesiapan Rilis

| | |
|---|---|
| **Phase** | [`phases/phase-08.md`](../phases/phase-08.md) |
| **Milestone PRD** | `M6 — **menutup M6**` |
| **Status** | Lihat [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) |
| **Mulai** | — |
| **Selesai** | — |

Log ini mencatat **apa yang benar-benar terjadi** selama phase berjalan: keputusan yang diambil, hal yang berbeda dari rencana, dan angka hasil pengukuran. Ia bukan salinan rencana — rencananya ada di [`phases/phase-08.md`](../phases/phase-08.md).

Log tidak boleh memuat requirement, keputusan desain, maupun business rule baru. Bila selama phase muncul kebutuhan akan salah satunya, ia dinaikkan ke PRD atau SDD lebih dulu, dan log ini hanya mencatat bahwa hal itu terjadi.

---

## 1. Catatan harian

| Tanggal | Yang terjadi | PR terkait |
|---|---|---|
| 24 Oktober 2026 | Pemilik produk menetapkan production di **server milik sekolah**, tanpa akses bagi pengembang, lalu meminta pipeline CI/CD production disiapkan. Empat keputusan diambil lewat `AskUserQuestion` (keputusan 1–5). PRD `INF-05` dan SDD-16 (`SDD-INF-14`) disunting **sebelum** kode. Dikerjakan di worktree terpisah dari `origin/develop`, karena checkout utama memuat ±540 berkas tak ter-commit milik cabang `PR-04-01`. | `PR-08-17` |
| 25 Oktober 2026 | Setelah #182 tergabung, pemilik produk menanyakan kesiapan deploy. Hasil periksa: develop hijau penuh, tetapi tidak ada environment, secret, runner, maupun cabang `staging` di GitHub; `main` tertinggal di `3703c037`. Pemilik produk menetapkan staging juga di server sekolah, dideploy IT sekolah (keputusan 9–11). `PR-08-18` dibuka [#184](https://github.com/HanzzzBD/SIGM4/pull/184): proxy tepi `deploy/edge/`, stack Compose per lingkungan dari `deploy/production/`, job `deploy-staging` lewat runner `sigm4-staging`, smoke staging dari luar, runbook gabungan untuk IT sekolah. | `PR-08-18`, [#184](https://github.com/HanzzzBD/SIGM4/pull/184) |
| 28 Oktober 2026 | IT sekolah memasang **Dokploy** khusus SIGM4 dan memberi pengembang akses dashboard (tanpa SSH). Desain `SDD-INF-14` (a) dan `SDD-INF-15` (b)(c) — runner di server dan proxy tepi milik kita — tidak lagi cocok. Lewat `AskUserQuestion` pemilik produk memilih pindah ke Dokploy (keputusan 12–13); di tengah pengerjaan IT sekolah menyampaikan bahwa **nginx sekolah** memegang domain, SSL, dan seluruh routing (`/api` → 3010, `/` → 3011 untuk produksi), SIGM4 tidak boleh punya nginx routing sendiri, dan port 3000 sudah terpakai (keputusan 14–15). `SDD-INF-16` ditulis sebelum kode. Setelah #202/#203 tergabung, pemilik produk memutuskan tidak membuat subdomain staging dulu dan langsung memakai produksi (keputusan 16–17). | `PR-08-19`, `PR-08-20` |

## 2. Keputusan yang diambil

Keputusan teknis yang tidak berasal dari PRD maupun SDD, dan alasannya. Bila sebuah keputusan ternyata menyentuh requirement atau desain, ia **wajib** dinaikkan ke PRD/SDD, bukan diselesaikan di sini.

| # | Keputusan | Alasan | Menaikkan ke PRD/SDD? |
|:---:|---|---|:---:|
| 1 | Production di server sekolah. Deploy lewat **self-hosted runner** berlabel `sigm4-produksi` yang dipasang IT sekolah, di bawah environment `production` ber-reviewer (pemilik produk). | Tanpa akses SSH, deploy dorong `PR-00-18` mustahil; runner mempertahankan gerbang dan log di GitHub (`SDD-INF-12`) | Ya — PRD `INF-05`, `SDD-INF-14` |
| 2 | PostgreSQL production sebagai **container** di server sekolah (pemilik produk). | Tidak ada layanan terkelola di server sekolah | Ya — `SDD-INF-14`; `SDD-INF-11` kini hanya staging |
| 3 | Object storage production tetap **Backblaze B2**; server **publik via domain**, Let's Encrypt HTTP-01 tetap (pemilik produk). | `INF-02`, `INF-06` tidak berubah | Tidak — tercatat di `SDD-INF-14` |
| 4 | Smoke produksi **penuh** dengan fixture `[SMOKE]`, pola staging `CD-07` (pemilik produk). | Pemeriksaan kesehatan saja tidak memenuhi `CD-07` | Ya — SDD-16 §5 |
| 5 | Repositori **tetap publik** dengan empat mitigasi wajib untuk self-hosted runner (pemilik produk). | Repo private mematikan CodeQL/dependency-review tanpa langganan berbayar (gerbang `CD-01`/`CD-02`) | Ya — SDD-16 §6, risiko diterima |
| 6 | `ci.yml` tidak lagi dipicu push tag `v*`; tag menjalankannya lewat `workflow_call` dari `rilis-produksi.yml`. | Tanpa ini setiap tag menjalankan CI dua kali; image yang diterbitkan adalah artefak `build` run yang sama dengan yang dipindai Trivy | Tidak |
| 7 | Jam operasional WIB dihitung sebagai UTC+7 langsung, bukan `TZ=Asia/Jakarta`. | Uji `jendela-deploy.test.sh` gagal 7/11 di Git Bash: tanpa tzdata, `TZ=Asia/Jakarta` diam-diam jatuh ke UTC. Server tanpa paket tzdata akan menggeser gerbang 7 jam | Tidak |
| 8 | Aset web per tag diterbitkan sebagai **GitHub Release** (`web-dist.tar.gz`, `openapi.json`). | Artefak run berumur pendek; rollback butuh aset yang persis sama tanpa build ulang (`CD-05`) | Ya — SDD-16 §4.2 |
| 9 | **Staging di server sekolah** yang sama dengan production, dideploy lewat jalur yang dipasang IT sekolah (`AskUserQuestion`, 25 Oktober 2026). | Tidak ada VPS staging; pengembang tidak memegang akses server | Ya — `SDD-INF-15`; `SDD-INF-11` tidak berlaku lagi |
| 10 | **Proxy tepi bersama** memegang 80/443 dan TLS untuk kedua domain; tiap stack tanpa port host (`AskUserQuestion`, 25 Oktober 2026). Ditolak: staging di port lain (port tambahan + DNS-01), staging hanya sebelum go-live (rilis berikutnya tanpa staging). | Dua stack Compose tidak dapat sama-sama mengikat 80/443 | Ya — `SDD-INF-15`, SDD-16 §3 |
| 11 | Satu berkas Compose untuk kedua stack (`SIGM4_PROJECT`, `SIGM4_APP_ENV`, path env), bukan salinan staging; berkas VPS `deploy/staging/{docker-compose.yml,deploy.sh,nginx/}` dihapus, smoke test tetap di `deploy/staging/`. Satu runner berlabel `sigm4-produksi,sigm4-staging` disarankan, sehingga deploy kedua lingkungan tidak pernah bersamaan. | Topologi staging = production adalah tujuan staging (`SDD-16 §4.8`); dua salinan pasti menyimpang | Ya — SDD-16 §4.2, SDD-17 §4.1 |
| 12 | **Deploy lewat Dokploy**: dua Compose app (`sigm4-staging` cabang `staging`, `sigm4-production` cabang `main`) dari `deploy/production/docker-compose.yml`; GitHub Actions memindahkan tag lingkungan GHCR lalu memicu API Dokploy setelah gerbang lulus; *autodeploy* Dokploy mati; web dikemas image `sigm4-web` (`AskUserQuestion`, 28 Oktober 2026). Ditolak: tetap runner + proxy tepi (bentrok dengan Dokploy di port 80/443). | Pengembang kini memegang dashboard Dokploy, bukan SSH; dashboard dapat dijangkau dari internet | Ya — `SDD-INF-16` |
| 13 | **Downtime beberapa detik per deploy diterima**: api-1 dan api-2 diganti bersamaan oleh `compose up`; urutan dump → migration → api/worker dijamin `depends_on`, bukan skrip (`AskUserQuestion`, 28 Oktober 2026). Ditolak: penggantian bergulir lewat app terpisah. | Deploy produksi hanya di luar jam operasional (`CD-06`); koreografi `deploy.sh` tidak dapat berjalan tanpa akses server | Ya — `SDD-INF-16` (d) |
| 14 | **nginx sekolah di depan**: SSL dan domain di nginx sekolah, diteruskan HTTP polos ke port host (bukan 3000); Traefik/domain Dokploy tidak dipakai (IT sekolah lewat pemilik produk, 28 Oktober 2026). | Port 3000 sudah terpakai di server | Ya — `SDD-INF-16` (b) |
| 15 | **Tanpa nginx milik SIGM4**: routing `/api` dan `/` dipegang nginx sekolah; stack membuka port host `api` (produksi 3010) dan `web` statis (produksi 3011); API **satu instance** (`AskUserQuestion`, 28 Oktober 2026). Ditolak: API ×2 dengan upstream di nginx sekolah (port tambahan), API menyajikan web (mengubah kode dan `SDD-16 §4.2`). Rancangan sementara satu port + `SIGM4_PROXY_CIDR` dibatalkan. | IT sekolah tidak mengizinkan routing di dalam compose; tanpa reverse proxy SIGM4 tidak ada yang membagi beban ke dua instance | Ya — `SDD-INF-16` (b)(d) |
| 16 | **Staging nonaktif dulu**: cabang `staging` tetap gerbang CI, deploy staging dilewati kecuali variabel repositori `STAGING_AKTIF=true` (`AskUserQuestion`, 28 Oktober 2026). Ditolak: menghapus staging sepenuhnya. | Staging butuh subdomain + sepasang port tambahan dari IT sekolah | Ya — `SDD-INF-16` (e) |
| 17 | **Pra-rilis `v0.x.y` ke produksi sebelum go-live** lewat jalur rilis biasa (persetujuan, `CD-06`, smoke); data dianggap uji dan dibuang sebelum `v1.0.0` (`AskUserQuestion`, 28 Oktober 2026). Ditolak: menunda deploy produksi sampai gerbang rilis. `DL-01` tetap: sekolah menerima sistem sekali, saat `v1.0.0`. | Tanpa staging, tidak ada lingkungan untuk mencoba deploy sama sekali | Ya — `SDD-INF-16` (e); BRANCHING-STRATEGY §3, RELEASE-PLAN §1 |

## 3. Penyimpangan dari rencana

| Yang direncanakan | Yang dikerjakan | Sebab | Dampak pada phase berikutnya |
|---|---|---|---|
| Staging menerima setiap phase; `main` hanya setelah `GL-01`–`GL-12`; tidak ada tag sebelum `v1.0.0` | Staging nonaktif; pra-rilis `v0.x.y` ke server produksi sebelum go-live | Keputusan 16–17 — subdomain staging belum ada | Sebelum rilis pasca-go-live pertama, staging diaktifkan atau risikonya diterima tertulis (`SDD-16 §6`) |
| Hotfix (`BRANCHING-STRATEGY` §6) hanya pasca go-live | Perbaikan dbmate untuk pra-rilis `v0.1.1` lewat `hotfix/dbmate-runtime` → `main` (#221); isi sama dibawa ke `develop` lewat #220 | Promosi `develop` → `staging` → `main` ±2 jam untuk satu baris perbaikan; pemilik produk meminta lebih cepat (28 Oktober 2026) | `main` sementara mendahului `staging`; promosi berikutnya membawa perubahan identik tanpa konflik |

## 4. PR di luar rencana

PR yang tidak ada pada daftar [`phase-08.md` §7](../phases/phase-08.md).

| ID | Judul | Mengapa tidak terencana |
|---|---|---|
| `PR-08-17` | Pipeline rilis production ke server sekolah | SDD-16 §4.3 sudah menggambar pipeline "tag rilis", tetapi tidak satu PR pun pada rencana memilikinya — `PR-00-18` hanya staging. Kekosongan itu baru terlihat ketika lokasi production berubah. Kompleksitas `L` (±600 baris kode/konfigurasi): compose, `deploy.sh`, dan workflow saling merujuk dan tidak dapat diuji terpisah — workflow tanpa skrip tidak berjalan, skrip tanpa topologi tidak dapat divalidasi |
| `PR-08-18` | Staging di server sekolah — proxy tepi bersama | `PR-00-18` merencanakan staging di VPS lewat SSH; ketika production pindah ke server sekolah (`PR-08-17`) staging dibiarkan di jalur lama yang tidak pernah diadakan (tidak ada VPS, environment, maupun secret). Kekosongan baru terlihat saat kesiapan deploy ditanyakan sesudah #182. Kompleksitas `L`: proxy tepi, parameterisasi stack, dua workflow, dan runbook harus berubah bersama agar production tidak kehilangan TLS. |
| `PR-08-19` | Deploy staging & production lewat Dokploy | IT sekolah memasang Dokploy setelah `PR-08-17`/`PR-08-18` tergabung, dengan nginx sekolah di depannya; runner di server dan proxy tepi milik kita tidak lagi dapat dipasang. Tidak ada PR rencana yang memiliki perubahan jalur deploy |
| `PR-08-20` | Staging nonaktif + pra-rilis `v0.x` ke produksi | Lanjutan keputusan pemilik produk setelah `PR-08-19`: subdomain staging belum disediakan, produksi diminta berjalan lebih dulu |

Kolom ketiga adalah yang paling berharga di seluruh log ini. Pola yang berulang di sana menunjukkan di mana perencanaan phase berikutnya perlu diperbaiki.

## 5. Butir yang wajib tercatat pada phase ini

- [ ] Bukti penutupan `GL-03`, `GL-04`, `GL-06`, `GL-07`, `GL-08`, `GL-10`, `GL-11`, `GL-12`
- [ ] Bukti backup terverifikasi (`PR-08-07`) **mendahului** contract (`PR-08-11`) dan migrasi produksi (`PR-08-10`)
- [ ] Contract `users.unit_kerja`: bukti nol pembaca tersisa sebelum kolom dihapus
- [ ] Hasil DR drill dan verifikasi runbook
- [ ] Nilai final seluruh TBD kelompok B hasil kalibrasi staging

## 6. TBD yang tertutup

| TBD | Keputusan | Diputuskan oleh | Tanggal |
|---|---|---|---|
| — | — | — | — |

Setiap TBD yang tertutup wajib juga diperbarui di [`../../SDD/TBD-REGISTER.md`](../../SDD/TBD-REGISTER.md). Menutupnya hanya di sini membuat register menjadi salah.

## 7. Masalah yang ditemukan

| Masalah | Dampak | Penyelesaian | Terbuka? |
|---|---|---|:---:|
| `smoke-test.sh` di `develop` belum memiliki `--full` (`PR-03-36` belum tergabung) | Smoke produksi tidak dapat membuktikan lima alur `CD-07` | Opsi tak dikenal kini ditolak (kode 2), tidak lagi diabaikan diam-diam, sehingga job smoke produksi **gagal** sampai `PR-03-36` tergabung | Ya — `PR-03-36` |
| `actionlint` tidak dapat dijalankan (daemon Docker lokal mati) | Ekspresi dan izin `workflow_call` belum divalidasi alat | YAML diurai, `docker compose config` lolos; validasi nyata pada run CI pertama | Ya |
| `deploy.sh` produksi menduplikasi `tunggu_sehat` dari staging | Dua salinan koreografi | Tidak disatukan di PR ini (aturan tanpa refactor sambil lalu); kandidat PR tersendiri | Tidak — `deploy.sh` dihapus `PR-08-19` |
| Image web dibangun dari `apps/web/dist`, padahal `outDir` Vite adalah `dist/app` (ditemukan 28 Oktober 2026 setelah #202 tergabung, saat pemilik produk menanyakan alamat API web). Cacat yang sama sudah ada sejak `PR-08-17`/`PR-08-18` (`web-dist.tar.gz` dari `apps/web/dist`), tidak pernah terlihat karena belum ada deploy nyata | Web produksi/staging menyajikan 404 — `index.html` berada di `/app/` | Konteks build diganti `apps/web/dist/app`; `web.Dockerfile` gagal bila `index.html` tidak di akar; `docker-compose.test.sh` menguji konteks salah ditolak dan memeriksa workflow serta `outDir` Vite. Uji lama memakai folder tiruan sehingga tidak menangkapnya | Tidak |
| Push `staging` pertama (#204, 28 Oktober 2026) merah di job *Terbitkan image*: Trivy menemukan 48 HIGH pada paket Alpine image dasar `nginx:1.29-alpine` (brotli, curl, openssl, libexpat, libxml2, pcre2, tiff, …), seluruhnya sudah ada versi perbaikannya. Pindaian image web hanya berjalan pada push `staging`/tag, tidak pada PR | Image web tidak terbit; deploy tertahan | `web.Dockerfile` menjalankan `apk upgrade --no-cache` seperti image API. Terverifikasi pada push `staging` berikutnya | Tidak |
| CI #220 merah sekali (29 Oktober 2026): `m11-damage-notes.test.ts` (`PR-03-31`) membuat tiga reservasi bernomor acak `9000–9998` dalam satu uji; dua nomor bertabrakan → `reservations_nomor_uq`. Uji *flaky*, bukan cacat produksi | Pipeline merah tanpa sebab pada PR yang tidak menyentuh modul itu | Nomor dari basis acak 9 digit + penghitung per berkas — unik di berkas, jauh dari nomor berkas lain; job #220 dijalankan ulang | Tidak |

## 8. Hasil pengukuran

Angka nyata, bukan perkiraan. Kosongkan bila belum diukur — jangan diisi tebakan.

| Yang diukur | Target | Hasil | Rujukan |
|---|---|---|---|
| — | — | — | — |

## 9. Gerbang keluar

Diisi saat phase dinyatakan selesai. Daftar lengkapnya ada di [`phase-08.md` §9 dan §12](../phases/phase-08.md).

- [ ] Seluruh 16 PR tergabung
- [ ] Acceptance checklist phase terpenuhi
- [ ] Definition of Done phase terpenuhi
- [ ] Bagian 5 log ini terisi seluruhnya
- [ ] [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) diperbarui

## 10. Yang diserahkan ke phase berikutnya

Hal yang sengaja ditinggalkan terbuka, beserta di mana ia akan ditutup.

| Yang ditinggalkan | Ditutup di | Alasan penundaan |
|---|---|---|
| Base backup + arsip WAL PostgreSQL container, salinan keluar server, uji restore | `PR-08-07` | `SDD-INF-14` memindahkan `SDD-INF-06` kembali ke kita; dump pra-deploy bukan PITR |
| Pemasangan runner, berkas env, sertifikat pertama, setelan GitHub | Operator / IT sekolah — [runbook](../runbooks/produksi-server-sekolah.md) | Pengembang tidak memiliki akses ke server sekolah |

---

*Log ini mencatat pelaksanaan. Requirement tetap milik [PRD](../../PRD/), keputusan desain tetap milik [SDD](../../SDD/).*
