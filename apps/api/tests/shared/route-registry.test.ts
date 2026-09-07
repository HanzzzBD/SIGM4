// Acceptance PR-00-09: "Route tanpa deklarasi permission menggagalkan bootstrap"
// (PM-01, SDD-AUTH-01, SDD-API-03).
//
// Dua lapis diuji terpisah, karena keduanya menjaga hal yang sama dari arah
// berbeda: tipe `RouteDefinition` menolaknya saat KOMPILASI, dan `validateOrThrow`
// menolaknya saat RUNTIME. Lapis kedua ada karena TypeScript dapat ditembus satu
// `as unknown as` di berkas mana pun, dan PM-01 terlalu mahal untuk dijaga satu lapis.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  RouteRegistrationError,
  RouteRegistry,
  defineRoute,
  routeKey,
} from '../../src/shared/http/index.js';
import type { RouteDefinition } from '../../src/shared/http/index.js';

const OkSchema = z.object({ ok: z.boolean() });

const routeSah = defineRoute({
  method: 'GET',
  path: '/assets/:id',
  permission: 'asset.view',
  rateLimitClass: 'read',
  module: 'm04-assets',
  params: z.object({ id: z.coerce.number().int().positive() }),
  response: OkSchema,
});

const routePublik = defineRoute({
  method: 'POST',
  path: '/auth/login',
  public: true,
  rateLimitClass: 'auth',
  module: 'm01-auth',
  body: z.object({ email: z.string(), password: z.string() }),
  response: OkSchema,
});

// ---------------------------------------------------------------------------
// Lapis 1 — gerbang KOMPILASI. Berkas ini di-typecheck sebelum Vitest berjalan,
// sehingga @ts-expect-error yang tidak terpakai membuat `npm test` merah.
// ---------------------------------------------------------------------------

// @ts-expect-error — tanpa `permission` maupun `public` (PM-01)
defineRoute({
  method: 'GET',
  path: '/assets',
  rateLimitClass: 'read',
  module: 'm04-assets',
  response: OkSchema,
});

defineRoute({
  method: 'GET',
  path: '/assets',
  permission: 'asset.view',
  // @ts-expect-error — `permission` dan `public` saling meniadakan
  public: true,
  rateLimitClass: 'read',
  module: 'm04-assets',
  response: OkSchema,
});

// @ts-expect-error — tanpa `response` (SDD-API-01)
defineRoute({
  method: 'GET',
  path: '/assets',
  permission: 'asset.view',
  rateLimitClass: 'read',
  module: 'm04-assets',
});

// @ts-expect-error — tanpa `rateLimitClass` (NFR-S-07)
defineRoute({
  method: 'GET',
  path: '/assets',
  permission: 'asset.view',
  module: 'm04-assets',
  response: OkSchema,
});

// ---------------------------------------------------------------------------
// Lapis 2 — gerbang RUNTIME.
// ---------------------------------------------------------------------------

/** Menembus tipe seperti yang akan dilakukan `as unknown as` di kode sungguhan. */
function routeCacat(patch: Record<string, unknown>): RouteDefinition {
  return {
    method: 'GET',
    path: '/assets',
    rateLimitClass: 'read',
    module: 'm04-assets',
    response: OkSchema,
    ...patch,
  } as unknown as RouteDefinition;
}

describe('RouteRegistry — pendaftaran', () => {
  it('menerima route yang lengkap', () => {
    const r = new RouteRegistry().register(routeSah, routePublik);
    expect(r.all()).toHaveLength(2);
    expect(() => r.validateOrThrow()).not.toThrow();
  });

  it('menolak path yang didaftarkan dua kali', () => {
    expect(() => new RouteRegistry().register(routeSah, routeSah)).toThrow(RouteRegistrationError);
  });

  it('membedakan method pada path yang sama', () => {
    const r = new RouteRegistry().register(
      routeSah,
      defineRoute({ ...routeSah, method: 'DELETE', permission: 'asset.deactivate' }),
    );
    expect(r.all()).toHaveLength(2);
  });

  it('routeKey menggabungkan method dan path', () => {
    expect(routeKey(routeSah)).toBe('GET /assets/:id');
  });
});

describe('validateOrThrow — gerbang bootstrap (PM-01)', () => {
  it('MENGGAGALKAN bootstrap bagi route tanpa permission dan tanpa public', () => {
    const r = new RouteRegistry().register(routeCacat({}));
    expect(() => r.validateOrThrow()).toThrow(/tanpa deklarasi permission/);
  });

  it('pesannya menyebut route mana yang bersalah, bukan sekadar "ada yang salah"', () => {
    const r = new RouteRegistry().register(routeCacat({}));
    expect(() => r.validateOrThrow()).toThrow(/GET \/assets/);
  });

  it('menolak permission kosong — string kosong bukan deklarasi', () => {
    const r = new RouteRegistry().register(routeCacat({ permission: '   ' }));
    expect(() => r.validateOrThrow()).toThrow(/permission kosong/);
  });

  it('menolak permission sekaligus public', () => {
    const r = new RouteRegistry().register(routeCacat({ permission: 'asset.view', public: true }));
    expect(() => r.validateOrThrow()).toThrow(/hanya satu yang boleh/);
  });

  it('menolak route tanpa skema response', () => {
    const r = new RouteRegistry().register(
      routeCacat({ permission: 'asset.view', response: undefined }),
    );
    expect(() => r.validateOrThrow()).toThrow(/tanpa skema `response`/);
  });

  it('menolak route tanpa rateLimitClass', () => {
    const r = new RouteRegistry().register(
      routeCacat({ permission: 'asset.view', rateLimitClass: undefined }),
    );
    expect(() => r.validateOrThrow()).toThrow(/rateLimitClass/);
  });

  it('menolak path tanpa awalan garis miring', () => {
    const r = new RouteRegistry().register(
      routeCacat({ permission: 'asset.view', path: 'assets' }),
    );
    expect(() => r.validateOrThrow()).toThrow(/diawali/);
  });

  it('melaporkan SELURUH temuan sekaligus, bukan berhenti di yang pertama', () => {
    const r = new RouteRegistry().register(
      routeCacat({ path: '/a' }),
      routeCacat({ path: '/b' }),
      routeCacat({ path: '/c', permission: 'asset.view', rateLimitClass: undefined }),
    );
    expect(r.violations()).toHaveLength(3);
    expect(() => r.validateOrThrow()).toThrow(/3 route tidak lengkap/);
  });

  it('registri kosong lolos — belum ada route bukan pelanggaran', () => {
    expect(() => new RouteRegistry().validateOrThrow()).not.toThrow();
  });
});

describe('registri sebagai sumber tunggal (SDD-API-13)', () => {
  const registry = new RouteRegistry().register(routeSah, routePublik);

  it('memisahkan route ber-permission dari route publik', () => {
    expect(registry.guarded().map(routeKey)).toEqual(['GET /assets/:id']);
    expect(registry.publicRoutes().map(routeKey)).toEqual(['POST /auth/login']);
  });

  it('menurunkan daftar permission — sumber matriks uji otorisasi SEC-T-01', () => {
    expect([...registry.permissions()]).toEqual(['asset.view']);
  });

  it('daftar endpoint publik cukup pendek untuk ditinjau sekali baca (SDD-AUTH-01 §4.1)', () => {
    expect(registry.publicRoutes().every((r) => r.public === true)).toBe(true);
  });
});
