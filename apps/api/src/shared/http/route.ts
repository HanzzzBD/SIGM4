// Deklarasi route (SDD-API-03, SDD-AUTH-01, SDD-SYS-12).
//
// Satu deklarasi, tiga keluaran: pemeriksaan kelengkapan saat bootstrap (PM-01),
// dokumen OpenAPI (SDD-API-02), dan matriks uji otorisasi (SEC-T-01). Ketiganya
// diturunkan dari registri yang sama — itulah sebabnya `SDD-API-13` menolak
// generator OpenAPI yang menuntut daftar route-nya sendiri.

import type { ZodType } from 'zod';

/** Kelas rate limit (`NFR-S-07`). Kelasnya sendiri disetel `PR-00-15`. */
export type RateLimitClass = 'auth' | 'write' | 'read' | 'export' | 'chat';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Route yang menuntut permission. `permission` **wajib** dan tidak punya nilai
 * bawaan: `PM-01` menuntut setiap endpoint memetakan tepat satu permission, dan
 * bawaan apa pun akan membuat kelalaian lolos diam-diam.
 */
interface GuardedRoute {
  readonly permission: string;
  readonly public?: never;
}

/**
 * Route publik. Ia menandai dirinya `public: true` secara **eksplisit** sehingga
 * daftar endpoint tanpa autentikasi dapat ditinjau sebagai satu daftar pendek
 * (`SDD-AUTH-01 §4.1`) — bukan sebagai ketiadaan yang harus dicari.
 */
interface PublicRoute {
  readonly public: true;
  readonly permission?: never;
}

interface RouteBase {
  readonly method: HttpMethod;
  /** Path relatif tanpa awalan `/api/v1` — awalannya milik perakit server. */
  readonly path: string;
  readonly rateLimitClass: RateLimitClass;
  /** Skema parameter path/query. `SDD-API-01`: Zod adalah satu-satunya definisi. */
  readonly params?: ZodType;
  readonly body?: ZodType;
  readonly response: ZodType;
  /** `ID-01`: route tulis yang menuntut `Idempotency-Key`. Middleware-nya `PR-00-10`. */
  readonly idempotent?: boolean;
  readonly summary?: string;
  /** Modul pemilik, mis. `m07-reservation-room` — mengisi tag OpenAPI. */
  readonly module: string;
}

export type RouteDefinition = RouteBase & (GuardedRoute | PublicRoute);

/**
 * Mendeklarasikan satu route. Fungsi ini tidak melakukan apa pun selain
 * mengembalikan argumennya dengan tipe yang menyempit — nilainya ada pada
 * tipe itu: `permission` dan `public` saling meniadakan, sehingga route yang
 * tidak menyebut salah satunya **gagal dikompilasi**, dan route yang menyebut
 * keduanya juga gagal.
 *
 * Pemeriksaan runtime tetap ada di registri: TypeScript dapat ditembus `as`,
 * dan `PM-01` terlalu mahal untuk dijaga satu lapis saja.
 */
export function defineRoute<T extends RouteDefinition>(route: T): T {
  return route;
}

/** Kunci unik sebuah route pada registri. */
export function routeKey(route: Pick<RouteDefinition, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}
