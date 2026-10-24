# Deploy production di server sekolah

Pelaksanaan `SDD-INF-14` (`PR-08-17`). Pengembang **tidak** memegang akses ke server sekolah. Rilis sampai ke server lewat self-hosted runner GitHub Actions yang dipasang IT sekolah. Runner hanya membuka koneksi keluar ke GitHub, tanpa port masuk untuk deploy.

| Pihak | Memegang | Bagian |
|---|---|---|
| IT sekolah | Server, runner, berkas env (rahasia), sertifikat pertama, cadangan | §2–§5 |
| Pemilik repo | Environment GitHub, ruleset tag, persetujuan rilis | §6 |
| Administrator SIGM4 | Fixture smoke `[SMOKE]` | §7 |

Urutan rilis yang mengikat ada di [`RELEASE-PLAN.md §3`](../RELEASE-PLAN.md). Berkas ini hanya menjelaskan cara menyiapkan dan menjalankannya.

## 1. Alur

```
pemilik repo: git tag v1.0.0 (di main) → push
GitHub      : validasi → CI penuh → image GHCR :v1.0.0 + GitHub Release (web-dist, openapi.json)
reviewer    : menyetujui environment `production`
runner      : jendela CD-06 → dump DB → migration → api-1 → api-2 → worker → web → nginx
GitHub      : smoke test CD-07 dari luar terhadap https://<domain>
```

Rollback (`CD-05`): Actions → **Rilis produksi** → *Run workflow*, lalu isi `tag` dengan rilis sebelumnya. Rollback tidak membangun ulang apa pun. Target ≤ 15 menit.

## 2. Prasyarat server (IT sekolah)

- Linux x86-64 (Ubuntu 24.04 LTS atau setara), bash, GNU coreutils, dan tar.
- Docker Engine beserta plugin `docker compose` v2.
- Port **80 dan 443** terbuka dari internet, dan record DNS `A` domain production (mis. `sigm4.sekolah.sch.id`) menunjuk IP publik server.
- Akses keluar HTTPS ke `github.com`, `*.actions.githubusercontent.com`, `ghcr.io`, `pkg-containers.githubusercontent.com`, endpoint Backblaze B2, Firebase (FCM), dan Let's Encrypt.
- Disk terpisah atau cukup besar untuk data PostgreSQL. Bila data PostgreSQL ditaruh di disk khusus, isi `SIGM4_PG_DATA` dengan path disk itu di lingkungan runner.

## 3. Memasang runner (IT sekolah)

```bash
sudo useradd -m -s /bin/bash sigm4-runner
sudo usermod -aG docker sigm4-runner          # akses Docker ≈ root: akun ini khusus runner, tanpa sudo
sudo install -d -o sigm4-runner -m 750 /opt/sigm4/production /var/backups/sigm4
sudo install -d -o sigm4-runner -m 700 /etc/sigm4
```

1. Pemilik repo membuka **Settings → Actions → Runners → New self-hosted runner** (Linux x64), lalu mengirim **token pendaftaran** ke IT sekolah lewat kanal privat. Token berlaku 1 jam.
2. Sebagai `sigm4-runner`, unduh runner sesuai petunjuk halaman itu, lalu daftarkan dengan label khusus:

   ```bash
   ./config.sh --url https://github.com/HanzzzBD/SIGM4 --token <TOKEN> \
       --name sigm4-produksi-01 --labels sigm4-produksi --unattended
   sudo ./svc.sh install sigm4-runner && sudo ./svc.sh start
   ```

3. Runner tampil **Idle** di halaman Runners. Job deploy hanya menarget `[self-hosted, linux, sigm4-produksi]`.

## 4. Rahasia & sertifikat (IT sekolah)

Rahasia **tidak pernah** masuk repositori maupun GitHub (`SEC-CFG-01`). Isinya disimpan di server dengan mode `600` dan pemilik `sigm4-runner`. Daftar variabel lengkap ada di [`SDD-16 §4.7`](../../SDD/16-infrastructure-deployment.md).

`/etc/sigm4/production.env` dibaca api dan worker:

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

