# Deploy staging & production di server sekolah

Pelaksanaan `SDD-INF-14` (`PR-08-17`), `SDD-INF-15` (`PR-08-18`), dan `SDD-INF-16` (`PR-08-19`). IT sekolah memasang **Dokploy** khusus SIGM4 dan memberi pengembang akses **dashboard** (tanpa SSH). Staging dan production adalah dua **Compose app** Dokploy (`sigm4-staging`, `sigm4-production`) dari berkas yang sama, `deploy/production/docker-compose.yml`. **nginx milik sekolah** memegang port 80/443, sertifikat, dan seluruh routing: `/api` ke port host service `api`, `/` ke port host service `web`. SIGM4 tidak punya reverse proxy sendiri. GitHub Actions memicu deploy lewat **API Dokploy** setelah seluruh gerbang lulus; tidak ada runner di server.

| Pihak | Memegang | Bagian |
|---|---|---|
| IT sekolah | Server, instalasi Dokploy, nginx sekolah (domain, SSL, forward ke port), DNS, disk | §2 |
| Pemilik repo | Compose app & env di Dokploy, kunci API, environment GitHub, cabang `staging`, ruleset tag, persetujuan rilis | §3–§5 |
| Administrator SIGM4 | Fixture smoke `[SMOKE]` di masing-masing lingkungan | §7 |

Urutan rilis yang mengikat ada di [`RELEASE-PLAN.md §3`](../RELEASE-PLAN.md). Berkas ini hanya menjelaskan cara menyiapkan dan menjalankannya.

## 1. Alur

**Staging nonaktif sampai subdomainnya tersedia** (`SDD-INF-16` e). Job *Deploy staging* dilewati kecuali variabel **repositori** `STAGING_AKTIF` = `true` (Settings → Secrets and variables → Actions → *Variables*). Sebelum go-live, rilis dicoba lewat **pra-rilis** ke produksi:

```
merge develop → staging (CI hijau) → PR staging → main → git tag v0.1.0 && git push origin v0.1.0
→ setujui environment production → deploy di luar jam operasional (CD-06) → smoke
```

Data produksi sebelum `v1.0.0` adalah data uji dan dibuang sebelum go-live. Alur di bawah berlaku penuh begitu staging aktif.

```
STAGING
pengembang  : merge ke cabang `staging` → push
GitHub      : CI penuh → image GHCR sigm4:<sha> + sigm4-web:<sha>
GitHub      : tag `staging` dipindah ke <sha> → API Dokploy compose.deploy (app sigm4-staging)
Dokploy     : compose up → backup (dump) → migrate → api, worker; web
GitHub      : menunggu deployment `done` → smoke test CD-07 dari luar terhadap https://<domain-staging>

PRODUCTION
pemilik repo: git tag v1.0.0 (di main) → push
GitHub      : validasi → CI penuh → image GHCR sigm4:v1.0.0 + sigm4-web:v1.0.0 + GitHub Release (openapi.json)
reviewer    : menyetujui environment `production`
GitHub      : jendela CD-06 → tag `production` dipindah ke v1.0.0 → API Dokploy (app sigm4-production)
Dokploy     : compose up → backup (dump) → migrate → api, worker; web
GitHub      : smoke test CD-07 dari luar terhadap https://<domain-production>
```

```
internet ─ 80/443 ─ nginx sekolah (TLS + routing)
                     ├─ <domain-production> /api → http://<server>:3010 → app sigm4-production, service api
                     │                      /    → http://<server>:3011 →                        service web (statis)
                     └─ <domain-staging>    /api → http://<server>:<port api staging>,  / → <port web staging>
                        hanya api dan web yang membuka port host; api di 3000 hanya DI DALAM container
```

API berjalan satu instance dan diganti setiap deploy, sehingga layanan terputus beberapa detik (`SDD-INF-16` d). Karena itu deploy produksi hanya di luar jam operasional (`CD-06`).

