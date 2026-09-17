// RoleService (`FR-02.2`). Batas transaksi SDD-07: tulis matriks + `role_version`
// + AuditLogger.write() sinkron dalam satu transaksi (SDD-EVT-02, AL-01) — cache
// permission (`PR-01-04` juga) tidak butuh pembatalan eksplisit di sini, sebab
// kunci Redis-nya sendiri sudah memuat `role_version` (SDD-03 §4.5).

import type { Kysely } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import type { AuditLogger } from "../../../shared/audit/index.js";
import type { Database } from "../../../shared/db/index.js";
import { withTransaction } from "../../../shared/db/index.js";
import { DomainError, NotFoundError } from "../../../shared/errors/index.js";
import { KODE_ROLE_ADMINISTRATOR } from "../repositories/user.repository.js";
import type { RolePermissionRow, RoleRow, ScopeDb } from "../repositories/role.repository.js";
import { createRoleRepository } from "../repositories/role.repository.js";

const MODUL = "m02-users";

export interface RoleSummary extends RoleRow {
    readonly jumlahPengguna: number;
    readonly permissions: readonly { kode: string; scope: ScopeDb }[];
}

export interface UpdateRolePermissionsInput {
    readonly permissions: readonly { kode: string; scope: ScopeDb }[];
}

function keRingkas(p: RolePermissionRow | { kode: string; scope: ScopeDb }) {
    return { kode: p.kode, scope: p.scope };
}

export class RoleService {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly audit: AuditLogger,
    ) {}

    /** FR-02.2 langkah 2: daftar role beserta jumlah pengguna dan permission aktif. */
    async list(ctx: AuthContext): Promise<readonly RoleSummary[]> {
        const repo = createRoleRepository(this.db);
        const [roles, jumlahPengguna, permissions] = await Promise.all([
            repo.list(ctx),
            repo.countUsersByRole(ctx),
            repo.listPermissionsAllRoles(ctx),
        ]);
        return roles.map((r) => ({
            ...r,
            jumlahPengguna: jumlahPengguna.get(r.id) ?? 0,
            permissions: (permissions.get(r.id) ?? []).map(keRingkas),
        }));
    }

    /**
     * FR-02.2 langkah 3-5: pengganti PENUH matriks sebuah role.
     * A1 (`SDD-AUTH-10`): permission inti tidak dapat dicabut dari Administrator,
     * ditolak di sini — lapisan domain, bukan UI.
     */
    async updatePermissions(
        ctx: AuthContext,
        roleId: number,
        input: UpdateRolePermissionsInput,
    ): Promise<RoleSummary> {
        return withTransaction(
            ctx,
            async (scope) => {
                const repo = createRoleRepository(scope.tx);
                const role = await repo.findById(scope.ctx, roleId);
                if (role === undefined) throw new NotFoundError("Role tidak ditemukan.");

                const katalog = await repo.findPermissionsByKodes(
                    scope.ctx,
                    input.permissions.map((p) => p.kode),
                );
                const petaKatalog = new Map(katalog.map((k) => [k.kode, k]));
                const takDikenal = input.permissions.filter((p) => !petaKatalog.has(p.kode));
                if (takDikenal.length > 0) {
                    throw new DomainError(
                        "VALIDATION_ERROR",
                        `Kode permission tidak dikenal: ${takDikenal.map((p) => p.kode).join(", ")}.`,
                        { field: "permissions" },
                    );
                }

                const before = await repo.listPermissionsByRole(scope.ctx, roleId);
                if (role.kode === KODE_ROLE_ADMINISTRATOR) {
                    const kodeSesudah = new Set(input.permissions.map((p) => p.kode));
                    const dicabut = before.filter((p) => p.inti && !kodeSesudah.has(p.kode));
                    if (dicabut.length > 0) {
                        throw new DomainError(
                            "CORE_PERMISSION_LOCKED",
                            `Permission inti tidak dapat dicabut dari Administrator: ${dicabut
                                .map((p) => p.kode)
                                .join(", ")}.`,
                            { permissions: dicabut.map((p) => p.kode) },
                        );
                    }
                }

                await repo.replacePermissions(
                    scope.ctx,
                    roleId,
                    input.permissions.map((p) => ({
                        permissionId: petaKatalog.get(p.kode)!.id,
                        scope: p.scope,
                    })),
                );
                const roleVersion = await repo.bumpVersion(scope.ctx, roleId);

                const after = input.permissions.map(keRingkas);
                await this.audit.write(scope, {
                    modul: MODUL,
                    aksi: "ROLE_PERMISSION_UPDATED",
                    entitas: "roles",
                    entitasId: roleId,
                    nilaiSebelum: before.map(keRingkas),
                    nilaiSesudah: after,
                });

                const jumlahPengguna = (await repo.countUsersByRole(scope.ctx)).get(role.id) ?? 0;
                return { ...role, role_version: roleVersion, jumlahPengguna, permissions: after };
            },
            this.db,
        );
    }
}
