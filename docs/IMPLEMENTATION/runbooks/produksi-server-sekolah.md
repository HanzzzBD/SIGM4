# Deploy staging & production di server sekolah

Pelaksanaan `SDD-INF-14` (`PR-08-17`) dan `SDD-INF-15` (`PR-08-18`). Pengembang **tidak** memegang akses ke server sekolah. Staging dan production berjalan di server yang sama sebagai dua stack Compose terpisah (`sigm4-staging`, `sigm4-production`) di belakang satu **proxy tepi** yang memegang port 80/443. Rilis sampai ke server lewat self-hosted runner GitHub Actions yang dipasang IT sekolah. Runner hanya membuka koneksi keluar ke GitHub, tanpa port masuk untuk deploy.

| Pihak | Memegang | Bagian |
|---|---|---|
| IT sekolah | Server, runner, berkas env (rahasia), DNS, sertifikat pertama, cadangan | §2–§5 |
| Pemilik repo | Environment GitHub, cabang `staging`, ruleset tag, persetujuan rilis | §6 |
| Administrator SIGM4 | Fixture smoke `[SMOKE]` di masing-masing lingkungan | §7 |

Urutan rilis yang mengikat ada di [`RELEASE-PLAN.md §3`](../RELEASE-PLAN.md). Berkas ini hanya menjelaskan cara menyiapkan dan menjalankannya.

## 1. Alur

```
STAGING
pengembang  : merge ke cabang `staging` → push
GitHub      : CI penuh → image GHCR :<sha> + paket web
runner      : migration → api-1 → api-2 → worker → web → nginx stack → proxy tepi   (proyek sigm4-staging)
GitHub      : smoke test CD-07 dari luar terhadap https://<domain-staging>

PRODUCTION
pemilik repo: git tag v1.0.0 (di main) → push
GitHub      : validasi → CI penuh → image GHCR :v1.0.0 + GitHub Release (web-dist, openapi.json)
reviewer    : menyetujui environment `production`
runner      : jendela CD-06 → dump DB → migration → api-1 → api-2 → worker → web → nginx stack → proxy tepi
GitHub      : smoke test CD-07 dari luar terhadap https://<domain-production>
```

```
internet ─ 80/443 ─ proxy tepi (/opt/sigm4/edge: nginx TLS + certbot)
                     ├─ <domain-staging>    → sigm4-staging-web    (stack /opt/sigm4/staging)
                     └─ <domain-production> → sigm4-production-web (stack /opt/sigm4/production)
                        jaringan Docker sigm4-edge; stack tidak memegang port host
```

Rollback production (`CD-05`): Actions → **Rilis produksi** → *Run workflow*, lalu isi `tag` dengan rilis sebelumnya. Rollback tidak membangun ulang apa pun. Target ≤ 15 menit. Staging di-rollback dengan push commit sebelumnya ke cabang `staging`.

## 2. Prasyarat server (IT sekolah)

- Linux x86-64 (Ubuntu 24.04 LTS atau setara), bash, GNU coreutils, dan tar.
- Docker Engine beserta plugin `docker compose` v2.
- Port **80 dan 443** terbuka dari internet. Dua record DNS `A` menunjuk IP publik server: domain production (mis. `sigm4.sekolah.sch.id`) dan domain staging (mis. `staging.sigm4.sekolah.sch.id`).
- Akses keluar HTTPS ke `github.com`, `*.actions.githubusercontent.com`, `ghcr.io`, `pkg-containers.githubusercontent.com`, endpoint Backblaze B2, Firebase (FCM), dan Let's Encrypt.
- Kapasitas untuk **dua** stack lengkap (masing-masing PostgreSQL, Redis, ClamAV, api ×2, worker). Staging berbagi CPU, memori, dan disk dengan production (`SDD-INF-15`): IT sekolah boleh menghentikan stack staging (`cd /opt/sigm4/staging && docker compose stop`) bila production membutuhkan sumber dayanya, dan uji beban di staging hanya di luar jam operasional.
- Disk terpisah atau cukup besar untuk data PostgreSQL. Bila data PostgreSQL production ditaruh di disk khusus, isi `SIGM4_PG_DATA` dengan path disk itu di lingkungan runner.

## 3. Memasang runner (IT sekolah)

```bash
sudo useradd -m -s /bin/bash sigm4-runner
sudo usermod -aG docker sigm4-runner          # akses Docker ≈ root: akun ini khusus runner, tanpa sudo
sudo install -d -o sigm4-runner -m 750 /opt/sigm4/production /opt/sigm4/staging /opt/sigm4/edge \
    /var/backups/sigm4 /var/backups/sigm4-staging
sudo install -d -o sigm4-runner -m 700 /etc/sigm4
```

