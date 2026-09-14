// Entrypoint HTTP sigm4-api (SDD-SYS-08). Satu basis kode, dua entrypoint —
// worker/index.ts adalah yang kedua, dan keduanya dibangun menjadi satu image
// (SDD-REPO-04, SDD-INF-01).
//
// Yang dibangun PR-00-09 adalah GERBANG bootstrap-nya: registri route divalidasi
// sebelum apa pun berjalan, dan dokumen OpenAPI diturunkan darinya. PR-00-14
// merakit server Express minimal agar kedua probe kesehatan dapat dipanggil;
// rantai middleware SDD-06 §4.2 menyusul di PR-00-15 (header keamanan, rate
// limit) dan PR-02-09 (permission).

import { pathToFileURL } from "node:url";
import express from "express";
import type { Express } from "express";
import { getRedis } from "../shared/cache/index.js";
import { getDb } from "../shared/db/index.js";
import { RouteRegistry } from "../shared/http/index.js";
import {
    HealthRegistry,
    databaseCheck,
    redisCheck,
} from "../shared/observability/index.js";
import { healthLiveRoute, healthReadyRoute, healthRouter } from "./health.js";
import { BASE_PATH } from "./openapi.js";

/** Port container — `EXPOSE 3000` pada Dockerfile (SDD-16 §4.1). */
const PORT = 3000;

/**
 * Registri milik proses ini. Hanya route yang benar-benar dipasang yang
 * didaftarkan, agar OpenAPI tidak mengiklankan endpoint yang tidak dilayani.
 */
export const registry = new RouteRegistry().register(
    healthLiveRoute,
    healthReadyRoute,
);

/**
 * Gerbang bootstrap (`PM-01`, `SDD-AUTH-01`). Dipanggil sebelum server menerima
 * trafik: route tanpa deklarasi permission menggagalkan startup, bukan diam-diam
 * terbuka.
 */
export function bootstrap(): RouteRegistry {
    return registry.validateOrThrow();
}

/** Merakit aplikasi tanpa membuka port — dipakai proses dan uji. */
export function createApp(health: HealthRegistry): Express {
    bootstrap();
    const app = express();
    app.use(BASE_PATH, healthRouter(health));
    return app;
}

export function start(): void {
    const health = new HealthRegistry().register(
        databaseCheck(getDb()),
        redisCheck(getRedis()),
    );
    createApp(health).listen(PORT);
}

// Hanya bila berkas ini dijalankan sebagai proses (CMD Dockerfile), bukan saat diimpor.
if (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    start();
}
