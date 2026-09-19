// Route M-02 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { Clock } from "../../shared/clock/index.js";
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
import { classPromotionHandler } from "./controllers/class-promotion.controller.js";
import {
    getUserImportHandler,
    importUsersHandler,
} from "./controllers/user-import.controller.js";
import {
    ClassPromotionBodySchema,
    ClassPromotionResponseSchema,
} from "./schemas/class-promotion.schema.js";
import { ClassPromotionService } from "./services/class-promotion.service.js";
import {
    listRolesHandler,
    updateRolePermissionsHandler,
} from "./controllers/role.controller.js";
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
    ImportJobIdParamSchema,
    ImportUserJobResponseSchema,
    ImportUsersBodySchema,
} from "./schemas/user-import.schema.js";
import {
    ListRolesResponseSchema,
    RoleIdParamSchema,
    SingleRoleResponseSchema,
    UpdateRolePermissionsBodySchema,
} from "./schemas/role.schema.js";
import { UserService } from "./services/user.service.js";
import { UserImportService } from "./services/user-import.service.js";
import { RoleService } from "./services/role.service.js";

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
 * IMPT-03/04: ≤ 200 baris diproses sinkron (200), lebih dari itu dijadwalkan ke
 * worker (202); berkas identik dalam 24 jam mengembalikan pekerjaan sebelumnya.
 */
export const importUsersRoute = defineRoute({
    method: "POST",
    path: "/users/import",
    permission: "user.create",
    rateLimitClass: "upload",
    module: MODUL,
    summary: "Impor massal pengguna (CSV/XLSX; > 200 baris asinkron, idempoten 24 jam)",
    body: ImportUsersBodySchema,
    response: ImportUserJobResponseSchema,
});

/** IMPT-02/04: status dan laporan per baris sebuah pekerjaan impor. */
export const getUserImportRoute = defineRoute({
    method: "GET",
    path: "/users/import/:id",
    permission: "user.create",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Status dan laporan per baris pekerjaan impor pengguna",
    params: ImportJobIdParamSchema,
    response: ImportUserJobResponseSchema,
});

/**
 * SL-02: kenaikan kelas massal — `NAIK` menetapkan kelas pada satu tahun ajaran,
 * `LULUS` menandainya lulus. Laporan per siswa; sinkron ≤ 200 siswa.
 */
export const classPromotionRoute = defineRoute({
    method: "POST",
    path: "/class-promotions",
    permission: "user.update",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Kenaikan kelas massal: tetapkan kelas atau tandai lulus",
    body: ClassPromotionBodySchema,
    response: ClassPromotionResponseSchema,
});

/** FR-02.2 langkah 2: daftar role beserta jumlah pengguna dan permission aktif. */
export const listRolesRoute = defineRoute({
    method: "GET",
    path: "/roles",
    permission: "role.view",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Daftar role beserta jumlah pengguna dan permission aktif",
    response: ListRolesResponseSchema,
});

/**
 * FR-02.2 langkah 3-5: pengganti PENUH matriks permission sebuah role.
 * A1 (`SDD-AUTH-10`) ditolak di `RoleService`, bukan di sini.
 */
export const updateRolePermissionsRoute = defineRoute({
    method: "PUT",
    path: "/roles/:id/permissions",
    permission: "role.update",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Perbarui matriks permission role (role_version naik, SDD-AUTH-04)",
    params: RoleIdParamSchema,
    body: UpdateRolePermissionsBodySchema,
    response: SingleRoleResponseSchema,
});

export interface UsersModuleDeps {
    readonly db: Kysely<Database>;
    readonly auditLogger: AuditLogger;
    readonly logger: Logger;
    /** Cap waktu penanda persetujuan wali (SDD-SYS-07). Bawaan `SystemClock`. */
    readonly clock?: Clock;
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
    const service = new UserService(deps.db, deps.auditLogger, undefined, deps.clock);
    const importService = new UserImportService(
        deps.db,
        service,
        deps.auditLogger,
        deps.logger,
        deps.clock,
    );
    const promotionService = new ClassPromotionService(deps.db, deps.auditLogger, deps.logger);
    const roleService = new RoleService(deps.db, deps.auditLogger);
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
    router.get(
        getUserImportRoute.path,
        batasi(getUserImportRoute),
        otorisasi(getUserImportRoute.permission),
        getUserImportHandler(importService),
    );
    router.post(
        classPromotionRoute.path,
        batasi(classPromotionRoute),
        otorisasi(classPromotionRoute.permission),
        classPromotionHandler(promotionService),
    );
    router.get(
        listRolesRoute.path,
        batasi(listRolesRoute),
        otorisasi(listRolesRoute.permission),
        listRolesHandler(roleService),
    );
    router.put(
        updateRolePermissionsRoute.path,
        batasi(updateRolePermissionsRoute),
        otorisasi(updateRolePermissionsRoute.permission),
        updateRolePermissionsHandler(roleService),
    );

    return router;
}
