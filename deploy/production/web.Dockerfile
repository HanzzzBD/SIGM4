# Image web statis SIGM4 — PR-08-19 (SDD-INF-16 b, SDD-FE-14).
#
# Berisi hasil build web dari commit yang sama dengan image API, sehingga versi web dan
# API tidak pernah berbeda di satu stack. Hanya menyajikan berkas; routing /api milik
# nginx sekolah. Dibangun job `publikasi-image` (ci.yml) dan `terbit` (rilis-produksi.yml):
#
#     docker build -f deploy/production/web.Dockerfile \
#         --build-context conf=deploy/production/nginx apps/web/dist/app
#
# Konteks build adalah apps/web/dist/app — `outDir` Vite (apps/web/vite.config.ts);
# apps/web/dist sendiri juga memuat keluaran tsc.
FROM nginx:1.29-alpine
# Paket Alpine image dasar sering tertinggal dari perbaikan keamanan; Trivy (HIGH/CRITICAL)
# menggerbang image ini seperti image API, yang juga memakai `apk upgrade` (merah pada push
# staging pertama, 28 Oktober 2026: 48 HIGH, seluruhnya sudah ada versi perbaikannya).
RUN apk upgrade --no-cache
COPY --from=conf web.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/sigm4/web
# Konteks yang salah tetap lolos build tetapi menyajikan 404; gagalkan di sini.
RUN test -f /usr/share/sigm4/web/index.html
