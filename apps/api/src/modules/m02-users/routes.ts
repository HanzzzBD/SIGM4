// Route M-02 (SDD-AUTH-01, PM-01) + perakit router modul.

import express from "express";
import type { RequestHandler, Router } from "express";
import type { Kysely } from "kysely";
import type { AuditLogger } from "../../shared/audit/index.js";
import type { AuthContext } from "../../shared/auth/index.js";
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
import { resetDuaFaktorHandler, terbitkanKodeAktivasiHandler } from "./controllers/dua-faktor.controller.js";
import { resetPasswordHandler } from "./controllers/reset-password.controller.js";
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
    KelolaDuaFaktorBodySchema,
    KodeAktivasiResponseSchema,
    ListUsersResponseSchema,
    ResetDuaFaktorResponseSchema,
    ResetPasswordBodySchema,
    ResetPasswordResponseSchema,
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
 * FR-01.3 langkah 3–4 dari detail pengguna (P-63): terbitkan password sementara TANPA menunggu permintaan
 * pemohon; metode verifikasi identitas wajib dan tercatat pada permintaan. Logikanya milik M-01
 * (`PenerbitPasswordSementara`, disuntikkan). Permintaan `MENUNGGU` akun itu, bila ada, yang diselesaikan.
 */
export const resetUserPasswordRoute = defineRoute({
    method: "POST",
    path: "/users/:id/reset-password",
    permission: "user.reset_password",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Terbitkan password sementara (tampil satu kali); metode verifikasi identitas wajib",
    successStatus: 200,
    params: UserIdParamSchema,
    body: ResetPasswordBodySchema,
    response: ResetPasswordResponseSchema,
});

/**
 * Pintu M-01 yang dipakai reset langsung. Bentuknya didefinisikan di sini (pemakai) dan dipenuhi
 * secara struktural oleh `buatPenerbitPasswordSementara` (m01-auth) — modul ini tidak mengimpor m01.
 */
export interface PenerbitPasswordSementara {
    terbitkanLangsung(
        ctx: AuthContext,
        userId: string,
        metode: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS",
        klien: { readonly ip: string | undefined; readonly userAgent: string | undefined },
    ): Promise<{ permintaanId: string; berlakuSampai: Date; passwordSementara: string }>;
}

/**
 * FR-01.5 A3 dari detail pengguna (P-63): reset 2FA pengguna lain. `metode_verifikasi` wajib; 2FA dilepas, kode
 * cadangan dihapus, SELURUH sesi sasaran dicabut, dan bagi role wajib 2FA terbit kode aktivasi baru (tampil satu
 * kali, BR-070d). Bukan akun sendiri; yang direset harus sedang ber-2FA. Logikanya milik M-01 (disuntikkan).
 */
export const resetUserDuaFaktorRoute = defineRoute({
    method: "POST",
    path: "/users/:id/reset-2fa",
    permission: "user.reset_2fa",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Reset 2FA pengguna: cabut seluruh sesi; role wajib menerima kode aktivasi baru (tampil satu kali)",
    successStatus: 200,
    params: UserIdParamSchema,
    body: KelolaDuaFaktorBodySchema,
    response: ResetDuaFaktorResponseSchema,
});

/**
 * FR-01.5 A7 (BR-070d): menerbitkan kode aktivasi 2FA bagi akun AKTIF role wajib yang belum ber-2FA. Permission yang
 * sama dengan reset 2FA (`user.reset_2fa`, tanpa permission baru). Bukan akun sendiri; menggantikan kode sebelumnya.
 */
export const terbitkanKodeAktivasiRoute = defineRoute({
    method: "POST",
    path: "/users/:id/2fa-activation-code",
    permission: "user.reset_2fa",
    rateLimitClass: "default",
    module: MODUL,
    summary: "Terbitkan kode aktivasi 2FA bagi akun role wajib yang belum ber-2FA (tampil satu kali)",
    successStatus: 200,
    params: UserIdParamSchema,
    body: KelolaDuaFaktorBodySchema,
    response: KodeAktivasiResponseSchema,
});

/**
 * Pintu M-01 untuk mengelola 2FA pengguna lain. Bentuknya didefinisikan di sini (pemakai) dan dipenuhi secara
 * struktural oleh `buatPengelolaDuaFaktor` (m01-auth) — modul ini tidak mengimpor m01.
 */
export interface PengelolaDuaFaktor {
    terbitkanKodeAktivasi(
        ctx: AuthContext,
        userId: string,
        metode: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS",
        klien: { readonly ip: string | undefined; readonly userAgent: string | undefined },
    ): Promise<{ kode: string; berlakuSampai: Date }>;
    reset(
        ctx: AuthContext,
        userId: string,
        metode: "KARTU_IDENTITAS_TATAP_MUKA" | "KONFIRMASI_ATASAN_ATAU_WALI_KELAS",
        klien: { readonly ip: string | undefined; readonly userAgent: string | undefined },
    ): Promise<{ sesiDicabut: number; kodeAktivasi: { kode: string; berlakuSampai: Date } | null }>;
}

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
    /** Reset password langsung (`POST /users/{id}/reset-password`); dipenuhi M-01 lewat composition root. */
    readonly penerbitPassword: PenerbitPasswordSementara;
    /** Reset 2FA dan kode aktivasi 2FA (`PR-02-33`); dipenuhi M-01 lewat composition root. */
    readonly pengelolaDuaFaktor: PengelolaDuaFaktor;
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
        resetUserPasswordRoute.path,
        batasi(resetUserPasswordRoute),
        otorisasi(resetUserPasswordRoute.permission),
        resetPasswordHandler(deps.penerbitPassword),
    );
    router.post(
        resetUserDuaFaktorRoute.path,
        batasi(resetUserDuaFaktorRoute),
        otorisasi(resetUserDuaFaktorRoute.permission),
        resetDuaFaktorHandler(deps.pengelolaDuaFaktor),
    );
    router.post(
        terbitkanKodeAktivasiRoute.path,
        batasi(terbitkanKodeAktivasiRoute),
        otorisasi(terbitkanKodeAktivasiRoute.permission),
        terbitkanKodeAktivasiHandler(deps.pengelolaDuaFaktor),
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
