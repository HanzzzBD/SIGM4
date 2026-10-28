# OpenAPI development dan staging

Pemilik: Backend/DevOps. Requirement: PR-00-19, SDD-API-11/12/13, NFR-M-05.

| Lingkungan | URL dokumen JSON | Konfigurasi |
|---|---|---|
| Development API lokal | `http://localhost:3000/api/docs` | `APP_ENV=development`; contoh `.env.example` |
| Staging | `https://${STAGING_DOMAIN}/api/docs` | `APP_ENV=staging` dipasang Compose; domain adalah `vars.STAGING_DOMAIN` di environment GitHub staging |
| Production | Tidak diterbitkan: `/api/docs` → 404 | `APP_ENV=production` atau tidak diberikan |

Domain staging nyata belum tersedia dalam workspace. Operator mencatat domain dari environment deployment saat staging disiapkan; URL di atas adalah pola yang dipakai pipeline, bukan klaim staging telah terdeploy.

## Development

Siapkan konfigurasi API yang sah sesuai `.env.example`, termasuk database, Redis, kunci JWT/TOTP dan storage. Set `APP_ENV=development`; `APP_REVISION=development` adalah penanda working tree. Setelah `npm run build --workspace @sigm4/api`, jalankan `node --env-file=.env apps/api/dist/api/index.js` dari akar proyek.

`curl --fail http://localhost:3000/api/docs` harus menghasilkan `openapi: 3.1.0`, `info.version` sesuai `APP_REVISION`, serta operasi yang sama dengan registri. Dokumen tidak membutuhkan login. Respons memakai `application/json`, request ID, header keamanan, `Cache-Control: no-store` dan `X-Robots-Tag: noindex, nofollow`.

## Commit deployment dan artefak CI

Job build CI membangun workspace, menjalankan `node scripts/generate-openapi.mjs <commit/tag> openapi.json`, dan mengunggah artefak `openapi-${GITHUB_SHA}` (retensi 90 hari). Push tag `v*` menjalankan pipeline yang sama; `info.version` artefaknya memakai nama tag. Pada branch/PR, versinya SHA commit. JSON diterbitkan dari dist hasil build checkout yang sama, tanpa membaca database/Redis.

Image API dibangun dengan `--build-arg APP_REVISION=${GITHUB_SHA}`. **Jangan menimpa APP_REVISION dalam berkas staging.env**: runtime harus mempertahankan SHA dari image, sama dengan tag image GHCR yang dideploy. Saat rilis tag, cocokkan versi tag artefak dengan SHA yang ditunjuk tag tersebut; runtime tetap melaporkan SHA image.

Setelah deploy staging, ambil `/api/docs` dan cocokkan `info.version` dengan SHA pada `SIGM4_IMAGE`. Kedua instance API harus sudah menggunakan image yang sama sebelum memeriksa hasil akhir. `deploy/staging/smoke-test.sh` memeriksa respons 200, bentuk OpenAPI dan SHA dari `SMOKE_EXPECTED_REVISION`; CI memasangnya dari `github.sha`. Operator menjalankan pemeriksaan yang sama dengan `SMOKE_EXPECTED_REVISION=<sha> bash deploy/staging/smoke-test.sh https://<domain-staging>`.

Untuk menghasilkan artefak lokal: `node scripts/generate-openapi.mjs <versi/commit> build/openapi.json`, setelah build API. File ini hasil pembangkitan, bukan salinan kontrak yang disunting.

## Produksi dan rollback

Konfigurasi produksi menggunakan `APP_ENV=production` atau tidak menyebut APP_ENV. Jangan membawa `APP_ENV=staging` dari topologi staging ke produksi. `NODE_ENV=production` tetap dipakai oleh image pada seluruh lingkungan; penentu publikasi dokumentasi adalah APP_ENV yang divalidasi startup.

Periksa `/api/docs`, `/api/docs/` dan `/api/docs/openapi.json` semuanya 404 di produksi. API langsung juga menolak `/openapi.json`; artefak tidak disalin ke root web statis. Menonaktifkan publikasi di non-produksi cukup mengatur APP_ENV menjadi production lalu mengganti instance. Tidak ada migration atau perubahan data untuk rollback.