Jangan isi `APP_ENV` maupun `APP_REVISION`. Compose memasang `APP_ENV=production`, dan revisi berasal dari image ([runbook OpenAPI](openapi.md)). Cadangkan `TOTP_ENCRYPTION_KEY` terpisah dari basis data; kehilangan kunci itu berarti seluruh 2FA harus didaftarkan ulang.

**Sertifikat pertama.** Nginx tidak dapat menyala tanpa sertifikat. Karena itu sertifikat pertama diterbitkan sekali, sebelum rilis pertama:

```bash
docker run --rm -p 80:80 -v sigm4-production_letsencrypt:/etc/letsencrypt certbot/certbot:v4.2.0 \
    certonly --standalone -d sigm4.sekolah.sch.id --agree-tos -m <email-it-sekolah> --non-interactive
```

Setelah itu container `certbot` pada Compose memperpanjangnya otomatis (`SDD-INF-13`).

## 5. Cadangan

Setiap deploy membuat dump `pg_dump -Fc` di `/var/backups/sigm4`, dan 5 dump terakhir dipertahankan. Dump ini **bukan** cadangan production. Base backup + arsip WAL (`SDD-INF-06`), penyalinan keluar server (`BR-DR-03`), dan uji restore (`SDD-INF-07`) dibangun di `PR-08-07` dan wajib ada sebelum go-live.

## 6. Setelan GitHub (pemilik repo)

Repositori ini **publik**, sehingga keempat mitigasi berikut wajib aktif sebelum runner dipasang ([`SDD-16 §6`](../../SDD/16-infrastructure-deployment.md)):

| Setelan | Tempat | Nilai |
|---|---|---|
| Persetujuan workflow fork | Settings → Actions → General → *Fork pull request workflows from outside collaborators* | **Require approval for all external contributors** |
| Ruleset tag | Settings → Rules → Rulesets → New tag ruleset | Target `v*`; *Restrict creations/updates/deletions*; bypass hanya pemilik repo |
| Environment `production` | Settings → Environments | *Required reviewers* (minimal 1 orang); *Deployment branches and tags* → cabang `main` (rollback lewat *Run workflow*) dan tag `v*`; variabel `PRODUCTION_DOMAIN` (dan `PRODUCTION_DIR` bila bukan `/opt/sigm4/production`) |
| Environment `production-smoke` | Settings → Environments | Tanpa reviewer; cabang `main` dan tag `v*`; secret `SMOKE_EMAIL`, `SMOKE_PASSWORD`, `SMOKE_TOTP_SECRET`; variabel `SMOKE_ROOM_ID`, `SMOKE_ASSET_UUID`, `PRODUCTION_DOMAIN` |

Menyetujui run dari fork tanpa membaca diff `.github/workflows/` dilarang. Workflow fork yang menyebut `self-hosted` atau `sigm4-produksi` ditolak.

## 7. Fixture smoke (Administrator SIGM4)

Kebijakannya sama dengan staging (`CD-07`, keputusan pemilik produk 24 Oktober 2026): satu akun Petugas, satu ruangan, dan satu aset bernama `[SMOKE]`. Reservasi uji dibatalkan; tiket uji dan auditnya tetap tersimpan dan ditandai sebagai data uji. Kredensial dan ID-nya disimpan pada environment `production-smoke` (§6). Lima alur penuh (`--full`) tersedia setelah `PR-03-36` tergabung. Sebelum itu, job smoke produksi sengaja **gagal**, karena pemeriksaan kesehatan saja tidak memenuhi `CD-07`.

## 8. Jalur darurat tanpa GitHub

Bila runner atau GitHub tidak tersedia, IT sekolah dapat menjalankan koreografi yang sama langsung di server:

```bash
cd /opt/sigm4/production
echo <PAT read:packages> | docker login ghcr.io -u <pengguna> --password-stdin
SIGM4_DOMAIN=sigm4.sekolah.sch.id ./deploy.sh ghcr.io/hanzzzbd/sigm4:v1.0.0 ./web-dist
```

`web-dist` diambil dari aset `web-dist.tar.gz` pada GitHub Release tag yang sama. Setiap deploy manual dicatat di log phase aktif beserta alasannya (`DP-11`).
