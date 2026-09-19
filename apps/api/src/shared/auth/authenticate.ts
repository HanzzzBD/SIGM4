// `authenticate` — langkah 1 rantai SDD-AUTH-09 (SDD-SESS-02, PR-02-02) dan gerbang
// ganti password (langkah 2, FR-01.1 A4).
//
// `authenticate` bersifat LENIENT: token yang ada tetapi tidak sah TIDAK menolak permintaan
// di sini, hanya menandai kegagalannya. Penolakan milik `authorize` pada route yang
// menuntut autentikasi. Kalau tidak, `/auth/refresh` dan `/auth/login` (publik) tak dapat
// dipanggil dengan cookie access yang sudah kedaluwarsa — padahal itulah saat refresh
// dibutuhkan. Route publik tidak peduli ada tidaknya `AuthContext`.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Clock } from "../clock/index.js";
import { DomainError } from "../errors/index.js";
import {
    denganKonteks,
    konteksSaatIni,
    requestIdBaru,
} from "../observability/index.js";
import { JwtError } from "../security/jwt.js";
import type { JwtKeys } from "../security/jwt.js";
import { createAuthContext } from "./context.js";
import { setAuthContext, setKegagalanAutentikasi, setWajibGantiPassword } from "./middleware.js";
import type { PermissionCache } from "./permission-cache.js";
import { COOKIE_ACCESS, bacaCookie } from "./session-cookies.js";

export interface AuthenticateDeps {
    readonly jwtKeys: JwtKeys;
    readonly permissions: PermissionCache;
    readonly clock: Clock;
}

type Sumber = { readonly token: string } | "TIDAK_ADA" | "BENTUK_SALAH";

/** Header `Authorization: Bearer` didahulukan; bila tak ada, cookie akses web. */
function sumberToken(req: Request): Sumber {
    const header = req.get("authorization");
    if (header !== undefined) {
        const cocok = /^Bearer ([^\s]+)$/i.exec(header);
        return cocok?.[1] === undefined ? "BENTUK_SALAH" : { token: cocok[1] };
    }
    const cookie = bacaCookie(req.get("cookie"), COOKIE_ACCESS);
    return cookie === undefined ? "TIDAK_ADA" : { token: cookie };
}

export function authenticate(deps: AuthenticateDeps): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
        const sumber = sumberToken(req);
        if (sumber === "TIDAK_ADA") {
            next();
            return;
        }
        if (sumber === "BENTUK_SALAH") {
            setKegagalanAutentikasi(res, "UNAUTHENTICATED");
            next();
            return;
        }

        let klaim;
        try {
            klaim = deps.jwtKeys.verifikasi(sumber.token, deps.clock.now());
        } catch (galat) {
            if (!(galat instanceof JwtError)) throw galat;
            setKegagalanAutentikasi(res, galat.alasan === "EXPIRED" ? "TOKEN_EXPIRED" : "UNAUTHENTICATED");
            next();
            return;
        }

        // Permission dan status akun dibaca ulang tiap permintaan (PM-05): akun yang
        // dinonaktifkan kehilangan aksesnya seketika, bukan setelah tokennya kedaluwarsa.
        const userId = Number(klaim.sub);
        const efektif = await deps.permissions.load(userId);
        if (efektif?.userStatus !== "AKTIF") {
            setKegagalanAutentikasi(res, "UNAUTHENTICATED");
            next();
            return;
        }

        setAuthContext(
            res,
            createAuthContext({ userId, roleCode: efektif.roleCode, scopes: efektif.scopes }),
        );
        setWajibGantiPassword(res, klaim.pwd);
        // Rate limit dan log sesudah ini melihat pelakunya (SDD-OBS-03).
        const induk = konteksSaatIni() ?? { requestId: requestIdBaru(), modul: "api" };
        denganKonteks({ ...induk, userId, role: efektif.roleCode }, () => {
            next();
        });
    };
}

/**
 * Gerbang ganti password (SDD-AUTH-09 langkah 2). Pengguna yang wajib mengganti
 * password hanya boleh menjangkau `prefiksDiizinkan` (alur autentikasi: refresh,
 * logout, ganti password); selebihnya `403 PASSWORD_CHANGE_REQUIRED`.
 */
export function gerbangGantiPassword(prefiksDiizinkan: string): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        if (res.locals["wajibGantiPassword"] === true && !req.path.startsWith(prefiksDiizinkan)) {
            next(new DomainError("PASSWORD_CHANGE_REQUIRED", "Anda wajib mengganti password sebelum melanjutkan."));
            return;
        }
        next();
    };
}
