// Probe kesehatan terhadap PostgreSQL dan Redis NYATA (SDD-15 §4.5).
//
// Unit test membuktikan aturan registri dengan pemeriksaan tiruan; berkas ini
// membuktikan bahwa `databaseCheck` dan `redisCheck` benar-benar menyentuh
// dependensinya — dan benar-benar menjawab down saat dependensinya tidak ada.

import { afterAll, describe, expect, it } from "vitest";
import { createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { createDb, readDatabaseConfig } from "../../src/shared/db/index.js";
import {
    HealthRegistry,
    databaseCheck,
    redisCheck,
} from "../../src/shared/observability/index.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

describe.skipIf(!ADA_DB)("Probe kesehatan terhadap dependensi nyata", () => {
    // Penjaga lingkungan sebagai UJI, bukan beforeAll: prasyarat yang hilang harus
    // FAILED, bukan ter-skip diam-diam (templates/PULL-REQUEST.md).
    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(
            process.env["REDIS_URL"],
            "REDIS_URL wajib diisi: readiness menuntut Redis (SDD-15 §4.5).",
        ).toBeDefined();
    });

    const db = createDb(readDatabaseConfig());
    const redis =
        process.env["REDIS_URL"] === undefined
            ? undefined
            : createRedis(readRedisConfig());
    // Port 1 tidak pernah didengarkan: Redis yang "mati" tanpa mematikan container.
    const redisMati = createRedis({ url: "redis://127.0.0.1:1" });
    redisMati.on("error", () => undefined);

    afterAll(async () => {
        await db.destroy();
        await redis?.quit();
        redisMati.disconnect();
    });

    it("database dan redis up, ready siap meski llm tidak terdaftar maupun mati", async () => {
        if (redis === undefined) throw new Error("REDIS_URL wajib diisi.");
        // enableOfflineQueue: false — perintah sebelum koneksi siap langsung
        // ditolak, jadi uji menunggu koneksinya lebih dulu.
        if (redis.status !== "ready") {
            await new Promise((r) => redis.once("ready", r));
        }
        const health = new HealthRegistry().register(
            databaseCheck(db),
            redisCheck(redis),
            {
                name: "llm",
                probe: () => Promise.reject(new Error("503 dari penyedia")),
            },
        );

        const r = await health.summary();
        expect(r.checks.database?.status).toBe("up");
        expect(r.checks.redis?.status).toBe("up");
        expect(r.checks.llm?.status).toBe("down");
        expect(r.status).toBe("degraded");
        expect(await health.readiness()).toBe(true);
    });

    it("redis tak terjangkau → down, ready TIDAK siap", async () => {
        const health = new HealthRegistry().register(
            databaseCheck(db),
            redisCheck(redisMati),
        );
        expect((await health.summary()).checks.redis?.status).toBe("down");
        expect(await health.readiness()).toBe(false);
    });
});
