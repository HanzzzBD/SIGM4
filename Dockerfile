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
# Tahap runtime — tanpa perkakas build, non-root (SDD-INF-02)
# ---------------------------------------------------------------------------
FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app
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

USER app

# TZ=UTC dipaksa di sini dan diverifikasi lagi saat startup (SDD-INF-09, INF-07).
# Konversi ke WIB adalah urusan lapisan penyajian (NFR-C-10).
ENV NODE_ENV=production TZ=UTC

EXPOSE 3000
CMD ["node", "apps/api/dist/api/index.js"]
