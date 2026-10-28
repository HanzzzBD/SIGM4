#!/usr/bin/env bash
# Uji topologi stack Dokploy — PR-08-19 (SDD-INF-16, SDD-16 §4.7). Dijalankan job `uji-berkas`.
#
# Memeriksa hal yang tidak dijaga Dokploy maupun `compose config` biasa:
#   - pemisahan rahasia: akun DDL tidak pernah sampai ke api/worker, rahasia aplikasi
#     tidak sampai ke migrate/backup (SEC-CFG-03);
#   - urutan deploy: backup → migrate → api/worker, lewat service_completed_successfully
#     (SDD-INF-03, RELEASE-PLAN §3);
#   - tag lingkungan selalu ditarik ulang (SDD-INF-16 c); hanya web dan api yang membuka
#     port host, dari SIGM4_WEB_PORT dan SIGM4_API_PORT, tak satu pun 3000 di host;
#   - image web (web.Dockerfile) hanya menyajikan berkas statis (tanpa proxy /api) dan lolos `nginx -t`.

set -euo pipefail
cd "$(dirname "$0")"
kerja="$(mktemp -d)"
trap 'rm -rf "$kerja"' EXIT
gagal() { echo "!!  $*" >&2; exit 1; }

# Nilai contoh, bukan rahasia: setiap nama yang diminta compose diisi nama-nya sendiri.
cat > "$kerja/.env" <<'ENV'
SIGM4_TAG=uji
SIGM4_APP_ENV=staging
SIGM4_API_PORT=13010
SIGM4_WEB_PORT=13011
DATABASE_URL=uji-DATABASE_URL
JWT_PRIVATE_KEY=uji-JWT_PRIVATE_KEY
JWT_PUBLIC_KEY=uji-JWT_PUBLIC_KEY
TOTP_ENCRYPTION_KEY=uji-TOTP_ENCRYPTION_KEY
APP_BASE_URL=https://staging.contoh.sch.id
S3_ENDPOINT=https://s3.contoh
S3_PUBLIC_ENDPOINT=https://s3.contoh
S3_REGION=uji
S3_BUCKET=uji
S3_ACCESS_KEY=uji-S3_ACCESS_KEY
S3_SECRET_KEY=uji-S3_SECRET_KEY
POSTGRES_USER=uji-POSTGRES_USER
POSTGRES_PASSWORD=uji-POSTGRES_PASSWORD
POSTGRES_DB=sigm4
MIGRATION_DATABASE_URL=uji-MIGRATION_DATABASE_URL
APP_DB_PASSWORD=uji-APP_DB_PASSWORD
ENV

echo "==> Compose valid dengan env Dokploy"
docker compose -p sigm4-uji --env-file "$kerja/.env" -f docker-compose.yml config --format json > "$kerja/c.json"
c() { jq -r "$1" "$kerja/c.json"; }

echo "==> Pemisahan rahasia (SEC-CFG-03)"
for s in api worker; do
    for v in POSTGRES_PASSWORD MIGRATION_DATABASE_URL APP_DB_PASSWORD; do
        [[ "$(c ".services[\"$s\"].environment.$v // \"\"")" == "" ]] || gagal "$s menerima $v"
    done
    [[ "$(c ".services[\"$s\"].environment.DATABASE_URL")" == "uji-DATABASE_URL" ]] || gagal "$s tanpa DATABASE_URL"
done
for s in migrate backup postgres; do
    for v in JWT_PRIVATE_KEY TOTP_ENCRYPTION_KEY S3_SECRET_KEY DATABASE_URL; do
        [[ "$(c ".services[\"$s\"].environment.$v // \"\"")" == "" ]] || gagal "$s menerima $v"
    done
done
[[ "$(c '.services.migrate.environment.MIGRATION_DATABASE_URL')" == "uji-MIGRATION_DATABASE_URL" ]] || gagal "migrate tanpa akun DDL"

echo "==> Urutan backup → migrate → aplikasi (SDD-INF-03)"
for s in api worker; do
    [[ "$(c ".services[\"$s\"].depends_on.migrate.condition")" == "service_completed_successfully" ]] \
        || gagal "$s tidak menunggu migration berhasil"
done
[[ "$(c '.services.migrate.depends_on.backup.condition')" == "service_completed_successfully" ]] \
    || gagal "migrate tidak menunggu dump pra-migration"

echo "==> Tag lingkungan ditarik ulang; port host hanya web & api (SDD-INF-16)"
for s in web api worker migrate; do
    [[ "$(c ".services[\"$s\"].pull_policy")" == "always" ]] || gagal "$s tidak pull_policy always"
    [[ "$(c ".services[\"$s\"].image")" == *":uji" ]] || gagal "$s tidak memakai SIGM4_TAG"
done
[[ "$(c '[.services | to_entries[] | select(.value.ports != null) | .key] | sort | join(",")')" == "api,web" ]] \
    || gagal "port host dibuka selain oleh web dan api"
[[ "$(c '.services.api.ports[0].published'):$(c '.services.api.ports[0].target')" == "13010:3000" ]] || gagal "port api bukan SIGM4_API_PORT→3000"
[[ "$(c '.services.web.ports[0].published'):$(c '.services.web.ports[0].target')" == "13011:80" ]] || gagal "port web bukan SIGM4_WEB_PORT→80"

echo "==> Variabel wajib kosong ditolak"
for v in SIGM4_TAG SIGM4_API_PORT SIGM4_WEB_PORT; do
    grep -v "^$v=" "$kerja/.env" > "$kerja/tanpa.env"
    if docker compose -p sigm4-uji --env-file "$kerja/tanpa.env" -f docker-compose.yml config --quiet 2>/dev/null; then
        gagal "compose diterima tanpa $v"
    fi
done

echo "==> Image web: aset statis tanpa proxy + nginx -t"
mkdir -p "$kerja/dist"
echo '<!doctype html><title>uji</title>' > "$kerja/dist/index.html"
docker build -q -f web.Dockerfile --build-context conf=nginx -t sigm4-web:uji "$kerja/dist" >/dev/null
docker run --rm --entrypoint sh sigm4-web:uji -c \
    'test -f /usr/share/sigm4/web/index.html && ! grep -q proxy_pass /etc/nginx/conf.d/default.conf && nginx -t'
docker image rm sigm4-web:uji >/dev/null

echo "==> Image web: konteks tanpa index.html di akar ditolak"
# Bentuk apps/web/dist yang sebenarnya: hasil Vite di app/, keluaran tsc di tsc/.
mkdir -p "$kerja/dist-salah/app" "$kerja/dist-salah/tsc"
echo '<!doctype html><title>uji</title>' > "$kerja/dist-salah/app/index.html"
if docker build -q -f web.Dockerfile --build-context conf=nginx -t sigm4-web:salah "$kerja/dist-salah" >/dev/null 2>&1; then
    docker image rm sigm4-web:salah >/dev/null
    gagal "image web terbangun dari konteks tanpa index.html di akar"
fi

echo "==> Uji pemanggil: workflow membangun dari outDir Vite"
for wf in ../../.github/workflows/ci.yml ../../.github/workflows/rilis-produksi.yml; do
    grep -q 'web.Dockerfile .* apps/web/dist/app$' "$wf" || gagal "$wf tidak membangun image web dari apps/web/dist/app"
done
outdir="$(grep -oE 'outDir: "[^"]+"' ../../apps/web/vite.config.ts | cut -d'"' -f2)"
[[ "$outdir" == "dist/app" ]] || gagal "outDir Vite berubah ($outdir) — sesuaikan konteks build image web"

echo "==> Lulus"
