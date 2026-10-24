#!/usr/bin/env bash
# Gerbang jendela deploy produksi — PR-08-17 (CD-06, NFR-A-03, SDD-16 §6).
#
# Menolak deploy pada jam operasional sekolah: Senin–Sabtu 06.00–18.00 WIB
# (bawaan NFR-A-01; PRD 00-foundation/conventions.md). Pengecualian hanya lewat
# JENDELA_PAKSA=true disertai JENDELA_ALASAN, dan alasannya dicetak ke log job
# sebagai catatan (SDD-16 §6: "kecuali dipaksa dan dicatat").
#
# JENDELA_WAKTU (epoch detik) hanya untuk uji; tanpa itu dipakai waktu sekarang.
#
#     ./jendela-deploy.sh            → kode 0 di luar jam operasional, 1 di dalamnya

set -euo pipefail

epoch="${JENDELA_WAKTU:-$(date -u +%s)}"
# WIB = UTC+7 tanpa DST: dihitung langsung, tidak bergantung tzdata server — tanpa
# tzdata, TZ=Asia/Jakarta diam-diam jatuh ke UTC dan gerbang bergeser 7 jam.
wib=$(( epoch + 7 * 3600 ))
# %u: 1 = Senin … 7 = Minggu; %H%M: jam dan menit WIB.
read -r hari jam <<< "$(date -u -d "@$wib" '+%u %H%M')"
waktu_wib="$(date -u -d "@$wib" '+%A %Y-%m-%d %H:%M') WIB"

if (( hari <= 6 )) && (( 10#$jam >= 600 )) && (( 10#$jam < 1800 )); then
    if [[ "${JENDELA_PAKSA:-false}" == "true" ]]; then
        alasan="${JENDELA_ALASAN:-}"
        if [[ -z "${alasan// /}" ]]; then
            echo "!!  Deploy paksa di jam operasional wajib menyertakan alasan (CD-06)." >&2
            exit 1
        fi
        echo "::warning::Deploy PAKSA di jam operasional ($waktu_wib) oleh ${GITHUB_ACTOR:-operator}: ${JENDELA_ALASAN}"
        exit 0
    fi
    echo "!!  $waktu_wib berada di jam operasional (Senin–Sabtu 06.00–18.00 WIB)." >&2
    echo "    Deploy produksi hanya di luar jam operasional (CD-06). Jalankan ulang workflow" >&2
    echo "    'Rilis produksi' di luar jam itu, atau paksa dengan alasan tertulis." >&2
    exit 1
fi
echo "    $waktu_wib — di luar jam operasional, deploy diizinkan (CD-06)."
