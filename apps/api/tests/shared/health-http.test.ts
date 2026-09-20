// Route kesehatan lewat HTTP sungguhan (SDD-OBS-06, SDD-SYS-08, SDD-AUTH-01 §4.1).
//
// Server dibuka pada port acak dan dipanggil dengan fetch — yang diuji adalah
// yang dilihat proxy dan skrip deploy, bukan fungsi handler-nya.

import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import type { RequestListener, Server } from "node:http";
import express from "express";
import type { RequestHandler } from "express";
import type { Kysely } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import {
    healthSummaryHandler,
    healthSummaryRoute,
    healthSummaryRouter,
} from "../../src/api/health.js";
import { createApp, registry } from "../../src/api/index.js";
import { buildOpenApiDocument } from "../../src/api/openapi.js";
import {
    authorize,
    createAuthContext,
    setAuthContext,
} from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import {
    HealthRegistry,
    Logger,
} from "../../src/shared/observability/index.js";
import type {
    CheckResult,
    DependencyName,
} from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";
import { createHealthServer } from "../../src/worker/health-server.js";
import type { Database } from "../../src/shared/db/index.js";

// Uji berkas ini hanya memukul route kesehatan — pool palsu, tidak tersambung.
const dbPalsu = {} as unknown as Kysely<Database>;

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
        clock: new FixedClock(new Date("2026-09-14T00:00:00Z")),
        db: dbPalsu,
        auth: authPalsu(),
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

    it("ready → 503 sejak proses berhenti, meski dependensi sehat (SDD-INF-04)", async () => {
        const h = health(siap);
        const url = await buka(aplikasi(h));
        expect((await fetch(`${url}/api/v1/health/ready`)).status).toBe(200);
        h.tandaiBerhenti();
        const res = await fetch(`${url}/api/v1/health/ready`);
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({
            error: { code: "SERVICE_NOT_READY" },
        });
        // Liveness tetap 200: proses masih hidup, hanya tidak menerima pekerjaan baru.
        expect((await fetch(`${url}/api/v1/health/live`)).status).toBe(200);
    });

    it("/health ringkasan terpasang di belakang otorisasi — tanpa AuthContext → 401 (PM-02)", async () => {
        const url = await buka(aplikasi(health(siap)));
        const res = await fetch(`${url}/api/v1/health`);
        expect(res.status).toBe(401);
        const teks = await res.text();
        expect(teks).not.toMatch(/database|llm/);
        expect(JSON.parse(teks)).toMatchObject({
            success: false,
            error: { code: "UNAUTHENTICATED" },
        });
    });

    it("registri proses: probe publik, ringkasan, CRUD pengguna (PR-01-02), impor massal (PR-01-03), matriks permission (PR-01-04), skema lokasi (PR-01-05), pohon+penonaktifan (PR-01-06), daftar aset per lokasi (PR-01-07), penelusuran (PR-01-08), ekspor activity log (PR-01-09), parameter sistem (PR-01-10), kenaikan kelas massal (PR-01-13), pengambilan pekerjaan impor pengguna (PR-01-17), serta master data Lampiran E — tahun ajaran, hari libur, hari kerja, unit kerja (PR-01-18) berpermission, serta login/refresh publik (PR-02-02), logout + sesi berautentikasi saja (PR-02-04), reset password administratif (PR-02-05), serta ganti password + profil sendiri (PR-02-06)", () => {
        expect(registry.all().map((r) => `${r.method} ${r.path}`)).toEqual([
            "GET /health/live",
            "GET /health/ready",
            "GET /health",
            "POST /auth/login",
            "POST /auth/refresh",
            "POST /auth/logout",
            "POST /auth/logout-all",
            "GET /auth/sessions",
            "DELETE /auth/sessions/:id",
            "POST /auth/password/forgot",
            "GET /auth/password/requests",
            "POST /auth/password/requests/:id/issue",
            "POST /auth/password/requests/:id/reject",
            "GET /me",
            "PUT /me",
            "POST /auth/password/change",
            "GET /users",
            "POST /users",
            "GET /users/:id",
            "PUT /users/:id",
            "PATCH /users/:id/status",
            "POST /users/:id/reset-password",
            "POST /users/import",
            "GET /users/import/:id",
            "GET /roles",
            "PUT /roles/:id/permissions",
            "GET /locations/tree",
            "POST /buildings",
            "POST /areas",
            "POST /rooms",
            "PUT /rooms/:id",
            "PATCH /buildings/:id/status",
            "PATCH /rooms/:id/status",
            "GET /rooms/:id/assets",
            "GET /activity-logs",
            "GET /activity-logs/export",
            "GET /settings",
            "PUT /settings",
            "POST /class-promotions",
            "GET /academic-years",
            "POST /academic-years",
            "PUT /academic-years/:id",
            "PATCH /academic-years/:id/activate",
            "GET /holidays",
            "POST /holidays",
            "PUT /holidays/:id",
            "DELETE /holidays/:id",
            "GET /work-days",
            "PUT /work-days",
            "GET /work-units",
            "POST /work-units",
            "PUT /work-units/:id",
            "PATCH /work-units/:id/status",
        ]);
        expect(registry.publicRoutes().map((r) => `${r.method} ${r.path}`)).toEqual([
            "GET /health/live",
            "GET /health/ready",
            "POST /auth/login",
            "POST /auth/refresh",
            "POST /auth/password/forgot",
        ]);
        // Endpoint "Bearer" (SDD-AUTH-12): tanpa permission, tanpa public — daftar pendek yang dapat ditinjau.
        expect(registry.authenticatedRoutes().map((r) => `${r.method} ${r.path}`)).toEqual([
            "POST /auth/logout",
            "POST /auth/logout-all",
            "GET /auth/sessions",
            "DELETE /auth/sessions/:id",
            "GET /me",
            "PUT /me",
            "POST /auth/password/change",
        ]);
        expect(registry.guarded().map((r) => r.permission)).toEqual([
            "setting.view",
            "user.reset_password",
            "user.reset_password",
            "user.reset_password",
            "user.view",
            "user.create",
            "user.view",
            "user.update",
            "user.update",
            "user.reset_password",
            "user.create",
            "user.create",
            "role.view",
            "role.update",
            "location.view",
            "location.manage",
            "location.manage",
            "location.manage",
            "location.manage",
            "location.manage",
            "location.manage",
            "asset.view",
            "activity_log.view",
            "activity_log.export",
            "setting.view",
            "setting.manage",
            "user.update",
            "setting.view",
            "setting.manage",
            "setting.manage",
            "setting.manage",
            "setting.view",
            "setting.manage",
            "setting.manage",
            "setting.manage",
            "setting.view",
            "setting.manage",
            "setting.view",
            "setting.manage",
            "setting.manage",
            "setting.manage",
        ]);
        const doc = buildOpenApiDocument(registry, { version: "uji" });
        expect(Object.keys(doc.paths ?? {})).toEqual([
            "/api/v1/health/live",
            "/api/v1/health/ready",
            "/api/v1/health",
            "/api/v1/auth/login",
            "/api/v1/auth/refresh",
            "/api/v1/auth/logout",
            "/api/v1/auth/logout-all",
            "/api/v1/auth/sessions",
            "/api/v1/auth/sessions/{id}",
            "/api/v1/auth/password/forgot",
            "/api/v1/auth/password/requests",
            "/api/v1/auth/password/requests/{id}/issue",
            "/api/v1/auth/password/requests/{id}/reject",
            "/api/v1/me",
            "/api/v1/auth/password/change",
            "/api/v1/users",
            "/api/v1/users/{id}",
            "/api/v1/users/{id}/status",
            "/api/v1/users/{id}/reset-password",
            "/api/v1/users/import",
            "/api/v1/users/import/{id}",
            "/api/v1/roles",
            "/api/v1/roles/{id}/permissions",
            "/api/v1/locations/tree",
            "/api/v1/buildings",
            "/api/v1/areas",
            "/api/v1/rooms",
            "/api/v1/rooms/{id}",
            "/api/v1/buildings/{id}/status",
            "/api/v1/rooms/{id}/status",
            "/api/v1/rooms/{id}/assets",
            "/api/v1/activity-logs",
            "/api/v1/activity-logs/export",
            "/api/v1/settings",
            "/api/v1/class-promotions",
            "/api/v1/academic-years",
            "/api/v1/academic-years/{id}",
            "/api/v1/academic-years/{id}/activate",
            "/api/v1/holidays",
            "/api/v1/holidays/{id}",
            "/api/v1/work-days",
            "/api/v1/work-units",
            "/api/v1/work-units/{id}",
            "/api/v1/work-units/{id}/status",
        ]);
    });

    it("healthSummaryRouter menegakkan setting.view — tanpa itu 403, dengan itu 200", async () => {
        const tanpaIzin = createAuthContext({
            userId: 1,
            roleCode: "SISWA",
            scopes: new Map(),
        });
        const berizin = createAuthContext({
            userId: 2,
            roleCode: "ADMIN",
            scopes: new Map([["setting.view", "all"]]),
        });
        const batasi = (): RequestHandler => (_req, _res, next) => {
            next();
        };

        function aplikasiRingkasan(ctx: typeof tanpaIzin) {
            const app = express();
            app.use((_req, res, next) => {
                setAuthContext(res, ctx);
                next();
            });
            app.use(healthSummaryRouter(health(siap), batasi, authorize));
            app.use(
                (
                    galat: unknown,
                    _req: express.Request,
                    res: express.Response,
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    _next: express.NextFunction,
                ) => {
                    const status =
                        galat instanceof Error && galat.name === "ForbiddenError"
                            ? 403
                            : 401;
                    res.status(status).json({ code: (galat as Error).name });
                },
            );
            return app;
        }

        const ditolak = await fetch(
            `${await buka(aplikasiRingkasan(tanpaIzin))}/health`,
        );
        expect(ditolak.status).toBe(403);

        const diterima = await fetch(
            `${await buka(aplikasiRingkasan(berizin))}/health`,
        );
        expect(diterima.status).toBe(200);
        const body = (await diterima.json()) as { data: { status: string } };
        expect(body.data.status).toBe("degraded");
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
