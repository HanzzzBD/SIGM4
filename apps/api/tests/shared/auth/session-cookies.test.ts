// Cookie sesi web (SDD-SESS-05, NFR-S-09).

import { describe, expect, it } from "vitest";
import {
    COOKIE_ACCESS,
    COOKIE_REFRESH,
    PATH_ACCESS,
    PATH_REFRESH,
    bacaCookie,
    hapusCookie,
    susunCookie,
} from "../../../src/shared/auth/index.js";

describe("susunCookie / hapusCookie", () => {
    it("httpOnly, Secure, SameSite=Strict, Max-Age, dan Path — semuanya, tanpa Domain", () => {
        const c = susunCookie(COOKIE_ACCESS, "nilai", PATH_ACCESS, 3600);
        expect(c).toBe("sigm4_at=nilai; Max-Age=3600; Path=/api/v1; HttpOnly; Secure; SameSite=Strict");
        expect(c).not.toMatch(/Domain=/i);
    });

    it("cookie refresh dibatasi ke /api/v1/auth — tidak ikut pada permintaan biasa", () => {
        expect(susunCookie(COOKIE_REFRESH, "x", PATH_REFRESH, 60)).toContain("Path=/api/v1/auth;");
        expect(PATH_REFRESH.startsWith(PATH_ACCESS)).toBe(true);
    });

    it("penghapus: nilai kosong, Max-Age=0, atribut sama (agar peramban mencocokkan cookie-nya)", () => {
        expect(hapusCookie(COOKIE_REFRESH, PATH_REFRESH)).toBe(
            "sigm4_rt=; Max-Age=0; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict",
        );
    });
});

describe("bacaCookie", () => {
    it("membaca cookie bernama di antara cookie lain", () => {
        expect(bacaCookie("a=1; sigm4_at=abc.def.ghi; b=2", COOKIE_ACCESS)).toBe("abc.def.ghi");
    });

    it("nilai memuat '=' tetap utuh (bagian setelah '=' pertama)", () => {
        expect(bacaCookie("sigm4_rt=abc=def", COOKIE_REFRESH)).toBe("abc=def");
    });

    it("tidak cocok sebagian nama: sigm4_at2 bukan sigm4_at", () => {
        expect(bacaCookie("sigm4_at2=x", COOKIE_ACCESS)).toBeUndefined();
        expect(bacaCookie("xsigm4_at=x", COOKIE_ACCESS)).toBeUndefined();
    });

    it.each([undefined, "", "sigm4_at", "sigm4_at=", "sigm4_at=   "])("tanpa nilai → undefined: %j", (header) => {
        expect(bacaCookie(header, COOKIE_ACCESS)).toBeUndefined();
    });
});
