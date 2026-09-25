// Kelas `login` terhadap Redis NYATA: hanya percobaan gagal yang mengurangi
// jatah IP (NFR-S-07, SDD-SESS-07, SDD-13 §4.3 — keputusan pemilik produk,
// 15 September 2026).

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, describe, expect, it } from "vitest";
import { rateLimit } from "../../src/api/security.js";
import { createRedis, readRedisConfig } from "../../src/shared/cache/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { RedisRateLimiter } from "../../src/shared/http/index.js";
import { Logger } from "../../src/shared/observability/index.js";

const ADA_DB = process.env["DATABASE_URL"] !== undefined;

describe.skipIf(!ADA_DB)("Kelas login terhadap Redis nyata", () => {
    // Penjaga lingkungan sebagai UJI, bukan beforeAll (templates/PULL-REQUEST.md).
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
    const awal = new Date("2026-09-15T08:00:00Z");

    afterAll(async () => {
        const kunci = (await redis?.keys("sigm4:rl:login:*")) ?? [];
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

    const ipUnik = () =>
        `198.51.100.${String(Number.parseInt(randomUUID().slice(0, 2), 16) % 250)}:${randomUUID().slice(0, 6)}`;

    it("`periksa` tidak mencatat; `catat` mencatat meski jatah sudah habis", async () => {
        const limiter = new RedisRateLimiter(
            await siap(),
            new FixedClock(awal),
        );
        const p = { ip: ipUnik() };

        for (let i = 0; i < 10; i++) {
            expect(await limiter.hit("login", p, "periksa")).toMatchObject({
                lolos: true,
                sisa: 5,
            });
        }
        for (let i = 0; i < 5; i++) await limiter.hit("login", p, "catat");
        expect(await limiter.hit("login", p, "periksa")).toMatchObject({
            lolos: false,
            sisa: 0,
        });
    });

    it("lewat HTTP: 20 login berhasil dari satu IP tetap lolos; 5 gagal menutupnya", async () => {
        const limiter = new RedisRateLimiter(
            await siap(),
            new FixedClock(awal),
        );
        const app = express();
        app.set("trust proxy", 1);
        app.post(
            "/auth/login",
            rateLimit(
                { rateLimitClass: "login" },
                limiter,
                new Logger({
                    clock: new FixedClock(awal),
                    tulis: () => undefined,
                }),
            ),
            (req, res) => {
                const benar = req.headers["x-sandi"] === "benar";
                res.status(benar ? 200 : 401).json({ ok: benar });
            },
        );
        const server = createServer(app);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/auth/login`;
        const ip = ipUnik();
        const masuk = (sandi: string) =>
            fetch(url, {
                method: "POST",
                headers: { "X-Forwarded-For": ip, "X-Sandi": sandi },
            });
        const giliran = () => new Promise((r) => setTimeout(r, 30));

        try {
            // Satu jaringan sekolah di balik satu IP publik (NAT).
            for (let i = 0; i < 20; i++) {
                expect((await masuk("benar")).status).toBe(200);
            }
            for (let i = 0; i < 5; i++) {
                expect((await masuk("salah")).status).toBe(401);
                await giliran();
            }
            const tertutup = await masuk("benar");
            expect(tertutup.status).toBe(429);
            expect(tertutup.headers.get("x-ratelimit-remaining")).toBe("0");
        } finally {
            await new Promise((r) => server.close(r));
        }
    });
});
