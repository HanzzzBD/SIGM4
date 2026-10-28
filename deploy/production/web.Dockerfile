# Image Nginx stack aplikasi — PR-08-19 (SDD-INF-16, SDD-FE-14).
#
# Berisi hasil build web dan template Nginx dari commit yang sama dengan image API,
# sehingga versi web dan API tidak pernah berbeda di satu stack. Dibangun job
# `publikasi-image` (ci.yml) dan `terbit` (rilis-produksi.yml):
#
#     docker build -f deploy/production/web.Dockerfile \
#         --build-context conf=deploy/production/nginx apps/web/dist
#
# Konteks build adalah apps/web/dist (keluaran `npm run build -w apps/web`).
FROM nginx:1.29-alpine
COPY --from=conf sigm4.conf.template /etc/nginx/templates/default.conf.template
COPY . /usr/share/sigm4/web
