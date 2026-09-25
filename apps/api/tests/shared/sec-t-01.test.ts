// SEC-T-01 — matriks uji otorisasi TERGENERATE dari registri route (SDD-API-13,
// PR-01-15 acceptance).
//
// Sumbernya `registry.guarded()` di api/index.ts — daftar route ber-permission
// yang BENAR-BENAR terpasang, bukan salinan yang ditulis di berkas ini. Route
// baru yang didaftarkan PR berikutnya otomatis masuk ketiga uji parameterized
// di bawah tanpa satu baris pun disentuh di sini; itulah maksud "mencakup 100%
// route" pada acceptance-nya — cakupannya tidak dapat diam-diam menyusut.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import type { Kysely } from "kysely";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp, registry } from "../../src/api/index.js";
import {
    authorize,
    createAuthContext,
    setAuthContext,
} from "../../src/shared/auth/index.js";
import { FixedClock } from "../../src/shared/clock/index.js";
import type { Database } from "../../src/shared/db/index.js";
import { AuthError, ForbiddenError } from "../../src/shared/errors/index.js";
import { HealthRegistry, Logger } from "../../src/shared/observability/index.js";
import { authPalsu } from "../helpers/auth.js";

function res(): Response {
    return { locals: {} } as unknown as Response;
}

const rute = registry.guarded();
const kasus = rute.map(
    (r) => [`${r.method} ${r.path}`, r.permission] as const,
);

describe("SEC-T-01 — otorisasi tergenerate", () => {
    it("registri tidak kosong — uji ini benar-benar menguji sesuatu", () => {
        expect(rute.length).toBeGreaterThan(0);
    });

    it.each(kasus)("%s — tanpa AuthContext -> 401 sebelum controller", (_n, permission) => {
        const next = vi.fn();
        authorize(permission)({} as Request, res(), next as unknown as NextFunction);
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AuthError);
    });

    it.each(kasus)(
        "%s — AuthContext TANPA permission itu -> 403 sebelum controller",
        (_n, permission) => {
            const r = res();
            setAuthContext(
                r,
                createAuthContext({
                    userId: 1,
                    roleCode: "SISWA",
                    scopes: new Map(),
                }),
            );
            const next = vi.fn();
            authorize(permission)({} as Request, r, next as unknown as NextFunction);
            const galat = next.mock.calls[0]?.[0];
            expect(galat).toBeInstanceOf(ForbiddenError);
            expect((galat as ForbiddenError).kode).toBe(
                "INSUFFICIENT_PERMISSION",
            );
        },
    );

    it.each(kasus)(
        "%s — AuthContext YANG memegang permission itu -> lolos ke controller",
        (_n, permission) => {
            const r = res();
            setAuthContext(
                r,
                createAuthContext({
                    userId: 1,
                    roleCode: "ADMIN",
                    scopes: new Map([[permission, "all"]]),
                }),
            );
            const next = vi.fn();
            authorize(permission)({} as Request, r, next as unknown as NextFunction);
            expect(next).toHaveBeenCalledWith();
        },
    );
});

// Endpoint \"Bearer\" (`authenticated: true`, SDD-AUTH-12) tidak punya permission untuk dilanggar, jadi
// matriksnya hanya satu penolakan — TANPA autentikasi → 401 — tetapi dijalankan pada aplikasi TERAKIT
// (rantai penuh: authenticate → gerbang → rate limit → authenticated()), sebelum controller/basis data.
describe("SEC-T-01 — route \"Bearer\" (authenticated) pada aplikasi terakit", () => {
    const bearer = registry.authenticatedRoutes();
    const jam = new FixedClock(new Date("2026-09-19T03:00:00Z"));
    const app = createApp({
        health: new HealthRegistry(),
        limiter: { hit: () => Promise.resolve({ lolos: true, batas: 100, sisa: 99, resetDetik: 60 }) },
        security: { objectStorageOrigin: "http://minio:9000" },
        logger: new Logger({ clock: jam, tulis: () => undefined }),
        clock: jam,
        // Basis data palsu: bila sebuah route mencapai controller-nya, uji ini gagal keras — itulah intinya.
        db: {} as unknown as Kysely<Database>,
        auth: authPalsu(),
    });
    const server = createServer(app);
    const siap = new Promise<string>((r) =>
        server.listen(0, "127.0.0.1", () => {
            r(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}/api/v1`);
        }),
    );
    afterAll(async () => {
        await new Promise((r) => server.close(r));
    });

    it("registri memuat route Bearer — uji ini benar-benar menguji sesuatu", () => {
        expect(bearer.length).toBeGreaterThanOrEqual(4);
    });

    it.each(bearer.map((r) => [`${r.method} ${r.path}`, r.method, r.path] as const))(
        "%s — tanpa token, token rusak, dan Authorization salah bentuk → 401 UNAUTHENTICATED sebelum controller",
        async (_n, method, path) => {
            const url = (await siap) + path.replace(/:[A-Za-z_]+/g, "00000000-0000-4000-8000-000000000000");
            for (const headers of [{}, { authorization: "Bearer bukan.jwt.sah" }, { authorization: "Basic abc" }, { cookie: "sigm4_at=bukan.jwt.sah" }]) {
                const res = await fetch(url, { method, headers });
                const badan = (await res.json()) as { error?: { code: string } };
                expect(res.status, JSON.stringify(headers)).toBe(401);
                expect(badan.error?.code).toBe("UNAUTHENTICATED");
            }
        },
    );
});
