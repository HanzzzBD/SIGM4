#!/usr/bin/env bash
# Smoke test pasca-deploy — PR-00-18 (CD-07).
#
# Dijalankan dari LUAR VPS terhadap origin publik, persis jalur pengguna:
# DNS → TLS → Nginx → API. Pemeriksaan dari dalam VPS tidak membuktikan proxy,
# sertifikat, maupun HSTS.
#
#     ./smoke-test.sh https://staging.contoh.sch.id
#
# Alur kritis CD-07 — login, cari aset, ajukan reservasi, scan QR, buat tiket
# kerusakan — belum ada endpoint-nya. Setiap alur ditambahkan ke berkas ini oleh PR
# yang membangun endpoint tersebut; sampai itu, yang dibuktikan adalah jalur
# pengirimannya: API hidup, siap, dan berada di belakang proxy yang benar.
#
# SMOKE_CURL_OPTS dipakai HANYA oleh staging tiruan bersertifikat self-signed (-k).

set -euo pipefail

BASE="${1:?Pemakaian: smoke-test.sh <base-url>}"
BASE="${BASE%/}"
read -r -a OPSI <<< "${SMOKE_CURL_OPTS:-}"
KERJA="$(mktemp -d)"
trap 'rm -rf "$KERJA"' EXIT
GAGAL=0

periksa() {
    local nama="$1" path="$2" harap="$3" kode
    kode="$(curl -sS "${OPSI[@]}" --max-time 10 -o "$KERJA/body" -D "$KERJA/header" -w '%{http_code}' "$BASE$path" || echo 000)"
    if [[ "$kode" == "$harap" ]]; then
        echo "  ok    $nama — $path → $kode"
    else
        echo "  GAGAL $nama — $path → $kode (harap $harap)" >&2
        GAGAL=1
    fi
}

header_ada() {
    local nama="$1"
    if grep -qi "^$nama:" "$KERJA/header"; then
        echo "  ok    header $nama"
    else
        echo "  GAGAL header $nama tidak ada" >&2
        GAGAL=1
    fi
}

echo "Smoke test $BASE"
periksa "liveness API" "/api/v1/health/live" 200
periksa "readiness API (DB + Redis)" "/api/v1/health/ready" 200
header_ada "X-Request-Id"                 # SDD-OBS-03
header_ada "Content-Security-Policy"      # NFR-S-11 — dari aplikasi
header_ada "Strict-Transport-Security"    # INF-06 — dari proxy
periksa "route tak dikenal → 404 berformat Bab 17.2" "/api/v1/tidak-ada" 404
if grep -q '"code"' "$KERJA/body"; then
    echo "  ok    amplop galat ber-code"
else
    echo "  GAGAL amplop galat tanpa code" >&2
    GAGAL=1
fi

exit "$GAGAL"
