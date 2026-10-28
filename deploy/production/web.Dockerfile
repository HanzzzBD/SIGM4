# Image web statis SIGM4 — PR-08-19 (SDD-INF-16 b, SDD-FE-14).
#
# Berisi hasil build web dari commit yang sama dengan image API, sehingga versi web dan
# API tidak pernah berbeda di satu stack. Hanya menyajikan berkas; routing /api milik
# nginx sekolah. Dibangun job `publikasi-image` (ci.yml) dan `terbit` (rilis-produksi.yml):
#
#     docker build -f deploy/production/web.Dockerfile \
#         --build-context conf=deploy/production/nginx apps/web/dist
#
# Konteks build adalah apps/web/dist (keluaran `npm run build -w apps/web`).
FROM nginx:1.29-alpine
COPY --from=conf web.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/sigm4/web
