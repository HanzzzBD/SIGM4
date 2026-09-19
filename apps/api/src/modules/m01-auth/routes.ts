// Route M-01 (SDD-AUTH-01, PM-01) + perakit router. Login dan refresh publik: keduanya
// justru yang menghasilkan kredensial, jadi tidak dapat menuntut autentikasi lebih dulu.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { PermissionCache } from "../../shared/auth/index.js";
import type { Clock } from "../../shared/clock/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { Logger } from "../../shared/observability/index.js";
import type { JwtKeys } from "../../shared/security/index.js";
import { loginHandler, refreshHandler } from "./controllers/auth.controller.js";
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
import { AuthService } from "./services/auth.service.js";
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
    const router = express.Router();
    router.post(loginRoute.path, batasi(loginRoute), loginHandler(service));
    router.post(refreshRoute.path, batasi(refreshRoute), refreshHandler(service));
    router.post(logoutRoute.path, batasi(logoutRoute), terautentikasi(), logoutHandler(sesi));
    router.post(logoutSemuaRoute.path, batasi(logoutSemuaRoute), terautentikasi(), logoutSemuaHandler(sesi));
    router.get(listSesiRoute.path, batasi(listSesiRoute), terautentikasi(), listSesiHandler(sesi));
    router.delete(cabutSesiRoute.path, batasi(cabutSesiRoute), terautentikasi(), cabutSesiHandler(sesi));
    return router;
}
