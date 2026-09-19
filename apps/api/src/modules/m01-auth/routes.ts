// Route M-01 (SDD-AUTH-01, PM-01) + perakit router. Login dan refresh publik: keduanya
// justru yang menghasilkan kredensial, jadi tidak dapat menuntut autentikasi lebih dulu.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { AuthContext, PermissionCache } from "../../shared/auth/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { Logger } from "../../shared/observability/index.js";
import type { JwtKeys } from "../../shared/security/index.js";
import { loginHandler, refreshHandler } from "./controllers/auth.controller.js";
import {
    forgotHandler,
    listPermintaanHandler,
    terbitkanHandler,
    tolakHandler,
} from "./controllers/password-reset.controller.js";
import {
    cabutSesiHandler,
    listSesiHandler,
    logoutHandler,
    logoutSemuaHandler,
} from "./controllers/session.controller.js";
import {
    ListSesiResponseSchema,
    LoginBodySchema,
    LoginResponseSchema,
    RefreshBodySchema,
    RefreshResponseSchema,
    SesiIdParamSchema,
    TanpaIsiSchema,
} from "./schemas/auth.schema.js";
import {
    ForgotBodySchema,
    ForgotResponseSchema,
    ListPermintaanResponseSchema,
    PermintaanIdParamSchema,
    SinglePermintaanResponseSchema,
    TerbitkanBodySchema,
    TerbitkanResponseSchema,
    TolakBodySchema,
} from "./schemas/password-reset.schema.js";
import { AuthService } from "./services/auth.service.js";
import { PasswordResetService } from "./services/password-reset.service.js";
import { SessionService } from "./services/session.service.js";

/** Pemilik katalog endpoint M-01 (m01-auth.md §7). */
const MODUL = "m01-auth";

/**
 * FR-01.1. Kelas `login` (SDD-13 §4.3): hanya percobaan gagal yang dihitung — login
 * yang berhasil tidak mengurangi jatah IP-nya.
 */
export const loginRoute = defineRoute({
    method: "POST",
    path: "/auth/login",
    public: true,
    rateLimitClass: "login",
    module: MODUL,
    summary: "Login email + password; menerbitkan access token EdDSA dan refresh token",
    body: LoginBodySchema,
    response: LoginResponseSchema,
});

/** SDD-SESS-04: rotasi refresh token; pemakaian ulang mencabut seluruh keluarganya. */
export const refreshRoute = defineRoute({
    method: "POST",
    path: "/auth/refresh",
    public: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Menukar refresh token dengan pasangan token baru",
    body: RefreshBodySchema,
    response: RefreshResponseSchema,
});

/**
 * FR-01.2. Keempat route berikut `authenticated: true` (endpoint "Bearer", `SDD-AUTH-12`): datanya
 * milik pemanggil sendiri, jadi tidak ada permission katalog — scope `own` ditegakkan repository.
 */
export const logoutRoute = defineRoute({
    method: "POST",
    path: "/auth/logout",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Logout: mencabut sesi yang membawa permintaan ini",
    successStatus: 204,
    response: TanpaIsiSchema,
});

/** FR-01.2 A1 — `LOGOUT_ALL_DEVICES`. */
export const logoutSemuaRoute = defineRoute({
    method: "POST",
    path: "/auth/logout-all",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Keluar dari semua perangkat: mencabut seluruh sesi pengguna",
    successStatus: 204,
    response: TanpaIsiSchema,
});

/** UX P-79 Perangkat Terhubung: sesi aktif milik pengguna, satu per keluarga refresh token. */
export const listSesiRoute = defineRoute({
    method: "GET",
    path: "/auth/sessions",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar sesi (perangkat) aktif milik pengguna",
    response: ListSesiResponseSchema,
});

/** Sesi milik orang lain dan sesi yang tidak ada dijawab sama: 403 (SDD-AUTH-08). */
export const cabutSesiRoute = defineRoute({
    method: "DELETE",
    path: "/auth/sessions/:id",
    authenticated: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Mencabut satu sesi (perangkat) milik pengguna sendiri",
    params: SesiIdParamSchema,
    successStatus: 204,
    response: TanpaIsiSchema,
});

/**
 * FR-01.3 — reset password administratif. `forgot` publik dan SELALU menjawab sama (A1); sisanya milik
 * Administrator (`user.reset_password`, Lampiran C) — antrean P-67.
 */
export const forgotPasswordRoute = defineRoute({
    method: "POST",
    path: "/auth/password/forgot",
    public: true,
    rateLimitClass: "default",
    module: MODUL,
    summary: "Ajukan permintaan reset password (jawaban netral untuk email apa pun)",
    successStatus: 202,
    body: ForgotBodySchema,
    response: ForgotResponseSchema,
});

