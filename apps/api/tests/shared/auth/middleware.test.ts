// Acceptance PR-01-15: middleware permission (PM-02, SDD-AUTH-01 §4.1).
//
// Tanpa AuthContext -> 401 UNAUTHENTICATED; ada tetapi tidak memegang permission
// -> 403 INSUFFICIENT_PERMISSION; keduanya lewat next(galat), sebelum controller
// pernah terpanggil (SDD-03 §4.4).

import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
    authorize,
    createAuthContext,
    getAuthContext,
    setAuthContext,
} from "../../../src/shared/auth/index.js";
import { AuthError, ForbiddenError } from "../../../src/shared/errors/index.js";

function res(): Response {
    return { locals: {} } as unknown as Response;
}

describe("authorize", () => {
    it("tanpa AuthContext -> next(AuthError), controller tidak pernah terpanggil", () => {
        const next = vi.fn();
        authorize("setting.view")(
            {} as Request,
            res(),
            next as unknown as NextFunction,
        );
        expect(next).toHaveBeenCalledTimes(1);
        expect(next.mock.calls[0]?.[0]).toBeInstanceOf(AuthError);
        expect((next.mock.calls[0]?.[0] as AuthError).kode).toBe(
            "UNAUTHENTICATED",
        );
    });

    it("AuthContext tanpa permission -> next(ForbiddenError INSUFFICIENT_PERMISSION)", () => {
        const r = res();
        setAuthContext(
            r,
            createAuthContext({ userId: 1, roleCode: "SISWA", scopes: new Map() }),
        );
        const next = vi.fn();
        authorize("setting.view")(
            {} as Request,
            r,
            next as unknown as NextFunction,
        );
        const galat = next.mock.calls[0]?.[0];
        expect(galat).toBeInstanceOf(ForbiddenError);
        expect((galat as ForbiddenError).kode).toBe("INSUFFICIENT_PERMISSION");
    });

    it("AuthContext memegang permission -> next() tanpa argumen, lolos ke controller", () => {
        const r = res();
        setAuthContext(
            r,
            createAuthContext({
                userId: 1,
                roleCode: "ADMIN",
                scopes: new Map([["setting.view", "all"]]),
            }),
        );
        const next = vi.fn();
        authorize("setting.view")(
            {} as Request,
            r,
            next as unknown as NextFunction,
        );
        expect(next).toHaveBeenCalledWith();
    });

    it("permission yang dipegang tetapi berbeda dari yang dituntut route -> tetap 403", () => {
        const r = res();
        setAuthContext(
            r,
            createAuthContext({
                userId: 1,
                roleCode: "GURU",
                scopes: new Map([["asset.view", "restricted"]]),
            }),
        );
        const next = vi.fn();
        authorize("setting.view")(
            {} as Request,
            r,
            next as unknown as NextFunction,
        );
        expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenError);
    });
});

describe("getAuthContext / setAuthContext", () => {
    it("mengembalikan undefined bila belum ada yang menaruhnya", () => {
        expect(getAuthContext(res())).toBeUndefined();
    });

    it("mengembalikan konteks yang sama yang ditaruh", () => {
        const r = res();
        const ctx = createAuthContext({
            userId: 3,
            roleCode: "PETUGAS",
            scopes: new Map(),
        });
        setAuthContext(r, ctx);
        expect(getAuthContext(r)).toBe(ctx);
    });
});
