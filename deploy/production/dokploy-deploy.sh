#!/usr/bin/env bash
# Pemicu deploy Compose app di Dokploy server sekolah — PR-08-19 (SDD-INF-16, CD-04/05).
#
# Dijalankan job `deploy-staging` (ci.yml) dan `deploy` (rilis-produksi.yml) dari
# runner GitHub SETELAH image `<tag lingkungan>` dipindahkan ke rilis yang dideploy.
# Dokploy lalu menjalankan `docker compose up` atas deploy/production/docker-compose.yml:
# dump pra-migration → migration → api/worker, dan web statis (urutan dijamin `depends_on`).
#
#     DOKPLOY_URL=https://dokploy.example DOKPLOY_API_KEY=… \
#         ./dokploy-deploy.sh <composeId> "<judul unik deployment>"
#
# Selesai 0 hanya bila deployment berjudul itu berstatus `done`; `error`/`cancelled`
# atau melewati batas waktu = gagal, dan log Dokploy dirujuk untuk diagnosis.

set -euo pipefail

COMPOSE_ID="${1:?Pemakaian: dokploy-deploy.sh <composeId> <judul>}"
JUDUL="${2:?Pemakaian: dokploy-deploy.sh <composeId> <judul>}"
: "${DOKPLOY_URL:?DOKPLOY_URL wajib diisi}" "${DOKPLOY_API_KEY:?DOKPLOY_API_KEY wajib diisi}"
BATAS_DETIK="${DOKPLOY_BATAS_DETIK:-1800}"
JEDA_DETIK="${DOKPLOY_JEDA_DETIK:-10}"
API="${DOKPLOY_URL%/}/api"

# Kunci API lewat berkas header, bukan argumen: tidak tampak di daftar proses.
header="$(mktemp)"
trap 'rm -f "$header"' EXIT
printf 'x-api-key: %s\n' "$DOKPLOY_API_KEY" > "$header"

panggil() { curl -fsS --retry 3 --retry-all-errors -H "@$header" -H 'Content-Type: application/json' "$@"; }

echo "==> Picu deploy compose $COMPOSE_ID: $JUDUL"
panggil -X POST "$API/compose.deploy" \
    -d "$(jq -n --arg id "$COMPOSE_ID" --arg t "$JUDUL" '{composeId: $id, title: $t}')" >/dev/null

waktu=0
status="belum-tercatat"
while (( waktu < BATAS_DETIK )); do
    sleep "$JEDA_DETIK"
    waktu=$(( waktu + JEDA_DETIK ))
    # Judul memuat id run + percobaan GitHub, sehingga deployment lama tidak pernah
    # terbaca sebagai hasil run ini.
    status="$(panggil -G "$API/deployment.allByCompose" --data-urlencode "composeId=$COMPOSE_ID" \
        | jq -r --arg t "$JUDUL" '[.[] | select(.title == $t)] | sort_by(.createdAt) | last | .status // "belum-tercatat"')"
    case "$status" in
        done) echo "    selesai (${waktu} s)"; exit 0 ;;
        error | cancelled) break ;;
    esac
done

echo "!!  Deployment '$JUDUL' berstatus '$status' setelah ${waktu} s." >&2
echo "    Log lengkap: dashboard Dokploy → app ini → Deployments. Bila api ikut berhenti," >&2
echo "    pulihkan dengan deploy ulang tag sebelumnya (CD-05, runbook §6)." >&2
exit 1