export const listPermintaanResetRoute = defineRoute({
    method: "GET",
    path: "/auth/password/requests",
    permission: "user.reset_password",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Antrean permintaan reset password (P-67)",
    response: ListPermintaanResponseSchema,
});

/** Password sementara tampil SATU kali pada respons ini; tak dapat dibaca ulang (FR-01.3 AC). */
export const terbitkanResetRoute = defineRoute({
    method: "POST",
    path: "/auth/password/requests/:id/issue",
    permission: "user.reset_password",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Terbitkan password sementara atas satu permintaan (metode verifikasi wajib)",
    successStatus: 200,
    params: PermintaanIdParamSchema,
    body: TerbitkanBodySchema,
    response: TerbitkanResponseSchema,
});

export const tolakResetRoute = defineRoute({
    method: "POST",
    path: "/auth/password/requests/:id/reject",
    permission: "user.reset_password",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Tolak satu permintaan reset password beserta alasannya",
    successStatus: 200,
    params: PermintaanIdParamSchema,
    body: TolakBodySchema,
    response: SinglePermintaanResponseSchema,
});

export interface AuthModuleDeps {
    readonly db: Kysely<Database>;
    readonly jwtKeys: JwtKeys;
    readonly permissionCache: PermissionCache;
    readonly auditLogger: AuditLogger;
    readonly clock: Clock;
    readonly logger: Logger;
}

export function authRouter(
    deps: AuthModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    terautentikasi: () => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new AuthService(
        deps.db,
        deps.jwtKeys,
        deps.permissionCache,
        deps.auditLogger,
        deps.clock,
        deps.logger,
    );
    const sesi = new SessionService(deps.db, deps.auditLogger, deps.clock);
    const reset = new PasswordResetService(deps.db, deps.auditLogger, deps.clock, deps.logger);
    const router = express.Router();
    router.post(loginRoute.path, batasi(loginRoute), loginHandler(service));
    router.post(refreshRoute.path, batasi(refreshRoute), refreshHandler(service));
    router.post(logoutRoute.path, batasi(logoutRoute), terautentikasi(), logoutHandler(sesi));
    router.post(logoutSemuaRoute.path, batasi(logoutSemuaRoute), terautentikasi(), logoutSemuaHandler(sesi));
    router.get(listSesiRoute.path, batasi(listSesiRoute), terautentikasi(), listSesiHandler(sesi));
    router.delete(cabutSesiRoute.path, batasi(cabutSesiRoute), terautentikasi(), cabutSesiHandler(sesi));
    router.post(forgotPasswordRoute.path, batasi(forgotPasswordRoute), forgotHandler(reset));
    router.get(listPermintaanResetRoute.path, batasi(listPermintaanResetRoute), otorisasi(listPermintaanResetRoute.permission), listPermintaanHandler(reset));
    router.post(terbitkanResetRoute.path, batasi(terbitkanResetRoute), otorisasi(terbitkanResetRoute.permission), terbitkanHandler(reset));
    router.post(tolakResetRoute.path, batasi(tolakResetRoute), otorisasi(tolakResetRoute.permission), tolakHandler(reset));
    return router;
}

/**
 * Pintu bagi modul lain yang menerbitkan password sementara TANPA mengimpor internal m01-auth
 * (SDD-SYS-03): `POST /users/{id}/reset-password` milik M-02 menerimanya lewat injeksi di composition
 * root. Bentuknya sengaja sempit — bukan `PasswordResetService` utuh.
 */
export function buatPenerbitPasswordSementara(deps: AuthModuleDeps): PenerbitPasswordSementara {
    const layanan = new PasswordResetService(deps.db, deps.auditLogger, deps.clock, deps.logger);
    return {
        terbitkanLangsung: async (ctx, userId, metode, klien) => {
            const hasil = await layanan.terbitkanLangsung(ctx, userId, metode, klien);
            return {
                permintaanId: hasil.permintaan.id,
                berlakuSampai: hasil.permintaan.kedaluwarsa_pada ?? new Date(0),
                passwordSementara: hasil.passwordSementara,
            };
        },
    };
}

export interface PenerbitPasswordSementara {
    terbitkanLangsung(
        ctx: AuthContext,
        userId: string,
        metode: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS",
        klien: { readonly ip: string | undefined; readonly userAgent: string | undefined },
    ): Promise<{ permintaanId: string; berlakuSampai: Date; passwordSementara: string }>;
}
