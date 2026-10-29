#!/usr/bin/env bash
# Uji pemicu deploy Dokploy — PR-08-19 (SDD-INF-16). Dijalankan job `uji-berkas`.
#
# `curl` diganti tiruan yang meniru API Dokploy, termasuk perilaku yang membuat rilis
# v0.1.1 merah padahal deploy-nya berhasil: judul deployment DITIMPA pesan commit saat
# selesai. Skenario: sukses (judul berubah), deployment error, kunci ditolak (401),
# compose salah (404), dan gangguan jaringan sesaat saat pemantauan.

set -uo pipefail
cd "$(dirname "$0")"
kerja="$(mktemp -d)"
trap 'rm -rf "$kerja"' EXIT
gagal() { echo "!!  $*" >&2; exit 1; }

mkdir -p "$kerja/bin"
cat > "$kerja/bin/curl" <<'TIRUAN'
#!/usr/bin/env bash
# Tiruan curl: -o <berkas> -w '%{http_code}' ... <url>. Keadaan di $TIRUAN_DIR.
keluar=""; url=""; post=0
while (( $# )); do
    case "$1" in
        -o) keluar="$2"; shift ;;
        -X) [[ "$2" == POST ]] && post=1; shift ;;
        -w|-H|-d|--connect-timeout|--max-time|--data-urlencode) shift ;;
        http*) url="$1" ;;
    esac
    shift
done
d="$TIRUAN_DIR"; n=$(( $(cat "$d/n" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$d/n"
if [[ "$url" == */compose.deploy ]]; then
    printf '%s' "${TIRUAN_KODE_DEPLOY:-200}"; echo '{}' > "$keluar"; echo 1 > "$d/dipicu"; exit 0
fi
# allByCompose
if [[ -n "${TIRUAN_PUTUS_PADA:-}" && "$n" == "$TIRUAN_PUTUS_PADA" ]]; then printf '000'; exit 7; fi
lama='{"deploymentId":"lama","title":"rilis lama","status":"done","createdAt":"2026-10-27T00:00:00Z"}'
if [[ ! -f "$d/dipicu" ]]; then echo "[$lama]" > "$keluar"; printf 200; exit 0; fi
k=$(( $(cat "$d/k" 2>/dev/null || echo 0) + 1 )); echo "$k" > "$d/k"
if (( k < 2 )); then echo "[$lama]" > "$keluar"
elif (( k < 3 )); then echo "[{\"deploymentId\":\"baru\",\"title\":\"$TIRUAN_JUDUL\",\"status\":\"running\",\"createdAt\":\"2026-10-29T00:00:00Z\"},$lama]" > "$keluar"
else echo "[{\"deploymentId\":\"baru\",\"title\":\"PR-08-19: pesan commit\",\"status\":\"$TIRUAN_AKHIR\",\"createdAt\":\"2026-10-29T00:00:00Z\"},$lama]" > "$keluar"
fi
printf 200
TIRUAN
chmod +x "$kerja/bin/curl"

jalankan() { # <nama> <kode yang diharapkan> [VAR=nilai ...]
    local nama="$1" harap="$2"; shift 2
    local d="$kerja/$nama"; mkdir -p "$d"
    env PATH="$kerja/bin:$PATH" TIRUAN_DIR="$d" TIRUAN_JUDUL="uji run 1" TIRUAN_AKHIR=done \
        DOKPLOY_URL=https://dokploy.contoh/ DOKPLOY_API_KEY=rahasia DOKPLOY_JEDA_DETIK=1 DOKPLOY_BATAS_DETIK=30 \
        "$@" bash ./dokploy-deploy.sh compose-uji "uji run 1" > "$d/out" 2>&1
    local kode=$?
    [[ "$kode" == "$harap" ]] || { cat "$d/out" >&2; gagal "$nama: kode $kode, diharapkan $harap"; }
    echo "    $nama: kode $kode"
}

echo "==> Skenario"
jalankan sukses-judul-ditimpa 0
jalankan deployment-error 1 TIRUAN_AKHIR=error
jalankan kunci-ditolak 1 TIRUAN_KODE_DEPLOY=401
grep -q "kunci API ditolak" "$kerja/kunci-ditolak/out" || gagal "401 tanpa penjelasan kunci"
jalankan compose-salah 1 TIRUAN_KODE_DEPLOY=404
grep -q "compose tidak ditemukan" "$kerja/compose-salah/out" || gagal "404 tanpa penjelasan compose"
jalankan jaringan-sesaat 0 TIRUAN_PUTUS_PADA=3
grep -q "deployment baru tercatat" "$kerja/sukses-judul-ditimpa/out" || gagal "deployment tidak dilacak lewat id"

echo "==> Lulus"