Rollback production (`CD-05`): Actions → **Rilis produksi** → *Run workflow*, lalu isi `tag` dengan rilis sebelumnya. Rollback hanya memindahkan tag `production` dan memicu deploy ulang; tidak ada yang dibangun ulang. Target ≤ 15 menit. Staging di-rollback dengan push commit sebelumnya ke cabang `staging`.

## 2. Prasyarat server (IT sekolah)

- Dokploy terpasang dan dashboard-nya dapat dibuka dari internet lewat HTTPS. GitHub Actions memanggil API-nya dari luar.
- nginx sekolah memegang port **80 dan 443**, sertifikat, dan routing kedua domain: production (mis. `sigm4.sekolah.sch.id`) dan staging (mis. `staging.sigm4.sekolah.sch.id`). Tiap domain diteruskan ke dua port host app-nya (§3):

  ```nginx
  # Header yang sama untuk kedua location.
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;   # DITIMPA, bukan $proxy_add_x_forwarded_for (NFR-S-07)
  proxy_set_header X-Forwarded-Proto https;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;   # INF-06

  location /api/ {
      proxy_pass http://<ip-server-dokploy>:3010;   # TANPA "/" di akhir: awalan /api wajib tetap ada
      proxy_read_timeout 3600s;                      # aliran notifikasi & chatbot (SSE) tidak diputus tiap 60 s
  }
  location / {
      proxy_pass http://<ip-server-dokploy>:3011;
  }
  ```

- Dua port host per app: produksi **3010** (api) dan **3011** (web); staging sepasang port lain. Bukan 3000 (sudah dipakai). API memercayai satu hop `X-Forwarded-For`, jadi keempat port **hanya boleh dijangkau dari nginx sekolah**: `SIGM4_HTTP_BIND=127.0.0.1` bila nginx sekolah di server yang sama, atau firewall bila di server lain.
- Akses keluar HTTPS ke `github.com`, `ghcr.io`, `pkg-containers.githubusercontent.com`, endpoint Backblaze B2, dan Firebase (FCM).
- Kapasitas untuk **dua** stack lengkap (masing-masing PostgreSQL, Redis, ClamAV, api, worker, web). Staging berbagi CPU, memori, dan disk dengan production: staging boleh dihentikan (tombol *Stop* app `sigm4-staging`) bila production membutuhkan sumber dayanya, dan uji beban di staging hanya di luar jam operasional.
- Disk cukup untuk volume Docker PostgreSQL kedua app.

## 3. Compose app di Dokploy (pemilik repo)

Image di GHCR (`ghcr.io/hanzzzbd/sigm4`, `ghcr.io/hanzzzbd/sigm4-web`) harus dapat ditarik Dokploy tanpa login. Repositori ini publik, jadi setel kedua package itu **Public** (GitHub → profil → Packages → package → *Package settings* → *Change visibility*) setelah keduanya pertama kali terbit.

Buat satu project `SIGM4`, lalu dua service bertipe **Compose**:

| Setelan | `sigm4-staging` | `sigm4-production` |
|---|---|---|
| Provider | Git publik `https://github.com/HanzzzBD/SIGM4.git` | sama |
| Branch | `staging` | `main` |
| Compose path | `./deploy/production/docker-compose.yml` | sama |
| *Autodeploy* | **Mati.** Deploy hanya dari GitHub Actions setelah gerbang lulus | **Mati** |
| Domains | **Kosong** — domain dan SSL dipegang nginx sekolah | **Kosong** |

**Environment.** Tab *Environment* tiap app diisi nilai di bawah. Dokploy menulisnya ke `.env` di samping berkas compose, dan compose hanya meneruskan ke tiap service variabel yang memang disebut namanya. Karena itu akun DDL tidak pernah sampai ke api/worker (`SEC-CFG-03`). Nilai **tidak pernah** masuk repositori (`SEC-CFG-01`). Staging dan production memakai **nilai rahasia yang berbeda** (kata sandi DB, `JWT_*`, `TOTP_ENCRYPTION_KEY`) dan bucket object storage yang berbeda. Daftar variabel lengkap ada di [`SDD-16 §4.7`](../../SDD/16-infrastructure-deployment.md).

