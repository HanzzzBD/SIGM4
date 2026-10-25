#!/usr/bin/env bash
# Proxy tepi server sekolah — PR-08-18 (SDD-INF-15).
#
# Dijalankan dari direktori berkas ini oleh job deploy staging (ci.yml) dan
# produksi (rilis-produksi.yml) setelah stack-nya diganti, atau oleh IT sekolah
# setelah menerbitkan sertifikat pertama (runbook §4):
#
#     ./edge.sh                      # memakai /etc/sigm4/edge.env
#     EDGE_ENV=/path/edge.env ./edge.sh
#
# edge.env (disiapkan IT sekolah, tanpa rahasia) memuat domain per stack; stack
# yang domainnya kosong tidak dipublikasikan:
#     SIGM4_STAGING_DOMAIN=staging.sigm4.sekolah.sch.id
#     SIGM4_PRODUCTION_DOMAIN=sigm4.sekolah.sch.id
#
#   1. jaringan sigm4-edge  — dibuat bila belum ada (stack ikut bergabung ke sini)
#   2. render situs         — HTTPS bila sertifikat domain sudah ada, selain itu
#                             hanya tantangan HTTP-01 (penerbitan pertama tidak terkunci)
#   3. pasang               — nginx -t pada konfigurasi baru; gagal = konfigurasi lama
#                             dikembalikan dan proxy tidak tersentuh
#   4. muat ulang           — nginx -s reload, tanpa memutus koneksi berjalan

set -euo pipefail
cd "$(dirname "$0")"

EDGE_ENV="${EDGE_ENV:-/etc/sigm4/edge.env}"
[[ -r "$EDGE_ENV" ]] || { echo "!!  $EDGE_ENV tidak terbaca" >&2; exit 1; }
# shellcheck disable=SC1090
source "$EDGE_ENV"

compose() { docker compose "$@"; }

echo "==> 1. Jaringan sigm4-edge"
docker network inspect sigm4-edge >/dev/null 2>&1 || docker network create sigm4-edge >/dev/null

# Volume sertifikat harus ada sebelum diperiksa; certbot menyala tanpa menunggu nginx.
compose up -d certbot

ada_sertifikat() {
    compose run --rm --no-deps --entrypoint test certbot -f "/etc/letsencrypt/live/$1/fullchain.pem"
}

echo "==> 2. Render situs"
baru="$(mktemp -d ./situs.baru.XXXXXX)"
cp templat/00-dasar.conf "$baru/"
jumlah=0
for pasangan in "staging:${SIGM4_STAGING_DOMAIN:-}" "production:${SIGM4_PRODUCTION_DOMAIN:-}"; do
    stack="${pasangan%%:*}" domain="${pasangan#*:}"
    [[ -n "$domain" ]] || continue
    # Hanya nama host yang sah: nilai ini masuk ke konfigurasi Nginx apa adanya.
    [[ "$domain" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || { echo "!!  domain $stack tidak sah: $domain" >&2; rm -rf "$baru"; exit 1; }
    if ada_sertifikat "$domain"; then templat=templat/situs-https.conf.template; mode=HTTPS
    else templat=templat/situs-tanpa-sertifikat.conf.template; mode="menunggu sertifikat"
    fi
    sed -e "s/@DOMAIN@/$domain/g" -e "s/@HULU@/sigm4-$stack-web/g" "$templat" > "$baru/$stack.conf"
    echo "    $stack → $domain ($mode)"
    jumlah=$(( jumlah + 1 ))
done
(( jumlah > 0 )) || { echo "!!  tidak ada domain di $EDGE_ENV" >&2; rm -rf "$baru"; exit 1; }

echo "==> 3. Pasang konfigurasi"
# ./situs adalah bind mount: ISINYA yang diganti, bukan direktorinya — container
# memegang inode direktori sejak dibuat.
mkdir -p situs
lama="$(mktemp -d ./situs.lama.XXXXXX)"
cp -a situs/. "$lama/"
find situs -mindepth 1 -delete
cp -a "$baru/." situs/
rm -rf "$baru"
compose up -d nginx
if ! compose exec -T nginx nginx -t; then
    echo "!!  konfigurasi baru ditolak; yang lama dikembalikan" >&2
    find situs -mindepth 1 -delete
    cp -a "$lama/." situs/
    rm -rf "$lama"
    compose exec -T nginx nginx -s reload || true
    exit 1
fi

echo "==> 4. Muat ulang"
compose exec -T nginx nginx -s reload
rm -rf "$lama"
echo "==> Selesai."
