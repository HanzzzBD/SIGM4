// Entrypoint HTTP sigm4-api (SDD-SYS-08). Satu basis kode, dua entrypoint —
// worker/index.ts adalah yang kedua, dan keduanya dibangun menjadi satu image
// (SDD-REPO-04, SDD-INF-01).
//
// Yang dibangun PR-00-09 adalah GERBANG bootstrap-nya: registri route divalidasi
// sebelum apa pun berjalan, dan dokumen OpenAPI diturunkan darinya. Perakitan
// server Express beserta rantai middleware SDD-06 §4.2 menyusul di PR-00-10
// (idempotensi) dan PR-00-15 (header keamanan, rate limit); route pertama yang
// benar-benar dilayani lahir di Phase 01.

import { RouteRegistry } from '../shared/http/index.js';

/**
 * Registri milik proses ini. Modul mendaftarkan route-nya lewat `registry.register`
 * saat dirakit — sampai Phase 01, ia sengaja kosong.
 */
export const registry = new RouteRegistry();

/**
 * Gerbang bootstrap (`PM-01`, `SDD-AUTH-01`). Dipanggil sebelum server menerima
 * trafik: route tanpa deklarasi permission menggagalkan startup, bukan diam-diam
 * terbuka.
 */
export function bootstrap(): RouteRegistry {
  return registry.validateOrThrow();
}