```
SIGM4_TAG=staging                 # production: SIGM4_TAG=production
SIGM4_APP_ENV=staging             # production: SIGM4_APP_ENV=production
SIGM4_API_PORT=<port api>         # produksi 3010; port host /api dari nginx sekolah, BUKAN 3000
SIGM4_WEB_PORT=<port web>         # produksi 3011; port host / dari nginx sekolah
# SIGM4_HTTP_BIND=127.0.0.1       # isi bila nginx sekolah di server yang sama

# api & worker
DATABASE_URL=postgres://sigm4_app:<APP_DB_PASSWORD>@postgres:5432/sigm4?sslmode=disable
S3_ENDPOINT=…  S3_PUBLIC_ENDPOINT=…  S3_REGION=…  S3_BUCKET=…  S3_ACCESS_KEY=…  S3_SECRET_KEY=…   # Backblaze B2 (INF-02)
# S3_ENDPOINT dan S3_PUBLIC_ENDPOINT: https://s3.<region>.backblazeb2.com — TANPA nama bucket
# (path-style, SDD-FS-13). S3_REGION = <region> pada alamat itu. Kunci: Application Key, bukan master key.
JWT_PRIVATE_KEY=…  JWT_PUBLIC_KEY=…    # PEM satu baris, baris baru ditulis \n
TOTP_ENCRYPTION_KEY=…
APP_BASE_URL=https://<domain lingkungan ini>
FCM_CREDENTIALS=…  GEMINI_API_KEY=…  CHAT_ENABLED=false  LOG_LEVEL=info

# hanya postgres, backup, dan migrate
POSTGRES_USER=sigm4_owner
POSTGRES_PASSWORD=<acak, ≥ 32 karakter>
POSTGRES_DB=sigm4
MIGRATION_DATABASE_URL=postgres://sigm4_owner:<POSTGRES_PASSWORD>@postgres:5432/sigm4?sslmode=disable
APP_DB_PASSWORD=<acak, ≥ 32 karakter — sama dengan yang di DATABASE_URL>
```

Satu baris per variabel; contoh di atas menggabungkan beberapa hanya agar ringkas. Jangan isi `APP_REVISION`, karena revisi berasal dari image ([runbook OpenAPI](openapi.md)). Nama host `postgres` tetap benar karena tiap app punya jaringan sendiri. Cadangkan `TOTP_ENCRYPTION_KEY` production di luar server dan di luar Dokploy; kehilangan kunci itu berarti seluruh 2FA harus didaftarkan ulang.

**Kunci API.** Dokploy → *Settings* → *Profile* → **API/CLI** → buat kunci khusus GitHub Actions. ID tiap app ada di URL halamannya (`…/compose/<composeId>`).

**Deploy pertama.** Tag `staging`/`production` baru ada setelah job GitHub pertama memindahkannya, jadi tombol *Deploy* di dashboard sebelum itu pasti gagal menarik image. Deploy pertama selalu lewat GitHub (§1).

## 4. Cadangan

Setiap deploy membuat dump `pg_dump -Fc` di volume `backup` app itu (service `backup`), dan 5 dump terakhir dipertahankan. Dump ini **bukan** cadangan production. Base backup + arsip WAL (`SDD-INF-06`), penyalinan keluar server (`BR-DR-03`), dan uji restore (`SDD-INF-07`) dibangun di `PR-08-07` dan wajib ada sebelum go-live. Staging tidak membutuhkan PITR: datanya salinan teranonimisasi yang dapat disegarkan ulang (`DP-08`).

## 5. Setelan GitHub (pemilik repo)

Repositori ini **publik**, sehingga mitigasi berikut wajib aktif sebelum kunci API Dokploy disimpan ([`SDD-16 §6`](../../SDD/16-infrastructure-deployment.md)):

