// Acceptance PR-00-15 (sisi limit): "kelas limit terpisah aktif"
// (NFR-S-07, SDD-SEC-05, SDD-13 §4.3) — terhadap Redis NYATA.
//
// Sliding window hidup di skrip Lua; menirunya berarti menguji tiruan. Waktu
// dikendalikan FixedClock, sehingga pergeseran jendela diuji tanpa menunggu.

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Kysely } from "kysely";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import type { Database } from "../../src/shared/db/index.js";
import { RedisRateLimiter } from "../../src/shared/http/index.js";
import {
    HealthRegistry,
    Logger,
} from "../../src/shared/observability/index.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

// Uji berkas ini hanya memukul route kesehatan publik — pool palsu, tidak tersambung.
const dbPalsu = {} as unknown as Kysely<Database>;

describe.skipIf(!ADA_DB)("Rate limit terhadap Redis nyata", () => {
    // Penjaga lingkungan sebagai UJI, bukan beforeAll: prasyarat yang hilang
    // harus FAILED, bukan ter-skip diam-diam (templates/PULL-REQUEST.md).
    it("lingkungannya lengkap — REDIS_URL ada saat DATABASE_URL ada", () => {
        expect(
            process.env["REDIS_URL"],
            "REDIS_URL wajib diisi: SDD-SEC-05 menaruh rate limit di Redis.",
        ).toBeDefined();
    });

    const redis =
        process.env["REDIS_URL"] === undefined
            ? undefined
            : createRedis(readRedisConfig());
    const awal = new Date("2026-09-14T08:00:00Z");

    afterAll(async () => {
        const kunci = (await redis?.keys("sigm4:rl:*")) ?? [];
        if (kunci.length > 0) await redis?.del(...kunci);
        await redis?.quit();
    });

    async function siap() {
        if (redis === undefined) throw new Error("REDIS_URL wajib diisi.");
        if (redis.status !== "ready") {
            await new Promise((r) => redis.once("ready", r));
        }
        return redis;
    }

    /** IP unik per uji: kunci Redis tidak berbagi sisa antar-uji maupun antar-jalan. */
    const pemohon = () => ({
        userId: Number.parseInt(randomUUID().slice(0, 8), 16),
        ip: "203.0.113.7",
    });

    it("kelas limit TERPISAH: `chat` habis, `default` pemohon yang sama tetap lolos (acceptance)", async () => {
        const limiter = new RedisRateLimiter(
            await siap(),
            new FixedClock(awal),
        );
        const p = pemohon();

        for (let i = 0; i < 10; i++) {
            expect((await limiter.hit("chat", p)).lolos).toBe(true);
        }
        const kesebelas = await limiter.hit("chat", p);
        expect(kesebelas).toMatchObject({ lolos: false, batas: 10, sisa: 0 });

        expect(await limiter.hit("default", p)).toMatchObject({
            lolos: true,
            batas: 100,
            sisa: 99,
        });
    });

    it("jendela BERGESER: slot terlepas satu per satu, bukan sekaligus di pergantian jendela", async () => {
        const jam = new FixedClock(awal);
        const limiter = new RedisRateLimiter(await siap(), jam);
        const p = pemohon();

        for (let i = 0; i < 5; i++) await limiter.hit("chat", p); // t = 0 s
        jam.advance(30_000);
        for (let i = 0; i < 5; i++) await limiter.hit("chat", p); // t = 30 s
        expect((await limiter.hit("chat", p)).lolos).toBe(false);

        // t = 61 s: lima slot pertama keluar jendela, lima dari t = 30 s masih di dalam.
        jam.advance(31_000);
        for (let i = 0; i < 5; i++) {
            expect((await limiter.hit("chat", p)).lolos).toBe(true);
        }
        const penuh = await limiter.hit("chat", p);
        expect(penuh.lolos).toBe(false);
        // Slot tertua lahir di t = 30 s; terlepas di t = 90 s — 29 detik lagi.
        expect(penuh.resetDetik).toBe(29);
    });

    it("permintaan yang ditolak tidak memperpanjang hukuman", async () => {
        const jam = new FixedClock(awal);
        const limiter = new RedisRateLimiter(await siap(), jam);
        const p = pemohon();

        for (let i = 0; i < 10; i++) await limiter.hit("chat", p);
        for (let i = 0; i < 20; i++) await limiter.hit("chat", p);
        jam.advance(60_001);
        expect((await limiter.hit("chat", p)).lolos).toBe(true);
    });

    it("lewat HTTP: probe publik kelas `default` → permintaan ke-101 dari satu IP ditolak 429", async () => {
        const limiter = new RedisRateLimiter(
            await siap(),
            new FixedClock(awal),
        );
        const app = createApp({
            health: new HealthRegistry(),
            limiter,
            security: { objectStorageOrigin: "http://minio:9000" },
            logger: new Logger({
                clock: new FixedClock(awal),
                tulis: () => undefined,
            }),
            clock: new FixedClock(awal),
            db: dbPalsu,
        });
        const server = createServer(app);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1/health/live`;
        const ip = `198.51.100.${String(Number.parseInt(randomUUID().slice(0, 2), 16) % 250)}`;
        const panggil = () =>
            fetch(url, { headers: { "X-Forwarded-For": ip } });

        try {
            let terakhir: Response | undefined;
            for (let i = 0; i < 100; i++) {
                terakhir = await panggil();
                expect(terakhir.status).toBe(200);
            }
            expect(terakhir!.headers.get("x-ratelimit-remaining")).toBe("0");

            const ditolak = await panggil();
            expect(ditolak.status).toBe(429);
            expect(await ditolak.json()).toMatchObject({
                error: { code: "RATE_LIMIT_EXCEEDED" },
            });

            // IP lain tidak ikut tertahan — penghitung per pemohon.
            const lain = await fetch(url, {
                headers: { "X-Forwarded-For": "192.0.2.44" },
            });
            expect(lain.status).toBe(200);
        } finally {
            await new Promise((r) => server.close(r));
        }
    });
});
