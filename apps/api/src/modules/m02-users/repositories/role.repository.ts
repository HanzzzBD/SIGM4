// Repository roles/permissions (SDD-AUTH-02, PM-03, `FR-02.2`). PRIVAT
// terhadap modul (SDD-SYS-03) — hanya service/role.service.ts yang memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

/** Sama seperti enum `permission_scope` di basis data (0009) — tanpa terjemahan. */
export type ScopeDb = "ALL" | "OWN" | "ASSIGNED" | "RESTRICTED";

export interface RoleRow {
    readonly id: string;
    readonly kode: string;
    readonly nama: string;
    readonly deskripsi: string | null;
    readonly is_system: boolean;
    readonly role_version: string;
}

/** Baris matriks: satu permission yang dipegang sebuah role, beserta apakah ia inti (`SDD-AUTH-10`). */
export interface RolePermissionRow {
    readonly kode: string;
    readonly scope: ScopeDb;
    readonly inti: boolean;
}

/** Satu baris katalog Lampiran C bagi matriks P-66 (`GET /permissions`). */
export interface PermissionKatalogRow {
    readonly kode: string;
    readonly modul: string;
    readonly aksi: string;
    readonly deskripsi: string;
    readonly inti: boolean;
}

/** Katalog permission yang dicocokkan terhadap payload `PUT .../permissions`. */
export interface PermissionCatalogRow {
    readonly id: string;
    readonly kode: string;
    readonly inti: boolean;
}

export interface PermissionEntry {
    readonly permissionId: string;
    readonly scope: ScopeDb;
}

