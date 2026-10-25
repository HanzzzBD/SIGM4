#!/usr/bin/env bash
# Uji konfigurasi Nginx server sekolah — PR-08-18 (SDD-INF-15). Dijalankan job `uji-berkas`.
#
# Merender setiap konfigurasi persis seperti edge.sh, lalu `nginx -t` pada image yang
# sama dengan produksi: dasar + situs tanpa sertifikat + situs HTTPS (sertifikat
# swa-tanda tangan sementara), dan template Nginx stack aplikasi. Selain itu memeriksa
# penolakan domain yang bukan nama host sah.

set -euo pipefail
cd "$(dirname "$0")"
IMAGE_NGINX=nginx:1.29-alpine
kerja="$(mktemp -d)"
trap 'rm -rf "$kerja"' EXIT

render() { sed -e "s/@DOMAIN@/$2/g" -e "s/@HULU@/$3/g" "templat/$1" > "$kerja/$4"; }

echo "==> Proxy tepi: dasar + staging (HTTPS) + produksi (menunggu sertifikat)"
mkdir -p "$kerja/edge" "$kerja/le/live/staging.contoh.sch.id"
cp templat/00-dasar.conf "$kerja/edge/"
render situs-https.conf.template staging.contoh.sch.id sigm4-staging-web edge/staging.conf
render situs-tanpa-sertifikat.conf.template contoh.sch.id sigm4-production-web edge/production.conf
if grep -q '@[A-Z]*@' "$kerja"/edge/*.conf; then echo "!!  placeholder tersisa" >&2; exit 1; fi
docker run --rm -v "$kerja/le:/le" "$IMAGE_NGINX" sh -c \
    'apk add --no-cache openssl >/dev/null && openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=staging.contoh.sch.id \
        -keyout /le/live/staging.contoh.sch.id/privkey.pem -out /le/live/staging.contoh.sch.id/fullchain.pem 2>/dev/null'
docker run --rm -v "$kerja/edge:/etc/nginx/conf.d:ro" -v "$kerja/le:/etc/letsencrypt:ro" "$IMAGE_NGINX" nginx -t

echo "==> Nginx stack aplikasi"
mkdir -p "$kerja/stack"
docker run --rm -v "$(cd ../production/nginx && pwd)/sigm4.conf.template:/etc/nginx/templates/default.conf.template:ro" \
    "$IMAGE_NGINX" sh -c '/docker-entrypoint.d/20-envsubst-on-templates.sh >/dev/null && nginx -t'

echo "==> Domain tidak sah ditolak"
pola='^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
for buruk in 'contoh.sch.id;' 'a b' '' '-awal.sch.id' 'contoh.sch.id}'; do
    if [[ "$buruk" =~ $pola ]]; then echo "!!  diterima: '$buruk'" >&2; exit 1; fi
done
grep -qF "$pola" edge.sh || { echo "!!  pola domain edge.sh berubah tanpa uji ini" >&2; exit 1; }

echo "==> Lulus"
