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
    LoginBodySchema,
    LoginResponseSchema,
    RefreshBodySchema,
    RefreshResponseSchema,
} from "./schemas/auth.schema.js";
import { AuthService } from "./services/auth.service.js";

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
): Router {
    const service = new AuthService(
        deps.db,
        deps.jwtKeys,
        deps.permissionCache,
        deps.auditLogger,
        deps.clock,
        deps.logger,
    );
    const router = express.Router();
    router.post(loginRoute.path, batasi(loginRoute), loginHandler(service));
    router.post(refreshRoute.path, batasi(refreshRoute), refreshHandler(service));
    return router;
}
