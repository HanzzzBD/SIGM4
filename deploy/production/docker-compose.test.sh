#!/usr/bin/env bash
# Uji topologi stack Dokploy — PR-08-19 (SDD-INF-16, SDD-16 §4.7). Dijalankan job `uji-berkas`.
#
# Memeriksa hal yang tidak dijaga Dokploy maupun `compose config` biasa:
#   - pemisahan rahasia: akun DDL tidak pernah sampai ke api/worker, rahasia aplikasi
#     tidak sampai ke migrate/backup (SEC-CFG-03);
#   - urutan deploy: backup → migrate → api/worker, lewat service_completed_successfully
#     (SDD-INF-03, RELEASE-PLAN §3);
#   - tag lingkungan selalu ditarik ulang (SDD-INF-16 c); hanya nginx yang membuka port
#     host, dari SIGM4_HTTP_PORT, dan X-Forwarded-For hanya dipercaya dari nginx sekolah;
#   - image web (web.Dockerfile) memuat aset dan konfigurasi Nginx yang lolos `nginx -t`.

set -euo pipefail
cd "$(dirname "$0")"
kerja="$(mktemp -d)"
trap 'rm -rf "$kerja"' EXIT
gagal() { echo "!!  $*" >&2; exit 1; }

# Nilai contoh, bukan rahasia: setiap nama yang diminta compose diisi nama-nya sendiri.
cat > "$kerja/.env" <<'ENV'
SIGM4_TAG=uji
SIGM4_APP_ENV=staging
SIGM4_HTTP_PORT=18081
SIGM4_PROXY_CIDR=10.9.8.7/32
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
for s in api-1 api-2 worker; do
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
for s in api-1 api-2 worker; do
    [[ "$(c ".services[\"$s\"].depends_on.migrate.condition")" == "service_completed_successfully" ]] \
        || gagal "$s tidak menunggu migration berhasil"
done
[[ "$(c '.services.migrate.depends_on.backup.condition')" == "service_completed_successfully" ]] \
    || gagal "migrate tidak menunggu dump pra-migration"

echo "==> Tag lingkungan ditarik ulang; port host hanya nginx (SDD-INF-16)"
for s in nginx api-1 api-2 worker migrate; do
    [[ "$(c ".services[\"$s\"].pull_policy")" == "always" ]] || gagal "$s tidak pull_policy always"
    [[ "$(c ".services[\"$s\"].image")" == *":uji" ]] || gagal "$s tidak memakai SIGM4_TAG"
done
[[ "$(c '[.services | to_entries[] | select(.value.ports != null) | .key] | join(",")')" == "nginx" ]] \
    || gagal "port host dibuka selain oleh nginx"
[[ "$(c '.services.nginx.ports[0].published')" == "18081" ]] || gagal "port nginx bukan SIGM4_HTTP_PORT"
[[ "$(c '.services.nginx.ports[0].target')" == "80" ]] || gagal "port nginx tidak ke 80"
[[ "$(c '.services.nginx.environment.SIGM4_PROXY_CIDR')" == "10.9.8.7/32" ]] || gagal "nginx tanpa SIGM4_PROXY_CIDR"

echo "==> Variabel wajib kosong ditolak"
for v in SIGM4_TAG SIGM4_HTTP_PORT SIGM4_PROXY_CIDR; do
    grep -v "^$v=" "$kerja/.env" > "$kerja/tanpa.env"
    if docker compose -p sigm4-uji --env-file "$kerja/tanpa.env" -f docker-compose.yml config --quiet 2>/dev/null; then
        gagal "compose diterima tanpa $v"
    fi
done

echo "==> Image web: aset + nginx -t"
mkdir -p "$kerja/dist"
echo '<!doctype html><title>uji</title>' > "$kerja/dist/index.html"
docker build -q -f web.Dockerfile --build-context conf=nginx -t sigm4-web:uji "$kerja/dist" >/dev/null
docker run --rm -e SIGM4_PROXY_CIDR=10.9.8.7/32 --entrypoint sh sigm4-web:uji -c \
    'test -f /usr/share/sigm4/web/index.html && /docker-entrypoint.d/20-envsubst-on-templates.sh >/dev/null \
        && grep -q "set_real_ip_from 10.9.8.7/32;" /etc/nginx/conf.d/default.conf && nginx -t'
docker image rm sigm4-web:uji >/dev/null

echo "==> Lulus"
