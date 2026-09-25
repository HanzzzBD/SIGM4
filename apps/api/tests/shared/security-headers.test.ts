// Acceptance PR-00-15 (sisi header): "CSP tanpa `unsafe-inline`"
// (NFR-S-11, SDD-SEC-03, SDD-SEC-04, SDD-13 §4.2).
//
// Diuji lewat aplikasi yang dirakit `createApp`, pada port acak — yang dilihat
// peramban dan pemindai DAST, bukan konfigurasi helmet.

import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/api/index.js";
import { authPalsu } from "../helpers/auth.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import type { Database } from "../../src/shared/db/index.js";
import {
    HealthRegistry,
    Logger,
} from "../../src/shared/observability/index.js";

// Uji berkas ini tidak pernah memanggil route M-02 — pool palsu, tidak tersambung.
const dbPalsu = {} as unknown as Kysely<Database>;

const terbuka: Server[] = [];
afterEach(async () => {
    await Promise.all(
        terbuka.splice(0).map((s) => new Promise((r) => s.close(r))),
    );
});

async function ambil(path = "/api/v1/health/live"): Promise<Response> {
    const app = createApp({
        health: new HealthRegistry(),
        limiter: {
            hit: () =>
                Promise.resolve({
                    lolos: true,
                    batas: 100,
                    sisa: 99,
                    resetDetik: 60,
                }),
        },
        security: { objectStorageOrigin: "https://storage.sekolah.example" },
        logger: new Logger({
            clock: new FixedClock(new Date("2026-09-14T00:00:00Z")),
            tulis: () => undefined,
        }),
        clock: new FixedClock(new Date("2026-09-14T00:00:00Z")),
        db: dbPalsu,
        auth: authPalsu(),
    });
    const server = createServer(app);
    terbuka.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return fetch(
        `http://127.0.0.1:${String((server.address() as AddressInfo).port)}${path}`,
    );
}

function direktif(csp: string): Map<string, string> {
    return new Map(
        csp.split(";").map((d) => {
            const [nama, ...nilai] = d.trim().split(/\s+/);
            return [nama!, nilai.join(" ")];
        }),
    );
}

describe("Content-Security-Policy (SDD-SEC-04)", () => {
    it("tidak pernah memuat unsafe-inline maupun unsafe-eval", async () => {
        const csp = (await ambil()).headers.get("content-security-policy")!;
        expect(csp).toBeTruthy();
        expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    });

    it("skrip dan gaya memakai nonce yang sama di dalam satu respons", async () => {
        const d = direktif(
            (await ambil()).headers.get("content-security-policy")!,
        );
        const nonce = /'nonce-([A-Za-z0-9+/=]+)'/.exec(
            d.get("script-src")!,
        )?.[1];
        expect(nonce).toBeDefined();
        expect(d.get("style-src")).toBe(`'self' 'nonce-${nonce!}'`);
    });

    it("nonce dibangkitkan ulang setiap permintaan", async () => {
        const [a, b] = await Promise.all([ambil(), ambil()]);
        expect(a.headers.get("content-security-policy")).not.toBe(
            b.headers.get("content-security-policy"),
        );
    });

    it("kebijakan persis SDD-13 §4.2", async () => {
        const d = direktif(
            (await ambil()).headers.get("content-security-policy")!,
        );
        expect(d.get("default-src")).toBe("'self'");
        expect(d.get("img-src")).toBe(
            "'self' data: https://storage.sekolah.example",
        );
        expect(d.get("connect-src")).toBe("'self'");
        expect(d.get("frame-ancestors")).toBe("'none'");
        expect(d.get("base-uri")).toBe("'self'");
    });

    it("respons 404 tetap ber-CSP tanpa unsafe-inline dan tetap menolak framing", async () => {
        // Penangan 404 bawaan Express mengganti CSP dengan `default-src 'none'` —
        // lebih ketat dari §4.2, dan wajar bagi respons tanpa isi.
        const res = await ambil("/api/v1/tidak-ada");
        expect(res.status).toBe(404);
        const csp = res.headers.get("content-security-policy");
        expect(csp).toBeTruthy();
        expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
        expect(res.headers.get("x-frame-options")).toBe("DENY");
    });
});

describe("header keamanan lain (NFR-S-11, SDD-13 §4.2)", () => {
    it("HSTS, nosniff, frame DENY, referrer, dan permissions policy", async () => {
        const h = (await ambil()).headers;
        expect(h.get("strict-transport-security")).toBe(
            "max-age=31536000; includeSubDomains; preload",
        );
        expect(h.get("x-content-type-options")).toBe("nosniff");
        expect(h.get("x-frame-options")).toBe("DENY");
        expect(h.get("referrer-policy")).toBe(
            "strict-origin-when-cross-origin",
        );
        expect(h.get("permissions-policy")).toBe(
            "camera=(self), geolocation=(), microphone=()",
        );
    });

    it("probe publik ikut membawa X-RateLimit-* (NFR-S-07 — seluruh respons route)", async () => {
        expect((await ambil()).headers.get("x-ratelimit-limit")).toBe("100");
    });
});
