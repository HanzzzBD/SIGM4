// Rate limit berjenjang tanpa Redis (NFR-S-07, SDD-SEC-05, SDD-13 §4.3):
// tabel kelas terhadap berkas SDD, kunci penghitung, dan perilaku middleware.
// Sliding window terhadap Redis nyata ada di tests/integration/rate-limit.test.ts.

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { rateLimit } from "../../src/api/security.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import { KELAS_LIMIT, kunciLimit } from "../../src/shared/http/index.js";
import type {
    HasilLimit,
    Pemohon,
    RateLimitClass,
    RateLimiter,
} from "../../src/shared/http/index.js";
import { Logger } from "../../src/shared/observability/index.js";
import { AKAR } from "../helpers/bab113.js";

describe("KELAS_LIMIT terhadap tabel SDD-13 §4.3", () => {
    // Dibaca dari berkas SDD saat uji berjalan — mengubah angka di salah satu
    // sisi saja langsung merah.
    const bagian = readFileSync(
        new URL("docs/SDD/13-security-design.md", AKAR),
        "utf8",
    )
        .split("### 4.3 Rate limiting")[1]!
        .split("### 4.4")[0]!;
    const SATUAN = { menit: 60_000, jam: 3_600_000 } as const;
    const dariSdd = new Map(
        [
            ...bagian.matchAll(
                /^\| `([a-z-]+)` \| (\d+)\/(?:(\d+) )?(menit|jam) \| ([^|]+) \|/gm,
            ),
        ].map((m) => [
            m[1]!,
            {
                batas: Number(m[2]),
                jendelaMs:
                    Number(m[3] ?? 1) * SATUAN[m[4] as keyof typeof SATUAN],
                kunci: m[5]!.includes("user") ? "user" : "ip",
            },
        ]),
    );

    it("membaca tujuh kelas dari SDD, bukan dari daftar di dalam uji ini", () => {
        expect(dariSdd.size).toBe(7);
    });

    it("nama kelas identik di kedua sisi", () => {
        expect(Object.keys(KELAS_LIMIT).sort()).toEqual(
            [...dariSdd.keys()].sort(),
        );
    });

    it("batas, jendela, dan sumbu kunci identik dengan SDD", () => {
        for (const [kelas, sdd] of dariSdd) {
            const { batas, jendelaMs, kunci } =
                KELAS_LIMIT[kelas as RateLimitClass];
            expect({ kelas, batas, jendelaMs, kunci }).toEqual({
                kelas,
                ...sdd,
            });
        }
    });

    it("hanya `login` yang fail closed (SDD-13 §4.3)", () => {
        const tertutup = Object.entries(KELAS_LIMIT)
            .filter(([, k]) => k.gagalTertutup)
            .map(([n]) => n);
        expect(tertutup).toEqual(["login"]);
    });
});

describe("kunciLimit", () => {
    it("kelas berkunci pengguna memakai userId bila terautentikasi", () => {
        expect(kunciLimit("default", { userId: 7, ip: "203.0.113.7" })).toBe(
            "sigm4:rl:default:u:7",
        );
    });

    it("jatuh ke IP bila belum terautentikasi (keputusan pemilik produk)", () => {
        expect(kunciLimit("default", { ip: "203.0.113.7" })).toBe(
            "sigm4:rl:default:ip:203.0.113.7",
        );
    });

    it("kelas berkunci IP tetap memakai IP meski pengguna dikenal", () => {
        expect(kunciLimit("login", { userId: 7, ip: "203.0.113.7" })).toBe(
            "sigm4:rl:login:ip:203.0.113.7",
        );
    });

    it("pemohon yang sama punya penghitung terpisah per kelas", () => {
        const p = { userId: 7, ip: "203.0.113.7" };
        expect(kunciLimit("chat", p)).not.toBe(kunciLimit("default", p));
    });
});

describe("middleware rateLimit", () => {
    const terbuka: Server[] = [];
    afterEach(async () => {
        await Promise.all(
            terbuka.splice(0).map((s) => new Promise((r) => s.close(r))),
        );
    });

    function logger(entri: string[]): Logger {
        return new Logger({
            clock: new FixedClock(new Date("2026-09-14T00:00:00Z")),
            tulis: (baris) => entri.push(baris),
        });
    }

    async function buka(
        kelas: RateLimitClass,
        limiter: RateLimiter,
        entri: string[] = [],
    ): Promise<string> {
        const app = express();
        app.set("trust proxy", 1);
        app.get(
            "/x",
            rateLimit({ rateLimitClass: kelas }, limiter, logger(entri)),
            (_req, res) => {
                res.json({ ok: true });
            },
        );
        const server = createServer(app);
        terbuka.push(server);
        await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
        return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/x`;
    }

    const hasil = (lolos: boolean): HasilLimit => ({
        lolos,
        batas: 10,
        sisa: lolos ? 4 : 0,
        resetDetik: 42,
    });

    it("lolos → handler berjalan dengan header X-RateLimit-* (NFR-S-07)", async () => {
        const res = await fetch(
            await buka("chat", { hit: () => Promise.resolve(hasil(true)) }),
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("x-ratelimit-limit")).toBe("10");
        expect(res.headers.get("x-ratelimit-remaining")).toBe("4");
        expect(res.headers.get("x-ratelimit-reset")).toBe("42");
    });

    it("ditolak → 429 RATE_LIMIT_EXCEEDED dengan Retry-After, handler tidak berjalan", async () => {
        const res = await fetch(
            await buka("chat", { hit: () => Promise.resolve(hasil(false)) }),
        );
        expect(res.status).toBe(429);
        expect(res.headers.get("retry-after")).toBe("42");
        expect(await res.json()).toEqual({
            success: false,
            error: {
                code: "RATE_LIMIT_EXCEEDED",
                message:
                    "Terlalu banyak permintaan. Coba lagi beberapa saat lagi.",
            },
            request_id: expect.stringMatching(/^req_/),
        });
    });

    it("meneruskan kelas deklarasi route dan IP klien dari X-Forwarded-For", async () => {
        const dipanggil: [RateLimitClass, Pemohon][] = [];
        const url = await buka("public-asset", {
            hit: (kelas, pemohon) => {
                dipanggil.push([kelas, pemohon]);
                return Promise.resolve(hasil(true));
            },
        });
        await fetch(url, { headers: { "X-Forwarded-For": "203.0.113.7" } });
        expect(dipanggil).toEqual([["public-asset", { ip: "203.0.113.7" }]]);
    });

    it("Redis mati pada kelas `default` → fail open DENGAN alarm", async () => {
        const entri: string[] = [];
        const res = await fetch(
            await buka(
                "default",
                {
                    hit: () =>
                        Promise.reject(new Error("Connection is closed.")),
                },
                entri,
            ),
        );
        expect(res.status).toBe(200);
        expect(entri).toHaveLength(1);
        expect(JSON.parse(entri[0]!)).toMatchObject({
            level: "error",
            kelas: "default",
            gagal_tertutup: false,
        });
    });

    it("Redis mati pada kelas `login` → fail closed, 429", async () => {
        const entri: string[] = [];
        const res = await fetch(
            await buka(
                "login",
                {
                    hit: () =>
                        Promise.reject(new Error("Connection is closed.")),
                },
                entri,
            ),
        );
        expect(res.status).toBe(429);
        expect(entri).toHaveLength(1);
    });
});
