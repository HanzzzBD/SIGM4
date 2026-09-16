// Route M-02 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Database } from "../../shared/db/index.js";
import { defineRoute } from "../../shared/http/index.js";
import type { RouteDefinition } from "../../shared/http/index.js";
import type { Logger } from "../../shared/observability/index.js";
import {
    createUserHandler,
    getUserHandler,
    listUsersHandler,
    updateUserHandler,
    updateUserStatusHandler,
} from "./controllers/user.controller.js";
import { importUsersHandler } from "./controllers/user-import.controller.js";
import {
    CreateUserBodySchema,
    CreatedUserResponseSchema,
    ListUsersResponseSchema,
    SingleUserResponseSchema,
    UpdateUserBodySchema,
    UpdateUserStatusBodySchema,
    UserIdParamSchema,
} from "./schemas/user.schema.js";
import {
    ImportUsersBodySchema,
    ImportUsersResponseSchema,
} from "./schemas/user-import.schema.js";
import { UserService } from "./services/user.service.js";
import { UserImportService } from "./services/user-import.service.js";

/** Pemilik katalog endpoint M-02 (m02-users.md §7). */
const MODUL = "m02-users";

export const listUsersRoute = defineRoute({
    method: "GET",
    path: "/users",
    permission: "user.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar pengguna (filter role, status, unit kerja)",
    response: ListUsersResponseSchema,
});

export const createUserRoute = defineRoute({
    method: "POST",
    path: "/users",
    permission: "user.create",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Buat pengguna baru",
    body: CreateUserBodySchema,
    response: CreatedUserResponseSchema,
});

export const getUserRoute = defineRoute({
    method: "GET",
    path: "/users/:id",
    permission: "user.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Detail pengguna",
    params: UserIdParamSchema,
    response: SingleUserResponseSchema,
});

export const updateUserRoute = defineRoute({
    method: "PUT",
    path: "/users/:id",
    permission: "user.update",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui pengguna",
    params: UserIdParamSchema,
    body: UpdateUserBodySchema,
    response: SingleUserResponseSchema,
});

export const updateUserStatusRoute = defineRoute({
    method: "PATCH",
    path: "/users/:id/status",
    permission: "user.update",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Aktifkan/nonaktifkan pengguna",
    params: UserIdParamSchema,
    body: UpdateUserStatusBodySchema,
    response: SingleUserResponseSchema,
});

/**
 * Sinkron ≤ 200 baris saja (`IMPT-04` sendiri, keputusan 19 log phase-01) —
 * jalur asinkron + idempotensi hash-berkas menyusul `PR-01-17`.
 */
export const importUsersRoute = defineRoute({
    method: "POST",
    path: "/users/import",
    permission: "user.create",
    rateLimitClass: "upload",
    module: MODUL,
    summary: "Impor massal pengguna (CSV/XLSX, sinkron ≤ 200 baris)",
    body: ImportUsersBodySchema,
    response: ImportUsersResponseSchema,
});

export interface UsersModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    readonly logger: Logger;
}

/**
 * Router M-02. `batasi`/`otorisasi` datang dari perakit `api/index.ts` —
 * sama seperti `healthSummaryRouter` (PR-01-15) — sehingga rate limit dan
 * permission tetap satu pola di seluruh aplikasi.
 */
export function usersRouter(
    deps: UsersModuleDeps,
    batasi: (route: RouteDefinition) => RequestHandler,
    otorisasi: (permission: string) => RequestHandler,
): Router {
    const service = new UserService(deps.db, deps.auditLogger);
    const importService = new UserImportService(
        deps.db,
        service,
        deps.auditLogger,
        deps.logger,
    );
    const router = express.Router();

    // Setiap route di bawah ini DIBATASI lewat `batasi(route)`, diselesaikan
    // `rateLimit()` di composition root (`api/index.ts`) — pola yang sama
    // persis dengan `healthRouter`/`healthSummaryRouter` (PR-01-15). CodeQL
    // `js/missing-rate-limiting` tidak dapat melihatnya (tidak mengenali
    // `RedisRateLimiter` buatan sendiri) dan dikecualikan lewat
    // `.github/codeql/codeql-config.yml`, bukan komentar per baris — lihat
    // berkas itu untuk alasan lengkapnya (keputusan 18, log phase-01 §2).
    router.get(
        listUsersRoute.path,
        batasi(listUsersRoute),
        otorisasi(listUsersRoute.permission),
        listUsersHandler(service),
    );
    router.post(
        createUserRoute.path,
        batasi(createUserRoute),
        otorisasi(createUserRoute.permission),
        createUserHandler(service),
    );
    router.get(
        getUserRoute.path,
        batasi(getUserRoute),
        otorisasi(getUserRoute.permission),
        getUserHandler(service),
    );
    router.put(
        updateUserRoute.path,
        batasi(updateUserRoute),
        otorisasi(updateUserRoute.permission),
        updateUserHandler(service),
    );
    router.patch(
        updateUserStatusRoute.path,
        batasi(updateUserStatusRoute),
        otorisasi(updateUserStatusRoute.permission),
        updateUserStatusHandler(service),
    );
    router.post(
        importUsersRoute.path,
        batasi(importUsersRoute),
        otorisasi(importUsersRoute.permission),
        importUsersHandler(importService),
    );

    return router;
}
