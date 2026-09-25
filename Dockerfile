# Image tunggal untuk sigm4-api DAN sigm4-worker (SDD-INF-01).
# Keduanya dibedakan hanya oleh entrypoint dan variabel lingkungan (SDD-SYS-08):
#   api    -> node apps/api/dist/api/index.js      (CMD bawaan di bawah)
#   worker -> node apps/api/dist/worker/index.js   (command di-override saat deploy)
# Dua image berarti dua build, dua tag, dan kemungkinan API versi X berjalan
# bersama worker versi Y — kelas masalah yang dihapus SDD-INF-01.
#
# Konteks build adalah AKAR repositori, dibatasi .dockerignore (SDD-REPO-09).
# Node LTS (INF-04); mayor dipatok agar build dapat diulang, dan 22 dipilih
# karena termasuk rentang "engines" pada package.json akar.

# ---------------------------------------------------------------------------
# Tahap build — memuat perkakas build; tidak ikut ke runtime (SDD-INF-02)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Manifest lebih dulu, sumber belakangan: lapisan npm ci hanya batal saat
# dependensi berubah, bukan setiap kali satu baris kode disunting.
# Seluruh manifest workspace wajib ikut — npm ci menolak berjalan bila satu pun
# paket yang disebut package-lock.json tidak ada (SDD-REPO-03).
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/schemas/package.json packages/schemas/
RUN npm ci

COPY . .

# Hanya pohon yang dijalankan image ini yang dibangun. apps/web dan apps/mobile
# tidak pernah berjalan dari proses Node (SDD-16 §4.2 — web disajikan sebagai
# aset statis), sehingga membangunnya di sini hanya menambah waktu dan ukuran.
# packages/schemas ikut terbangun sendiri lewat project reference apps/api.
RUN npm run build -w apps/api && npm prune --omit=dev

# ---------------------------------------------------------------------------
# Tahap dbmate — biner migration dibangun dari sumber (keputusan 56)
# ---------------------------------------------------------------------------
# dbmate 2.35.1 dari npm — versi terbaru, dan cabang utama upstream pun belum
# diperbarui — membawa lima CVE HIGH pada modul Go tidak langsung. Trivy
# menggerbangnya tanpa pengecualian (keputusan 47), sehingga biner dibangun ulang
# dari commit rilis yang sama dengan modul yang sudah ditambal. Flag build mengikuti
# Makefile upstream untuk Linux: cgo untuk sqlite, ditautkan statis.
#
# Saat dbmate dinaikkan versinya, commit dan daftar modul di bawah WAJIB ditinjau
# ulang; Dependabot tidak melacak keduanya.
FROM golang:1.26.6-alpine AS dbmate
RUN apk add --no-cache git build-base
WORKDIR /src
# v2.35.1 — dipatok ke commit, bukan tag yang dapat dipindahkan.
ARG DBMATE_COMMIT=b735560813732661b34e1743cda76ec81ceb02bf
RUN git init -q . \
    && git fetch -q --depth 1 https://github.com/amacneil/dbmate.git "$DBMATE_COMMIT" \
    && git checkout -q FETCH_HEAD
# Menutup CVE-2026-56854 (x/crypto ≥ 0.55.0), CVE-2026-46600 (x/net ≥ 0.56.0),
# CVE-2026-56852 (x/text ≥ 0.39.0), CVE-2026-84304 dan CVE-2026-84445 (grpc ≥
# 1.83.2). x/net dan x/text dinaikkan melampaui batas tambalnya karena versi
# minimum yang dituntut grpc 1.83.2 dan x/crypto 0.55.0: x/net 0.58.0, x/text 0.41.0.
RUN go get golang.org/x/crypto@v0.55.0 golang.org/x/net@v0.58.0 \
        golang.org/x/text@v0.41.0 google.golang.org/grpc@v1.83.2 \
    && go mod tidy
RUN CGO_ENABLED=1 go build -trimpath \
        -tags netgo,osusergo,sqlite_omit_load_extension,sqlite_fts5,sqlite_json \
        -ldflags '-s -extldflags "-static"' \
        -o /out/dbmate .

# ---------------------------------------------------------------------------
# Tahap runtime — tanpa perkakas build, non-root (SDD-INF-02)
# ---------------------------------------------------------------------------
FROM node:22-alpine

# Runtime hanya menjalankan `node`. npm, npx, corepack, dan yarn bawaan base image
# adalah perkakas build (SDD-INF-02) yang membawa dependensinya sendiri — 11
# temuan High/Critical Trivy pada PR-00-17 seluruhnya berasal dari sana, bukan
# dari dependensi proyek. Paket OS diperbarui agar perbaikan Alpine yang sudah
# terbit (mis. OpenSSL) tidak menunggu base image berikutnya (keputusan 47, CD-01).
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
              /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
              /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && addgroup -S app && adduser -S app -G app
WORKDIR /app

# node_modules akar beserta symlink @sigm4/* miliknya (node_modules datar,
# SDD-REPO-03). Symlink itu menunjuk ke direktori workspace, jadi manifest dan
# dist tiap workspace yang dipakai runtime wajib ikut disalin — tanpa keduanya
# symlink @sigm4/schemas menggantung dan impor gagal saat proses dinyalakan.
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/packages/schemas/package.json ./packages/schemas/package.json
COPY --from=build --chown=app:app /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=build --chown=app:app /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist

# Perkakas job migration (SDD-INF-03, keputusan 53): container sekali-jalan dari
# image yang SAMA — `node scripts/migrate.mjs up` dengan MIGRATION_DATABASE_URL —
# sehingga api, worker, dan skema yang dijalankannya berasal dari satu tag
# (SDD-INF-01). dbmate ikut lewat node_modules sebagai dependensi runtime.
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=app:app /app/apps/api/migrations ./apps/api/migrations
# Pembungkus npm dbmate memanggil @dbmate/linux-x64/bin/dbmate; biner bawaannya
# diganti biner hasil tahap `dbmate` (keputusan 56). Image ini hanya untuk amd64.
COPY --from=dbmate --chown=app:app /out/dbmate ./node_modules/@dbmate/linux-x64/bin/dbmate

USER app

# TZ=UTC dipaksa di sini dan diverifikasi lagi saat startup (SDD-INF-09, INF-07).
# Konversi ke WIB adalah urusan lapisan penyajian (NFR-C-10).
ENV NODE_ENV=production TZ=UTC

EXPOSE 3000
CMD ["node", "apps/api/dist/api/index.js"]