1. Pemilik repo membuka **Settings → Actions → Runners → New self-hosted runner** (Linux x64), lalu mengirim **token pendaftaran** ke IT sekolah lewat kanal privat. Token berlaku 1 jam.
2. Sebagai `sigm4-runner`, unduh runner sesuai petunjuk halaman itu, lalu daftarkan dengan **dua** label khusus:

   ```bash
   ./config.sh --url https://github.com/HanzzzBD/SIGM4 --token <TOKEN> \
       --name sigm4-sekolah-01 --labels sigm4-produksi,sigm4-staging --unattended
   sudo ./svc.sh install sigm4-runner && sudo ./svc.sh start
   ```

3. Runner tampil **Idle** di halaman Runners. Job deploy production menarget `[self-hosted, linux, sigm4-produksi]`, job deploy staging `[self-hosted, linux, sigm4-staging]`. Satu runner menjalankan satu job sekaligus, sehingga deploy staging dan production tidak pernah berjalan bersamaan.

## 4. Rahasia, domain & sertifikat (IT sekolah)

Rahasia **tidak pernah** masuk repositori maupun GitHub (`SEC-CFG-01`). Isinya disimpan di server dengan mode `600` dan pemilik `sigm4-runner`. Daftar variabel lengkap ada di [`SDD-16 §4.7`](../../SDD/16-infrastructure-deployment.md). Staging dan production memakai **nilai rahasia yang berbeda** (kata sandi DB, `JWT_*`, `TOTP_ENCRYPTION_KEY`) dan bucket object storage yang berbeda.

`/etc/sigm4/production.env` dibaca api dan worker production:

```
DATABASE_URL=postgres://sigm4_app:<APP_DB_PASSWORD>@postgres:5432/sigm4?sslmode=disable
S3_ENDPOINT=…  S3_PUBLIC_ENDPOINT=…  S3_REGION=…  S3_BUCKET=…  S3_ACCESS_KEY=…  S3_SECRET_KEY=…   # Backblaze B2 (INF-02)
JWT_PRIVATE_KEY=…  JWT_PUBLIC_KEY=…  TOTP_ENCRYPTION_KEY=…
APP_BASE_URL=https://sigm4.sekolah.sch.id
FCM_CREDENTIALS=…  GEMINI_API_KEY=…  CHAT_ENABLED=false  LOG_LEVEL=info
```

`/etc/sigm4/production-migration.env` hanya dibaca postgres dan job migration. API dan worker tidak pernah menerima berkas ini (`SEC-CFG-03`):

```
POSTGRES_USER=sigm4_owner
POSTGRES_PASSWORD=<acak, ≥ 32 karakter>
POSTGRES_DB=sigm4
MIGRATION_DATABASE_URL=postgres://sigm4_owner:<POSTGRES_PASSWORD>@postgres:5432/sigm4?sslmode=disable
APP_DB_PASSWORD=<acak, ≥ 32 karakter — sama dengan yang di DATABASE_URL>
```

`/etc/sigm4/staging.env` dan `/etc/sigm4/staging-migration.env` berisi kunci yang sama dengan nilai staging; `APP_BASE_URL` memakai domain staging. Nama host `postgres` tetap benar karena tiap stack punya jaringan sendiri.

Jangan isi `APP_ENV` maupun `APP_REVISION`. Compose memasang `APP_ENV` (`production`, atau `staging` dari job staging), dan revisi berasal dari image ([runbook OpenAPI](openapi.md)). Cadangkan `TOTP_ENCRYPTION_KEY` production terpisah dari basis data; kehilangan kunci itu berarti seluruh 2FA harus didaftarkan ulang.

`/etc/sigm4/edge.env` (tanpa rahasia) memberi tahu proxy tepi domain tiap stack. Stack yang domainnya kosong tidak dipublikasikan:

```
SIGM4_STAGING_DOMAIN=staging.sigm4.sekolah.sch.id
SIGM4_PRODUCTION_DOMAIN=sigm4.sekolah.sch.id
```

**Sertifikat pertama per domain.** Proxy tepi tidak menyajikan aplikasi tanpa TLS: selama sertifikat sebuah domain belum ada, situs itu hanya melayani tantangan HTTP-01 dan menjawab `503`. Deploy pertama ke staging (atau production) sudah memasang berkas proxy tepi di `/opt/sigm4/edge` dan menyalakannya, sehingga smoke test pertama **gagal karena TLS** — itu diharapkan. Setelah itu, terbitkan sertifikat lewat certbot proxy tepi, lalu render ulang:

```bash
cd /opt/sigm4/edge
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
    -d staging.sigm4.sekolah.sch.id --agree-tos -m <email-it-sekolah> --non-interactive
./edge.sh                                  # situs staging kini HTTPS
```

