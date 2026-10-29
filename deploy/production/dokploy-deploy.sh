#!/usr/bin/env bash
# Pemicu deploy Compose app di Dokploy server sekolah — PR-08-19 (SDD-INF-16, CD-04/05).
#
# Dijalankan job `deploy-staging` (ci.yml) dan `deploy` (rilis-produksi.yml) dari
# runner GitHub SETELAH image `<tag lingkungan>` dipindahkan ke rilis yang dideploy.
# Dokploy lalu menjalankan `docker compose up` atas deploy/production/docker-compose.yml:
# dump pra-migration → migration → api/worker, dan web statis (urutan dijamin `depends_on`).
#
#     DOKPLOY_URL=https://dokploy.example DOKPLOY_API_KEY=… \
#         ./dokploy-deploy.sh <composeId> "<judul deployment>"
#
# Deployment dilacak lewat deploymentId, BUKAN judul: Dokploy menimpa judul dengan pesan
# commit Git ketika deployment selesai (services/compose.ts, blok `finally`), sehingga
# pelacakan per judul tidak pernah melihat `done` (rilis v0.1.1, 28 Oktober 2026).
# Selesai 0 hanya bila deployment baru itu berstatus `done`; `error`/`cancelled` atau
# melewati batas waktu = gagal. Gangguan jaringan sesaat ditoleransi selama pemantauan.

set -euo pipefail

COMPOSE_ID="${1:?Pemakaian: dokploy-deploy.sh <composeId> <judul>}"
JUDUL="${2:?Pemakaian: dokploy-deploy.sh <composeId> <judul>}"
: "${DOKPLOY_URL:?DOKPLOY_URL wajib diisi}" "${DOKPLOY_API_KEY:?DOKPLOY_API_KEY wajib diisi}"
BATAS_DETIK="${DOKPLOY_BATAS_DETIK:-1800}"
JEDA_DETIK="${DOKPLOY_JEDA_DETIK:-10}"
API="${DOKPLOY_URL%/}/api"

# Kunci API lewat berkas header, bukan argumen: tidak tampak di daftar proses.
kerja="$(mktemp -d)"
trap 'rm -rf "$kerja"' EXIT
printf 'x-api-key: %s\n' "$DOKPLOY_API_KEY" > "$kerja/header"

# Kode HTTP ke stdout, badan ke $kerja/badan; 000 = tidak tersambung.
http() {
    local k
    k="$(curl -sS -o "$kerja/badan" -w '%{http_code}' --connect-timeout 20 --max-time 60 \
        -H "@$kerja/header" -H 'Content-Type: application/json' "$@" 2>/dev/null)" || true
    echo "${k:-000}"
}

jelaskan() {
    case "$1" in
        401 | 403) echo "kunci API ditolak (secret DOKPLOY_API_KEY salah, kedaluwarsa, atau milik organisasi lain)" ;;
        404) echo "compose tidak ditemukan (variabel DOKPLOY_COMPOSE_ID harus bagian URL sesudah /compose/)" ;;
        000) echo "Dokploy tidak dapat dihubungi" ;;
        *) echo "Dokploy menjawab HTTP $1" ;;
    esac
}

# Daftar deployment app ini; gagal = kode keluar 1 (pemanggil memutuskan toleransinya).
daftar() {
    local kode
    kode="$(http -G "$API/deployment.allByCompose" --data-urlencode "composeId=$COMPOSE_ID")"
    [[ "$kode" == 200 ]] || { echo "    (daftar deployment: $(jelaskan "$kode"))" >&2; return 1; }
    cat "$kerja/badan"
}

echo "==> Deployment yang sudah ada"
for _ in 1 2 3 4 5 6; do
    if daftar > "$kerja/sebelum.json"; then break; fi
    sleep "$JEDA_DETIK"
done
[[ -s "$kerja/sebelum.json" ]] || { echo "!!  Daftar deployment tidak dapat dibaca; deploy tidak dipicu." >&2; exit 1; }

echo "==> Picu deploy compose $COMPOSE_ID: $JUDUL"
kode="$(http -X POST "$API/compose.deploy" \
    -d "$(jq -n --arg id "$COMPOSE_ID" --arg t "$JUDUL" '{composeId: $id, title: $t}')")"
if [[ "$kode" != 2* ]]; then
    echo "!!  Deploy tidak dipicu: $(jelaskan "$kode")." >&2
    exit 1
fi

waktu=0
id=""
status="belum-tercatat"
while (( waktu < BATAS_DETIK )); do
    sleep "$JEDA_DETIK"
    waktu=$(( waktu + JEDA_DETIK ))
    daftar > "$kerja/sesudah.json" || continue
    if [[ -z "$id" ]]; then
        # Deployment pertama yang belum ada sebelum pemicuan = milik run ini.
        id="$(jq -r --slurpfile lama "$kerja/sebelum.json" \
            '[.[] | select(.deploymentId as $d | ($lama[0] | map(.deploymentId) | index($d)) == null)]
             | sort_by(.createdAt) | first | .deploymentId // ""' "$kerja/sesudah.json")"
        [[ -n "$id" ]] && echo "    deployment $id tercatat (${waktu} s)"
        [[ -n "$id" ]] || continue
    fi
    status="$(jq -r --arg d "$id" '[.[] | select(.deploymentId == $d)] | first | .status // "hilang"' "$kerja/sesudah.json")"
    case "$status" in
        done) echo "    selesai (${waktu} s)"; exit 0 ;;
        error | cancelled) break ;;
    esac
done

echo "!!  Deployment ${id:-(tidak tercatat)} berstatus '$status' setelah ${waktu} s." >&2
echo "    Log lengkap: dashboard Dokploy → app ini → Deployments. Bila api ikut berhenti," >&2
echo "    pulihkan dengan deploy ulang tag sebelumnya (CD-05, runbook §6)." >&2
exit 1
