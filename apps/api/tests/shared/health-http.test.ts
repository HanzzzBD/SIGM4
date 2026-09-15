// Route kesehatan lewat HTTP sungguhan (SDD-OBS-06, SDD-SYS-08, SDD-AUTH-01 §4.1).
//
// Server dibuka pada port acak dan dipanggil dengan fetch — yang diuji adalah
// yang dilihat proxy dan skrip deploy, bukan fungsi handler-nya.

import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import type { RequestListener, Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import {
    healthSummaryHandler,
    healthSummaryRoute,
} from "../../src/api/health.js";
import { createApp, registry } from "../../src/api/index.js";
import { buildOpenApiDocument } from "../../src/api/openapi.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import {
    HealthRegistry,
    Logger,
} from "../../src/shared/observability/index.js";
import type {
    CheckResult,
    DependencyName,
} from "../../src/shared/observability/index.js";
import { createHealthServer } from "../../src/worker/health-server.js";

function health(
    status: Partial<Record<DependencyName, CheckResult["status"]>>,
): HealthRegistry {
    return new HealthRegistry(30).register(
        ...Object.entries(status).map(([name, s]) => ({
            name: name as DependencyName,
            probe: () => Promise.resolve({ status: s }),
        })),
    );
}

/** Aplikasi dengan limiter yang selalu meloloskan — rate limit diuji di berkasnya sendiri. */
function aplikasi(h: HealthRegistry) {
    return createApp({
        health: h,
        limiter: {
            hit: () =>
                Promise.resolve({
                    lolos: true,
                    batas: 100,
                    sisa: 99,
                    resetDetik: 60,
                }),
        },
        security: { objectStorageOrigin: "http://minio:9000" },
        logger: new Logger({
            clock: new FixedClock(new Date("2026-09-14T00:00:00Z")),
            tulis: () => undefined,
        }),
    });
}

const terbuka: Server[] = [];

/** Membuka server (atau aplikasi Express) pada port acak; ditutup setelah tiap uji. */
async function buka(sasaran: Server | RequestListener): Promise<string> {
    const server =
        typeof sasaran === "function" ? createServer(sasaran) : sasaran;
    terbuka.push(server);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

afterEach(async () => {
    await Promise.all(
        terbuka.splice(0).map((s) => new Promise((r) => s.close(r))),
    );
});

describe("sigm4-api — /api/v1/health/*", () => {
    const siap = {
        database: "up",
        redis: "up",
        llm: "down",
        fcm: "down",
    } as const;

    it("live → 200", async () => {
        const url = await buka(aplikasi(health({ database: "down" })));
        const res = await fetch(`${url}/api/v1/health/live`);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            success: true,
            data: { status: "up" },
            meta: null,
        });
    });

    it("ready → 200 saat llm dan fcm down (acceptance PR-00-14)", async () => {
        const url = await buka(aplikasi(health(siap)));
        const res = await fetch(`${url}/api/v1/health/ready`);
        expect(res.status).toBe(200);
    });

    it("ready → 503 saat redis down", async () => {
        const url = await buka(aplikasi(health({ ...siap, redis: "down" })));
        const res = await fetch(`${url}/api/v1/health/ready`);
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({
            success: false,
            error: { code: "SERVICE_NOT_READY" },
        });
    });

    it("/health ringkasan TIDAK terpasang tanpa middleware permission (PM-02) → 404", async () => {
        const url = await buka(aplikasi(health(siap)));
        const res = await fetch(`${url}/api/v1/health`);
        expect(res.status).toBe(404);
        expect(await res.text()).not.toMatch(/database|llm/);
    });

    it("registri proses: hanya dua probe publik, ringkasan tidak diiklankan", () => {
        expect(registry.all().map((r) => `${r.method} ${r.path}`)).toEqual([
            "GET /health/live",
            "GET /health/ready",
        ]);
        expect(registry.publicRoutes()).toHaveLength(2);
        const doc = buildOpenApiDocument(registry, { version: "uji" });
        expect(Object.keys(doc.paths ?? {})).toEqual([
            "/api/v1/health/live",
            "/api/v1/health/ready",
        ]);
    });

    it("ringkasan menuntut setting.view dan melaporkan setiap dependensi (OBS-06)", async () => {
        expect(healthSummaryRoute.permission).toBe("setting.view");
        await expect(
            new HealthRegistry().register().summary(),
        ).resolves.toEqual({ status: "up", checks: {} });

        const app = express();
        app.get("/health", healthSummaryHandler(health(siap)));
        const res = await fetch(`${await buka(app)}/health`);
        const body = (await res.json()) as {
            data: { status: string; checks: Record<string, unknown> };
        };
        expect(res.status).toBe(200);
        expect(body.data.status).toBe("degraded");
        expect(Object.keys(body.data.checks).sort()).toEqual([
            "database",
            "fcm",
            "llm",
            "redis",
        ]);
        expect(healthSummaryRoute.response.safeParse(body).success).toBe(true);
    });
});

describe("sigm4-worker — /health/* (SDD-SYS-08)", () => {
    it("live → 200, ready → 200 saat llm down", async () => {
        const url = await buka(
            createHealthServer(
                health({ database: "up", redis: "up", llm: "down" }),
            ),
        );
        expect((await fetch(`${url}/health/live`)).status).toBe(200);
        expect((await fetch(`${url}/health/ready`)).status).toBe(200);
    });

    it("ready → 503 saat database down", async () => {
        const url = await buka(
            createHealthServer(health({ database: "down", redis: "up" })),
        );
        expect((await fetch(`${url}/health/ready`)).status).toBe(503);
    });

    it("path lain, termasuk ringkasan, → 404", async () => {
        const url = await buka(createHealthServer(health({ database: "up" })));
        expect((await fetch(`${url}/health`)).status).toBe(404);
        expect(
            (await fetch(`${url}/health/live`, { method: "POST" })).status,
        ).toBe(404);
    });
});