Ulangi untuk domain production sebelum rilis pertama. Setelah itu container `certbot` proxy tepi memperpanjang keduanya otomatis (`SDD-INF-13`). Untuk mengulang smoke staging, jalankan ulang job **Smoke test staging** pada run terakhir.

## 5. Cadangan

Setiap deploy production membuat dump `pg_dump -Fc` di `/var/backups/sigm4`, dan staging di `/var/backups/sigm4-staging`; masing-masing mempertahankan 5 dump terakhir. Dump ini **bukan** cadangan production. Base backup + arsip WAL (`SDD-INF-06`), penyalinan keluar server (`BR-DR-03`), dan uji restore (`SDD-INF-07`) dibangun di `PR-08-07` dan wajib ada sebelum go-live. Staging tidak membutuhkan PITR: datanya salinan teranonimisasi yang dapat disegarkan ulang (`DP-08`).

## 6. Setelan GitHub (pemilik repo)

Repositori ini **publik**, sehingga mitigasi berikut wajib aktif sebelum runner dipasang ([`SDD-16 §6`](../../SDD/16-infrastructure-deployment.md)):

| Setelan | Tempat | Nilai |
|---|---|---|
| Persetujuan workflow fork | Settings → Actions → General → *Fork pull request workflows from outside collaborators* | **Require approval for all external contributors** |
| Ruleset tag | Settings → Rules → Rulesets → New tag ruleset | Target `v*`; *Restrict creations/updates/deletions*; bypass hanya pemilik repo |
| Cabang `staging` | dibuat dari `develop`; Settings → Branches | Proteksi: hanya pemilik repo/maintainer yang boleh push; *required status check* `CI lulus` |
| Environment `staging` | Settings → Environments | *Deployment branches* → cabang `staging` saja; variabel `STAGING_DOMAIN` (dan `STAGING_DIR`, `EDGE_DIR` bila bukan bawaan); secret `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `SMOKE_TOTP_SECRET`; variabel `SMOKE_ROOM_ID`, `SMOKE_ASSET_UUID`, `SMOKE_START_HOUR_WIB` (opsional) |
| Environment `production` | Settings → Environments | *Required reviewers* (minimal 1 orang); *Deployment branches and tags* → cabang `main` (rollback lewat *Run workflow*) dan tag `v*`; variabel `PRODUCTION_DOMAIN` (dan `PRODUCTION_DIR`, `EDGE_DIR` bila bukan bawaan) |
| Environment `production-smoke` | Settings → Environments | Tanpa reviewer; cabang `main` dan tag `v*`; secret `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `SMOKE_TOTP_SECRET`; variabel `SMOKE_ROOM_ID`, `SMOKE_ASSET_UUID`, `PRODUCTION_DOMAIN` |

Menyetujui run dari fork tanpa membaca diff `.github/workflows/` dilarang. Workflow fork yang menyebut `self-hosted`, `sigm4-produksi`, atau `sigm4-staging` ditolak.

## 7. Fixture smoke (Administrator SIGM4)

Kebijakannya sama di kedua lingkungan (`CD-07`, keputusan pemilik produk 24 Oktober 2026): satu akun Petugas, satu ruangan, dan satu aset bernama `[SMOKE]`. Reservasi uji dibatalkan; tiket uji dan auditnya tetap tersimpan dan ditandai sebagai data uji. Kredensial dan ID-nya disimpan pada environment `staging` dan `production-smoke` (§6). Fixture dibuat setelah deploy pertama lingkungan itu (aplikasinya harus sudah berjalan); sampai fixture ada, smoke `--full` lingkungan itu sengaja **gagal**, karena pemeriksaan kesehatan saja tidak memenuhi `CD-07`.

## 8. Jalur darurat tanpa GitHub

Bila runner atau GitHub tidak tersedia, IT sekolah dapat menjalankan koreografi yang sama langsung di server:

```bash
cd /opt/sigm4/production
echo <PAT read:packages> | docker login ghcr.io -u <pengguna> --password-stdin
./deploy.sh ghcr.io/hanzzzbd/sigm4:v1.0.0 ./web-dist
/opt/sigm4/edge/edge.sh
```

`web-dist` diambil dari aset `web-dist.tar.gz` pada GitHub Release tag yang sama. Untuk staging, jalankan dari `/opt/sigm4/staging` dengan variabel seperti di kepala `deploy.sh` (`SIGM4_PROJECT=sigm4-staging`, `SIGM4_APP_ENV=staging`, berkas env staging). Setiap deploy manual dicatat di log phase aktif beserta alasannya (`DP-11`).
