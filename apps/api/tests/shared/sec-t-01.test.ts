// SEC-T-01 — matriks uji otorisasi TERGENERATE dari registri route (SDD-API-13,
// PR-01-15 acceptance).
//
// Sumbernya `registry.guarded()` di api/index.ts — daftar route ber-permission
// yang BENAR-BENAR terpasang, bukan salinan yang ditulis di berkas ini. Route
// baru yang didaftarkan PR berikutnya otomatis masuk ketiga uji parameterized
// di bawah tanpa satu baris pun disentuh di sini; itulah maksud "mencakup 100%
// route" pada acceptance-nya — cakupannya tidak dapat diam-diam menyusut.

import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { registry } from "../../src/api/index.js";
import {
    authorize,
    createAuthContext,
    setAuthContext,
} from "../../src/shared/auth/index.js";
import { AuthError, ForbiddenError } from "../../src/shared/errors/index.js";

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
