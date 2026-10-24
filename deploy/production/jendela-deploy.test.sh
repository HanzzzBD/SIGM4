#!/usr/bin/env bash
# Uji gerbang jendela deploy (CD-06) — PR-08-17. Dijalankan job `uji-berkas` CI.
# Waktu dipatok lewat JENDELA_WAKTU (epoch UTC); WIB = UTC+7.

set -uo pipefail
cd "$(dirname "$0")"
GAGAL=0

harap() {
    local nama="$1" kode_harap="$2" utc="$3"; shift 3
    local kode
    env JENDELA_WAKTU="$(date -u -d "$utc" +%s)" "$@" bash ./jendela-deploy.sh >/dev/null 2>&1
    kode=$?
    if [[ "$kode" == "$kode_harap" ]]; then
        echo "  ok    $nama"
    else
        echo "  GAGAL $nama — kode $kode, harap $kode_harap" >&2
        GAGAL=1
    fi
}

# 2026-10-26 adalah Senin; 2026-10-31 Sabtu; 2026-11-01 Minggu.
harap "Senin 10.00 WIB ditolak"              1 "2026-10-26 03:00"
harap "Senin 06.00 WIB ditolak (batas awal)" 1 "2026-10-25 23:00"
harap "Senin 05.59 WIB diizinkan"            0 "2026-10-25 22:59"
harap "Senin 17.59 WIB ditolak"              1 "2026-10-26 10:59"
harap "Senin 18.00 WIB diizinkan (batas akhir)" 0 "2026-10-26 11:00"
harap "Sabtu 12.00 WIB ditolak"              1 "2026-10-31 05:00"
harap "Minggu 12.00 WIB diizinkan"           0 "2026-11-01 05:00"
harap "Senin 22.00 WIB diizinkan"            0 "2026-10-26 15:00"
harap "Paksa tanpa alasan ditolak"           1 "2026-10-26 03:00" JENDELA_PAKSA=true
harap "Paksa alasan spasi ditolak"           1 "2026-10-26 03:00" JENDELA_PAKSA=true "JENDELA_ALASAN=   "
harap "Paksa dengan alasan diizinkan"        0 "2026-10-26 03:00" JENDELA_PAKSA=true "JENDELA_ALASAN=perbaikan keamanan darurat"

exit "$GAGAL"
