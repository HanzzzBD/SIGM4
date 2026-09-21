// Gerbang `twoFactorVerified` (BR-070, SDD-AUTH-09 gerbang 3, SDD-SESS-09, PR-02-07): role wajib 2FA
// yang sesinya hanya membuktikan password tidak dapat melewati route terlindung mana pun.

import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
    AMR_OTP,
    ROLE_WAJIB_DUA_FAKTOR,
    authenticated,
    authorize,
    createAuthContext,
    periksaDuaFaktor,
    setAmr,
    setAuthContext,
    wajibDuaFaktor,
} from "../../../src/shared/auth/index.js";
import { DomainError, ForbiddenError } from "../../../src/shared/errors/index.js";

function res(role: string, amr?: readonly string[], scopes: [string, "all"][] = [["setting.view", "all"]]): Response {
    const r = { locals: {} } as unknown as Response;
    setAuthContext(r, createAuthContext({ userId: 1, roleCode: role, scopes: new Map(scopes) }));
    if (amr !== undefined) setAmr(r, amr);
    return r;
}

function jalankan(handler: (req: Request, res: Response, next: NextFunction) => void, r: Response): unknown {
    const next = vi.fn();
    handler({} as Request, r, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    return next.mock.calls[0]?.[0];
}

describe("role wajib 2FA (BR-070)", () => {
    it("Administrator (R-01) dan Pimpinan Sekolah (R-03) — tepat keduanya", () => {
        expect([...ROLE_WAJIB_DUA_FAKTOR].sort()).toEqual(["R-01", "R-03"]);
        for (const r of ["R-01", "R-03"]) expect(wajibDuaFaktor(r)).toBe(true);
        for (const r of ["R-02", "R-04", "R-05", "R-06", "R-07", "", "ADMIN"]) expect(wajibDuaFaktor(r)).toBe(false);
    });
});

describe("periksaDuaFaktor", () => {
    const ctx = (role: string) => createAuthContext({ userId: 1, roleCode: role, scopes: new Map() });

    it("role wajib tanpa `otp` pada amr → TWO_FACTOR_REQUIRED (403)", () => {
        for (const role of ["R-01", "R-03"]) {
            const galat = periksaDuaFaktor(ctx(role), ["pwd"]);
            expect(galat).toBeInstanceOf(DomainError);
            expect(galat?.kode).toBe("TWO_FACTOR_REQUIRED");
        }
    });

    it("role wajib dengan `otp` → lolos", () => {
        expect(periksaDuaFaktor(ctx("R-01"), ["pwd", AMR_OTP])).toBeUndefined();
    });

    it("amr tidak diketahui atau kosong → dianggap belum terverifikasi (gagal tertutup)", () => {
        expect(periksaDuaFaktor(ctx("R-01"), undefined)?.kode).toBe("TWO_FACTOR_REQUIRED");
        expect(periksaDuaFaktor(ctx("R-01"), [])?.kode).toBe("TWO_FACTOR_REQUIRED");
    });

    it("`otp` menyerupai (\"OTP\", \"otp2\") bukan pembuktian faktor kedua", () => {
        expect(periksaDuaFaktor(ctx("R-01"), ["pwd", "OTP"])?.kode).toBe("TWO_FACTOR_REQUIRED");
        expect(periksaDuaFaktor(ctx("R-01"), ["pwd", "otp2"])?.kode).toBe("TWO_FACTOR_REQUIRED");
    });

    it("role opsional lolos meski hanya `pwd`", () => {
        expect(periksaDuaFaktor(ctx("R-05"), ["pwd"])).toBeUndefined();
    });
});

describe("authorize — gerbang 3 mendahului gerbang 4 (permission)", () => {
    it("R-01 hanya ber-`pwd` yang MEMEGANG permission tetap ditolak TWO_FACTOR_REQUIRED, bukan lolos", () => {
        const galat = jalankan(authorize("setting.view"), res("R-01", ["pwd"]));
        expect(galat).toBeInstanceOf(DomainError);
        expect((galat as DomainError).kode).toBe("TWO_FACTOR_REQUIRED");
    });

    it("R-01 hanya ber-`pwd` tanpa permission: yang dijawab 2FA, bukan INSUFFICIENT_PERMISSION (urutan tetap)", () => {
        const galat = jalankan(authorize("setting.manage"), res("R-01", ["pwd"]));
        expect((galat as DomainError).kode).toBe("TWO_FACTOR_REQUIRED");
    });

    it("R-03 diperlakukan sama", () => {
        expect((jalankan(authorize("setting.view"), res("R-03", ["pwd"])) as DomainError).kode).toBe("TWO_FACTOR_REQUIRED");
    });

    it("R-01 ber-`otp` → lanjut ke pemeriksaan permission: lolos bila memegang, INSUFFICIENT_PERMISSION bila tidak", () => {
        expect(jalankan(authorize("setting.view"), res("R-01", ["pwd", AMR_OTP]))).toBeUndefined();
        expect(jalankan(authorize("setting.manage"), res("R-01", ["pwd", AMR_OTP]))).toBeInstanceOf(ForbiddenError);
    });

    it("role opsional tak terpengaruh", () => {
        expect(jalankan(authorize("setting.view"), res("R-05", ["pwd"]))).toBeUndefined();
    });

    it("R-01 tanpa amr sama sekali (token tanpa klaim terbaca) → ditolak", () => {
        expect((jalankan(authorize("setting.view"), res("R-01")) as DomainError).kode).toBe("TWO_FACTOR_REQUIRED");
    });
});

describe("authenticated — bawaan tertutup, pengecualian hanya bila dinyatakan", () => {
    it("R-01 ber-`pwd` ditolak pada route `authenticated` biasa", () => {
        expect((jalankan(authenticated(), res("R-01", ["pwd"])) as DomainError).kode).toBe("TWO_FACTOR_REQUIRED");
        expect((jalankan(authenticated({}), res("R-01", ["pwd"])) as DomainError).kode).toBe("TWO_FACTOR_REQUIRED");
    });

    it("`tanpaDuaFaktor: true` (pendaftaran 2FA, logout) meloloskan sesi yang belum terverifikasi", () => {
        expect(jalankan(authenticated({ tanpaDuaFaktor: true }), res("R-01", ["pwd"]))).toBeUndefined();
    });

    it("pengecualian tidak melewati autentikasi: tanpa AuthContext tetap 401", () => {
        const galat = jalankan(authenticated({ tanpaDuaFaktor: true }), { locals: {} } as unknown as Response);
        expect((galat as DomainError).kode).toBe("UNAUTHENTICATED");
    });

    it("R-01 ber-`otp` dan role opsional lolos tanpa pengecualian", () => {
        expect(jalankan(authenticated(), res("R-01", ["pwd", AMR_OTP]))).toBeUndefined();
        expect(jalankan(authenticated(), res("R-05", ["pwd"]))).toBeUndefined();
    });
});