export class RoleRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async list(ctx: AuthContext): Promise<readonly RoleRow[]> {
        return this.query(ctx)
            .selectFrom("roles")
            .select(["id", "kode", "nama", "deskripsi", "is_system", "role_version"])
            .orderBy("id", "asc")
            .execute();
    }

    async findById(ctx: AuthContext, id: number): Promise<RoleRow | undefined> {
        return this.query(ctx)
            .selectFrom("roles")
            .select(["id", "kode", "nama", "deskripsi", "is_system", "role_version"])
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    /** Jumlah pengguna per role — dipakai `GET /roles` (main flow 2, FR-02.2). */
    async countUsersByRole(ctx: AuthContext): Promise<ReadonlyMap<string, number>> {
        const baris = await this.query(ctx)
            .selectFrom("users")
            .select(["role_id", sql<string>`count(*)`.as("jumlah")])
            .groupBy("role_id")
            .execute();
        return new Map(baris.map((b) => [b.role_id, Number(b.jumlah)]));
    }

    /** Matriks permission×scope milik SATU role — dipakai juga sebagai snapshot "sebelum" (`AL-04`). */
    async listPermissionsByRole(
        ctx: AuthContext,
        roleId: number,
    ): Promise<readonly RolePermissionRow[]> {
        return this.query(ctx)
            .selectFrom("role_permissions as rp")
            .innerJoin("permissions as p", "p.id", "rp.permission_id")
            .select(["p.kode as kode", "rp.scope as scope", "p.inti as inti"])
            .where("rp.role_id", "=", String(roleId))
            .orderBy("p.kode", "asc")
            .execute();
    }

    /** Sama seperti `listPermissionsByRole`, untuk SELURUH role sekaligus (`GET /roles`). */
    async listPermissionsAllRoles(
        ctx: AuthContext,
    ): Promise<ReadonlyMap<string, readonly RolePermissionRow[]>> {
        const baris = await this.query(ctx)
            .selectFrom("role_permissions as rp")
            .innerJoin("permissions as p", "p.id", "rp.permission_id")
            .select(["rp.role_id as role_id", "p.kode as kode", "rp.scope as scope", "p.inti as inti"])
            .orderBy("p.kode", "asc")
            .execute();
        const peta = new Map<string, RolePermissionRow[]>();
        for (const b of baris) {
            const daftar = peta.get(b.role_id) ?? [];
            daftar.push({ kode: b.kode, scope: b.scope, inti: b.inti });
            peta.set(b.role_id, daftar);
        }
        return peta;
    }

    /** Validasi FK sebelum tulis (SDD-AUTH-10 A1 juga bergantung pada `inti` di sini). */
    async findPermissionsByKodes(
        ctx: AuthContext,
        kodes: readonly string[],
    ): Promise<readonly PermissionCatalogRow[]> {
        if (kodes.length === 0) return [];
        return this.query(ctx)
            .selectFrom("permissions")
            .select(["id", "kode", "inti"])
            .where("kode", "in", kodes)
            .execute();
    }

    /**
     * Pengganti PENUH matriks sebuah role (PUT — bukan PATCH per baris): hapus
     * seluruh baris lama, sisipkan yang baru. Pemanggil sudah memvalidasi
     * katalog dan penguncian permission inti sebelum sampai di sini.
     */
    async replacePermissions(
        ctx: AuthContext,
        roleId: number,
        entries: readonly PermissionEntry[],
    ): Promise<void> {
        const q = this.query(ctx);
        await q.deleteFrom("role_permissions").where("role_id", "=", String(roleId)).execute();
        if (entries.length > 0) {
            await q
                .insertInto("role_permissions")
                .values(
                    entries.map((e) => ({
                        role_id: String(roleId),
                        permission_id: e.permissionId,
                        scope: e.scope,
                    })),
                )
                .execute();
        }
    }

    /** Katalog Lampiran C utuh, urut modul lalu kode (`GET /permissions`, P-66). */
    async listCatalog(ctx: AuthContext): Promise<readonly PermissionKatalogRow[]> {
        return this.query(ctx)
            .selectFrom("permissions")
            .select(["kode", "modul", "aksi", "deskripsi", "inti"])
            .orderBy("modul", "asc")
            .orderBy("kode", "asc")
            .execute();
    }

    /**
     * Menyerialkan pembuat role kustom: pemeriksaan nama tanpa-huruf-besar lalu INSERT tidak boleh disalip
     * permintaan serentak (READ COMMITTED; `roles_nama_uq` hanya peka huruf). Dilepas saat transaksi selesai.
     */
    async lockPembuatanRole(ctx: AuthContext): Promise<void> {
        await sql`SELECT pg_advisory_xact_lock(hashtext('roles-kustom'))`.execute(this.query(ctx));
    }

    async existsByNama(ctx: AuthContext, nama: string): Promise<boolean> {
        const baris = await this.query(ctx)
            .selectFrom("roles")
            .select("id")
            .where(sql<string>`lower(nama)`, "=", nama.toLowerCase())
            .executeTakeFirst();
        return baris !== undefined;
    }

    /**
     * FR-02.2 A2: role kustom berkode `RK-{id}`. Id diambil dari sekuens lebih dulu agar kode
     * dapat ditulis pada INSERT yang sama (`roles.kode` NOT NULL UNIQUE).
     */
    async insertCustom(ctx: AuthContext, input: { readonly nama: string; readonly deskripsi: string | null }): Promise<RoleRow> {
        const { rows } = await sql<{ id: string }>`SELECT nextval(pg_get_serial_sequence('roles', 'id'))::text AS id`.execute(this.query(ctx));
        const id = rows[0]!.id;
        return this.query(ctx)
            .insertInto("roles")
            .values({ id, kode: `RK-${id}`, nama: input.nama, deskripsi: input.deskripsi, is_system: false, created_by: ctx.userId, updated_by: ctx.userId })
            .returning(["id", "kode", "nama", "deskripsi", "is_system", "role_version"])
            .executeTakeFirstOrThrow();
    }

    /** Menyalin seluruh baris matriks (permission + scope) dari role sumber ke role tujuan. */
    async copyPermissions(ctx: AuthContext, dariRoleId: number, keRoleId: string): Promise<void> {
        await this.query(ctx)
            .insertInto("role_permissions")
            .columns(["role_id", "permission_id", "scope"])
            .expression((eb) =>
                eb.selectFrom("role_permissions").select([sql<string>`${keRoleId}::bigint`.as("role_id"), "permission_id", "scope"]).where("role_id", "=", String(dariRoleId)),
            )
            .execute();
    }

    /** Menaikkan `role_version` (SDD-AUTH-04) — membatalkan cache permission seketika. */
    async bumpVersion(ctx: AuthContext, roleId: number): Promise<string> {
        const baris = await this.query(ctx)
            .updateTable("roles")
            .set({ role_version: sql`role_version + 1`, updated_by: ctx.userId })
            .where("id", "=", String(roleId))
            .returning("role_version")
            .executeTakeFirstOrThrow();
        return baris.role_version;
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createRoleRepository(executor: QueryExecutor): RoleRepository {
    return defineRepository(new RoleRepository(executor));
}
