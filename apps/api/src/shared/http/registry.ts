// Registri route (SDD-API-13, SDD-SYS-12).
//
// Satu-satunya daftar route yang ada. `SDD-API-13` menyebut konsekuensinya:
// OpenAPI (SDD-API-02) DAN matriks uji otorisasi (SEC-T-01) sama-sama diturunkan
// dari sini, sehingga keduanya tidak dapat menyimpang dari route yang benar-benar
// dilayani.

import type { RouteDefinition } from './route.js';
import { routeKey } from './route.js';

export class RouteRegistrationError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = 'RouteRegistrationError';
  }
}

/** Satu temuan pemeriksaan bootstrap. */
export interface RouteViolation {
  readonly route: string;
  readonly reason: string;
}

/**
 * Memeriksa kelengkapan deklarasi sebuah route (`SDD-API-03`).
 *
 * Dilakukan di runtime meski tipe `RouteDefinition` sudah menuntutnya: `PM-01`
 * adalah gerbang keamanan, dan gerbang keamanan yang hanya dijaga kompilator
 * dapat ditembus satu `as unknown as` di berkas mana pun.
 */
function inspect(route: RouteDefinition): string[] {
  const alasan: string[] = [];
  const permission = (route as { permission?: unknown }).permission;
  const publik = (route as { public?: unknown }).public;

  if (permission === undefined && publik !== true) {
    // Bunyi pesan ini disengaja: ia menyebut apa yang kurang DAN aturannya,
    // karena yang membacanya adalah orang yang baru saja menambah route.
    alasan.push('tanpa deklarasi permission dan tanpa `public: true` (PM-01, SDD-AUTH-01)');
  }
  if (permission !== undefined && publik === true) {
    alasan.push('menyatakan permission sekaligus `public: true` — hanya satu yang boleh');
  }
  if (typeof permission === 'string' && permission.trim() === '') {
    alasan.push('permission kosong');
  }
  if (route.response === undefined) {
    alasan.push('tanpa skema `response` (SDD-API-01)');
  }
  if (route.rateLimitClass === undefined) {
    alasan.push('tanpa `rateLimitClass` (NFR-S-07)');
  }
  if (!route.path.startsWith('/')) {
    alasan.push(`path \`${route.path}\` harus diawali "/"`);
  }
  return alasan;
}

export class RouteRegistry {
  private readonly routes = new Map<string, RouteDefinition>();

  /** Mendaftarkan route. Duplikat ditolak di titik pendaftaran, bukan saat bootstrap. */
  register(...routes: readonly RouteDefinition[]): this {
    for (const route of routes) {
      const kunci = routeKey(route);
      if (this.routes.has(kunci)) {
        throw new RouteRegistrationError(
          `Route ${kunci} didaftarkan dua kali — satu path milik tepat satu modul.`,
        );
      }
      this.routes.set(kunci, route);
    }
    return this;
  }

  all(): readonly RouteDefinition[] {
    return [...this.routes.values()];
  }

  /** Route yang menuntut permission — sumber matriks uji otorisasi (`SEC-T-01`). */
  guarded(): readonly (RouteDefinition & { permission: string })[] {
    return this.all().filter(
      (r): r is RouteDefinition & { permission: string } => typeof r.permission === 'string',
    );
  }

  /**
   * Daftar endpoint tanpa autentikasi. `SDD-AUTH-01 §4.1` menuntutnya dapat
   * ditinjau sebagai satu daftar pendek — di sinilah daftar itu.
   */
  publicRoutes(): readonly RouteDefinition[] {
    return this.all().filter((r) => r.public === true);
  }

  /** Seluruh permission yang dirujuk route — dibandingkan Lampiran C oleh uji. */
  permissions(): ReadonlySet<string> {
    return new Set(this.guarded().map((r) => r.permission));
  }

  /** Temuan tanpa melempar — dipakai uji dan pesan diagnostik. */
  violations(): readonly RouteViolation[] {
    return this.all().flatMap((route) =>
      inspect(route).map((reason) => ({ route: routeKey(route), reason })),
    );
  }

  /**
   * Pemeriksaan saat *bootstrap*. Melempar bila ada satu saja route yang tidak
   * lengkap — aplikasi menolak berjalan, bukan berjalan dengan endpoint terbuka.
   *
   * Inilah acceptance `PR-00-09`: kelalaian menjadi mustahil, bukan sekadar
   * tidak disarankan (`SDD-AUTH-01 §3`).
   */
  validateOrThrow(): this {
    const temuan = this.violations();
    if (temuan.length > 0) {
      const rincian = temuan.map((t) => `  - ${t.route}: ${t.reason}`).join('\n');
      throw new RouteRegistrationError(
        `Bootstrap dibatalkan — ${temuan.length} route tidak lengkap:\n${rincian}`,
      );
    }
    return this;
  }
}
