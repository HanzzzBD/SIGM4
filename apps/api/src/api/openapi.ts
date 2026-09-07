// Generator OpenAPI (SDD-API-02, SDD-API-13).
//
// Digenerate dari kode, bukan ditulis tangan — `SDD-API-02` menyebutnya
// satu-satunya cara `NFR-M-05` ("dokumentasi selalu tersinkron") dapat dipenuhi.
// Sumbernya registri route yang sama dengan yang melayani permintaan, sehingga
// dokumen ini tidak dapat menggambarkan endpoint yang tidak ada.
//
// Berada di `api/`, bukan di `shared/http/`: hanya *entrypoint* yang menerbitkan
// dokumen, dan *shared kernel* tidak perlu tahu caranya (`SDD-SYS-12`).

import { createDocument } from 'zod-openapi';
import type { RouteDefinition, RouteRegistry } from '../shared/http/index.js';

/** Prefiks versi API (Bab 17.1). Path route sendiri ditulis tanpa awalan ini. */
const BASE_PATH = '/api/v1';

/** `:id` gaya Express → `{id}` gaya OpenAPI. */
function toOpenApiPath(path: string): string {
  return BASE_PATH + path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
}

/**
 * Respons galat yang berlaku bagi **setiap** route, diturunkan dari deklarasinya
 * sendiri. Ditulis di sini sekali alih-alih diulang pada tiap route: katalog
 * kode galat sudah dimiliki Bab 17.3, dan mengulangnya per route akan menjadi
 * salinan kedua yang menyimpang.
 */
function errorResponses(route: RouteDefinition): Record<string, { description: string }> {
  const responses: Record<string, { description: string }> = {
    '400': { description: 'INVALID_REQUEST — skema masukan tidak terpenuhi' },
    '429': { description: 'RATE_LIMIT_EXCEEDED' },
    '500': { description: 'INTERNAL_ERROR' },
  };
  if (route.public !== true) {
    responses['401'] = { description: 'UNAUTHENTICATED / TOKEN_EXPIRED' };
    responses['403'] = { description: 'FORBIDDEN / INSUFFICIENT_PERMISSION' };
  }
  if (route.idempotent === true) {
    responses['409'] = { description: 'IDEMPOTENCY_KEY_REUSED / REQUEST_IN_PROGRESS' };
  }
  return responses;
}

export interface OpenApiOptions {
  readonly version: string;
}

/**
 * Membangun dokumen OpenAPI dari registri.
 *
 * Registri divalidasi lebih dulu: dokumen yang menggambarkan route tanpa
 * permission akan mengiklankan endpoint yang seharusnya tidak pernah berjalan.
 */
export function buildOpenApiDocument(
  registry: RouteRegistry,
  options: OpenApiOptions,
): ReturnType<typeof createDocument> {
  registry.validateOrThrow();

  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of registry.all()) {
    const path = toOpenApiPath(route.path);
    const operation: Record<string, unknown> = {
      summary: route.summary ?? `${route.method} ${route.path}`,
      tags: [route.module],
      // Permission dibawa sebagai ekstensi, bukan dibuang: `SEC-T-01` menurunkan
      // matriks ujinya dari registri, dan pembaca dokumen berhak tahu hak apa
      // yang dituntut sebuah endpoint.
      'x-permission': route.public === true ? null : route.permission,
      'x-rate-limit-class': route.rateLimitClass,
      responses: {
        [route.method === 'POST' ? '201' : '200']: {
          description: 'Berhasil',
          content: { 'application/json': { schema: route.response } },
        },
        ...errorResponses(route),
      },
    };
    if (route.params !== undefined) operation['requestParams'] = { path: route.params };
    if (route.body !== undefined) {
      operation['requestBody'] = { content: { 'application/json': { schema: route.body } } };
    }
    paths[path] = { ...paths[path], [route.method.toLowerCase()]: operation };
  }

  return createDocument({
    openapi: '3.1.0',
    info: { title: 'SIGM4 API', version: options.version },
    paths: paths as never,
  });
}
