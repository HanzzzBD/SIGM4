#!/usr/bin/env bash
# Deploy staging bergulir — PR-00-18 (SDD-INF-03/04/10, CD-04).
#
# Dijalankan di VPS dari direktori berkas ini, oleh job `deploy-staging` pada
# .github/workflows/ci.yml atau oleh operator:
#
#     SIGM4_DOMAIN=staging.contoh.sch.id ./deploy.sh ghcr.io/hanzzzbd/sigm4:<sha>
#
# Koreografi SDD-INF-10, karena Compose tidak menyediakan rolling deploy:
#   1. tarik image          — satu tag untuk api, worker, dan migration
#   2. job migration        — gagal = berhenti; instance lama tetap melayani
#   3. api-1, lalu api-2    — masing-masing wajib `healthy` (readiness gate) sebelum
#                             instance berikutnya disentuh; Nginx memindahkan trafik
#   4. worker               — diganti setelah API; wajib `healthy`
#   5. proxy & certbot      — dinyalakan bila belum
# Smoke test dari luar (CD-07) dijalankan pemanggil setelah skrip ini selesai.

set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${1:?Pemakaian: deploy.sh <image-ref>}"
export SIGM4_IMAGE="$IMAGE"
: "${SIGM4_DOMAIN:?SIGM4_DOMAIN wajib diisi}"
BATAS_DETIK="${READY_TIMEOUT_DETIK:-180}"

compose() { docker compose "$@"; }

# Readiness gate (SDD-INF-04): menunggu status healthcheck container, bukan sekadar
# `running`. Gagal = seluruh deploy gagal, instance yang belum disentuh tetap lama.
tunggu_sehat() {
    local layanan="$1" id status waktu=0
    id="$(compose ps -q "$layanan")"
    while (( waktu < BATAS_DETIK )); do
        status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}tanpa-healthcheck{{end}}' "$id")"
        case "$status" in
            healthy) echo "    $layanan siap (${waktu} s)"; return 0 ;;
            unhealthy) break ;;
        esac
        sleep 2
        waktu=$(( waktu + 2 ))
    done
    echo "!!  $layanan tidak siap dalam ${BATAS_DETIK} s (status: ${status:-?}). Log terakhir:" >&2
    compose logs --tail 40 "$layanan" >&2 || true
    return 1
}

sebelumnya="$(docker inspect -f '{{.Config.Image}}' "$(compose ps -q api-1 2>/dev/null)" 2>/dev/null || echo "—")"
echo "==> Image sebelumnya: $sebelumnya"
echo "==> Image baru     : $IMAGE"

echo "==> 1. Tarik image"
docker pull "$IMAGE"

echo "==> 2. Redis & job migration (SDD-INF-03)"
compose up -d redis
compose --profile migrate run --rm migrate

for layanan in api-1 api-2; do
    echo "==> 3. Ganti $layanan"
    compose up -d --no-deps "$layanan"
    tunggu_sehat "$layanan"
done

echo "==> 4. Ganti worker"
compose up -d --no-deps worker
tunggu_sehat worker

echo "==> 5. Proxy & certbot"
compose up -d --no-deps nginx certbot

echo "==> Selesai. Rollback: ./deploy.sh $sebelumnya"
