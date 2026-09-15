// Entrypoint HTTP sigm4-api (SDD-SYS-08). Satu basis kode, dua entrypoint —
// worker/index.ts adalah yang kedua, dan keduanya dibangun menjadi satu image
// (SDD-REPO-04, SDD-INF-01).
//
// Yang dibangun PR-00-09 adalah GERBANG bootstrap-nya: registri route divalidasi
// sebelum apa pun berjalan, dan dokumen OpenAPI diturunkan darinya. PR-00-14
// merakit server Express minimal agar kedua probe kesehatan dapat dipanggil;
// PR-00-15 memasang dari rantai SDD-06 §4.2: `requestId`, header keamanan, rate
// limit, 404, dan `errorMapper`. Autentikasi dan permission menyusul di Phase 02.

import { pathToFileURL } from "node:url";
import express from "express";
import type { Express } from "express";
import { getRedis } from "../shared/cache/index.js";
import { SystemClock } from "../shared/clock/index.js";
import { readApiConfig, zonaProses } from "../shared/config/index.js";
import { getDb } from "../shared/db/index.js";
import { RedisRateLimiter, RouteRegistry } from "../shared/http/index.js";
import type { RateLimiter } from "../shared/http/index.js";
import {
    HealthRegistry,
    Logger,
    databaseCheck,
    redisCheck,
} from "../shared/observability/index.js";
import { healthLiveRoute, healthReadyRoute, healthRouter } from "./health.js";
import { BASE_PATH } from "./openapi.js";
import { awalRantai, ujungRantai } from "./chain.js";
import { rateLimit } from "./security.js";
import type { SecurityConfig } from "./security.js";

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

export interface AppDeps {
    readonly health: HealthRegistry;
    readonly limiter: RateLimiter;
    readonly security: SecurityConfig;
    readonly logger: Logger;
}

/** Merakit aplikasi tanpa membuka port — dipakai proses dan uji. */
export function createApp(deps: AppDeps): Express {
    bootstrap();
    const app = express();
    // Satu hop: trafik produksi masuk lewat Nginx (SDD-16 §4.2), sehingga `req.ip`
    // adalah IP klien — kunci rate limit bagi permintaan tanpa pengguna.
    app.set("trust proxy", 1);
    app.use(awalRantai(deps));
    app.use(
        BASE_PATH,
        healthRouter(deps.health, (route) =>
            rateLimit(route, deps.limiter, deps.logger),
        ),
    );
    app.use(ujungRantai(deps));
    return app;
}

export function start(
    env: NodeJS.ProcessEnv = process.env,
    zona: string = zonaProses(),
): void {
    // Konfigurasi divalidasi sebelum koneksi apa pun dibuka: proses menolak menyala
    // dengan konfigurasi tidak valid atau zona waktu bukan UTC (SDD-INF-08/09).
    const config = readApiConfig(env, zona);
    const clock = new SystemClock();
    const health = new HealthRegistry().register(
        databaseCheck(getDb()),
        redisCheck(getRedis()),
    );
    createApp({
        health,
        limiter: new RedisRateLimiter(getRedis(), clock),
        security: { objectStorageOrigin: config.objectStoragePublicOrigin },
        logger: new Logger({
            clock,
            modulBawaan: "api",
            level: config.logLevel,
        }),
    }).listen(PORT);
}

// Hanya bila berkas ini dijalankan sebagai proses (CMD Dockerfile), bukan saat diimpor.
if (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    start();
}