| Setelan | Tempat | Nilai |
|---|---|---|
| Persetujuan workflow fork | Settings → Actions → General → *Fork pull request workflows from outside collaborators* | **Require approval for all external contributors** |
| Ruleset tag | Settings → Rules → Rulesets → New tag ruleset | Target `v*`; *Restrict creations/updates/deletions*; bypass hanya pemilik repo |
| Cabang `staging` | dibuat dari `develop`; Settings → Branches | Proteksi: hanya pemilik repo/maintainer yang boleh push; *required status check* `CI lulus` |
| Variabel repositori `STAGING_AKTIF` | Settings → Secrets and variables → Actions → Variables | `true` hanya setelah app `sigm4-staging`, subdomain, dan environment `staging` siap; selama tidak ada, deploy staging dilewati |
| Environment `staging` | Settings → Environments | *Deployment branches* → cabang `staging` saja; variabel `DOKPLOY_URL`, `DOKPLOY_COMPOSE_ID` (ID app `sigm4-staging`), `STAGING_DOMAIN`; secret `DOKPLOY_API_KEY`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `SMOKE_TOTP_SECRET`; variabel `SMOKE_ROOM_ID`, `SMOKE_ASSET_UUID`, `SMOKE_START_HOUR_WIB` (opsional) |
| Environment `production` | Settings → Environments | *Required reviewers* (minimal 1 orang); *Deployment branches and tags* → cabang `main` (rollback lewat *Run workflow*) dan tag `v*`; variabel `DOKPLOY_URL`, `DOKPLOY_COMPOSE_ID` (ID app `sigm4-production`), `PRODUCTION_DOMAIN`; secret `DOKPLOY_API_KEY` |
| Environment `production-smoke` | Settings → Environments | Tanpa reviewer; cabang `main` dan tag `v*`; secret `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `SMOKE_TOTP_SECRET`; variabel `SMOKE_ROOM_ID`, `SMOKE_ASSET_UUID`, `PRODUCTION_DOMAIN` |

`DOKPLOY_API_KEY` **tidak boleh** disimpan sebagai secret repositori: secret environment hanya terbuka bagi job yang lolos aturan cabang/tag (dan reviewer untuk production). Menyetujui run dari fork tanpa membaca diff `.github/workflows/` dilarang. Kunci dirotasi bersama kredensial lain setiap 6 bulan dan segera bila diduga bocor.

## 6. Jalur darurat & pemulihan

**Deploy gagal.** Job berhenti dengan status deployment Dokploy. Log lengkapnya ada di dashboard → app → *Deployments*. Bila migration gagal, Compose bisa saja sudah menghentikan api lama. Pulihkan dengan deploy ulang rilis sebelumnya (§1, rollback); migration `expand` tetap cocok dengan kode lama.

**GitHub Actions tidak tersedia.** Pindahkan tag lingkungan dari mesin mana pun yang punya akses tulis GHCR, lalu tekan *Deploy* pada app di dashboard Dokploy:

```bash
docker buildx imagetools create -t ghcr.io/hanzzzbd/sigm4:production ghcr.io/hanzzzbd/sigm4:v1.0.0
docker buildx imagetools create -t ghcr.io/hanzzzbd/sigm4-web:production ghcr.io/hanzzzbd/sigm4-web:v1.0.0
```

Gerbang jam operasional (`CD-06`) tetap berlaku untuk jalur ini. Setiap deploy manual dicatat di log phase aktif beserta alasannya (`DP-11`).

## 7. Fixture smoke (Administrator SIGM4)

Kebijakannya sama di kedua lingkungan (`CD-07`, keputusan pemilik produk 24 Oktober 2026): satu akun Petugas, satu ruangan, dan satu aset bernama `[SMOKE]`. Reservasi uji dibatalkan; tiket uji dan auditnya tetap tersimpan dan ditandai sebagai data uji. Kredensial dan ID-nya disimpan pada environment `staging` dan `production-smoke` (§5). Fixture dibuat setelah deploy pertama lingkungan itu (aplikasinya harus sudah berjalan); sampai fixture ada, smoke `--full` lingkungan itu sengaja **gagal**, karena pemeriksaan kesehatan saja tidak memenuhi `CD-07`.
