#!/usr/bin/env bash
# Deploy produksi bergulir di server sekolah — PR-08-17 (SDD-INF-03/04/05/10/14, CD-04/05).
#
# Dijalankan dari direktori berkas ini oleh job `deploy` pada
# .github/workflows/rilis-produksi.yml (self-hosted runner, SDD-INF-14), atau oleh
# IT sekolah saat darurat:
#
#     SIGM4_DOMAIN=sigm4.sekolah.sch.id ./deploy.sh ghcr.io/hanzzzbd/sigm4:v1.0.0 /path/web-dist
#
# Urutan mengikuti RELEASE-PLAN §3; pola gerbang kesiapannya sama dengan staging:
#   1. tarik image          — satu tag untuk api, worker, dan migration
#   2. postgres & redis     — dinyalakan bila belum, wajib `healthy`
#   3. dump pra-migration   — jaring pengaman sebelum skema berubah (RELEASE-PLAN §3 langkah 2)
#   4. job migration        — gagal = berhenti; instance lama tetap melayani
#   5. api-1, lalu api-2    — readiness gate + jeda serah Nginx (SDD-16 §5)
#   6. worker               — drain lewat stop_grace_period (SDD-INF-05)
#   7. aset web             — dari GitHub Release tag yang sama (SDD-FE-14)
#   8. proxy & certbot      — dinyalakan bila belum
#   9. retensi              — 5 image & 5 dump terakhir dipertahankan (CD-05)
# Smoke test dari luar (CD-07) dijalankan pemanggil setelah skrip ini selesai.

set -euo pipefail
cd "$(dirname "$0")"

IMAGE="${1:?Pemakaian: deploy.sh <image-ref> <direktori-web-dist>}"
WEB_DIST="$(cd "${2:?Pemakaian: deploy.sh <image-ref> <direktori-web-dist>}" && pwd)"
[[ -f "$WEB_DIST/index.html" ]] || { echo "!!  $WEB_DIST tidak memuat index.html" >&2; exit 1; }
export SIGM4_IMAGE="$IMAGE"
: "${SIGM4_DOMAIN:?SIGM4_DOMAIN wajib diisi}"
BATAS_DETIK="${READY_TIMEOUT_DETIK:-180}"
# Sama dengan staging (keputusan 61): `valid` resolver + `fail_timeout` Nginx, 5 s masing-masing.
JEDA_SERAH_DETIK="${JEDA_SERAH_DETIK:-12}"
DIR_BACKUP="${SIGM4_BACKUP_DIR:-/var/backups/sigm4}"
# CD-05 — image versi sebelumnya dipertahankan minimal 5 rilis.
SIMPAN_RILIS=5

compose() { docker compose "$@"; }

# Readiness gate (SDD-INF-04): menunggu status healthcheck, bukan sekadar `running`.
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

echo "==> 2. PostgreSQL & Redis"
compose up -d postgres redis
tunggu_sehat postgres
tunggu_sehat redis

echo "==> 3. Dump pra-migration → $DIR_BACKUP"
mkdir -p "$DIR_BACKUP"
dump="$DIR_BACKUP/pra-deploy-$(date -u +%Y%m%dT%H%M%SZ)-${IMAGE##*:}.dump"
# Socket lokal di dalam container: tanpa kata sandi lewat argumen atau log.
compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$dump.tmp"
mv "$dump.tmp" "$dump"
echo "    $(du -h "$dump" | cut -f1) $dump"

echo "==> 4. Job migration (SDD-INF-03)"
compose --profile migrate run --rm migrate

for layanan in api-1 api-2; do
    echo "==> 5. Ganti $layanan"
    compose up -d --no-deps "$layanan"
    tunggu_sehat "$layanan"
    if [[ "$layanan" == "api-1" ]]; then
        echo "    jeda serah ${JEDA_SERAH_DETIK} s sebelum api-2"
        sleep "$JEDA_SERAH_DETIK"
    fi
done

echo "==> 6. Ganti worker"
compose up -d --no-deps worker
tunggu_sehat worker

echo "==> 7. Aset web"
# Volume dibuat compose (berlabel proyek) tanpa menyalakan Nginx; nama = <proyek>_web.
compose up --no-start --no-deps nginx
docker run --rm --entrypoint sh -v sigm4-production_web:/dst -v "$WEB_DIST:/src:ro" nginx:1.29-alpine \
    -c 'find /dst -mindepth 1 -delete && cp -a /src/. /dst/'

echo "==> 8. Proxy & certbot"
compose up -d --no-deps nginx certbot

echo "==> 9. Retensi $SIMPAN_RILIS rilis (CD-05)"
repo="${IMAGE%:*}"
docker image ls "$repo" --format '{{.CreatedAt}}	{{.Repository}}:{{.Tag}}' \
    | sort -r | tail -n +$(( SIMPAN_RILIS + 1 )) | cut -f2 \
    | xargs -r docker image rm >/dev/null 2>&1 || true
ls -1t "$DIR_BACKUP"/pra-deploy-*.dump | tail -n +$(( SIMPAN_RILIS + 1 )) | xargs -r rm -f

echo "==> Selesai. Rollback: jalankan workflow 'Rilis produksi' dengan tag sebelumnya (CD-05)."
