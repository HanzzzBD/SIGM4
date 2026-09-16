// Repository users (SDD-AUTH-02, PM-03). PRIVAT terhadap modul (SDD-SYS-03) —
// hanya service/user.service.ts yang boleh memanggilnya.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

/** R-01 — satu-satunya kode role Administrator (roles-permissions.md). */
export const KODE_ROLE_ADMINISTRATOR = "R-01";

const KOLOM_USER = [
    "id",
    "nama",
    "email",
    "nip_nis",
    "role_id",
    "unit_kerja",
    "telepon",
    "status",
    "must_change_password",
    "login_terakhir_pada",
    "created_at",
    "updated_at",
] as const;

/** Bentuk baris `users` yang boleh diserahkan ke pemanggil — tanpa `password_hash`. */
export interface UserRow {
    readonly id: string;
    readonly nama: string;
    readonly email: string;
    readonly nip_nis: string;
    readonly role_id: string;
    readonly unit_kerja: string | null;
    readonly telepon: string | null;
    readonly status: "AKTIF" | "NONAKTIF";
    readonly must_change_password: boolean;
    readonly login_terakhir_pada: Date | null;
    readonly created_at: Date;
    readonly updated_at: Date;
}

export interface ListUsersFilter {
    readonly page: number;
    readonly perPage: number;
    readonly status?: "AKTIF" | "NONAKTIF";
    readonly roleId?: number;
    readonly unitKerja?: string;
}

export interface ListUsersResult {
    readonly rows: readonly UserRow[];
    readonly total: number;
}

export interface CreateUserData {
    readonly nama: string;
    readonly email: string;
    readonly nipNis: string;
    readonly roleId: number;
    readonly unitKerja: string | null;
    readonly telepon: string | null;
    readonly passwordHash: string;
}

export interface UpdateUserData {
    readonly nama: string;
    readonly email: string;
    readonly nipNis: string;
    readonly roleId: number;
    readonly unitKerja: string | null;
    readonly telepon: string | null;
}

export class UserRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async findById(ctx: AuthContext, id: number): Promise<UserRow | undefined> {
        return this.query(ctx)
            .selectFrom("users")
            .select(KOLOM_USER)
            .where("id", "=", String(id))
            .executeTakeFirst();
    }

    /** Kode role pemilik baris — dipakai guard admin terakhir, tidak pernah diekspos respons. */
    async findRoleKode(ctx: AuthContext, id: number): Promise<string | undefined> {
        const baris = await this.query(ctx)
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select("r.kode as kode")
            .where("u.id", "=", String(id))
            .executeTakeFirst();
        return baris?.kode;
    }

    async list(ctx: AuthContext, filter: ListUsersFilter): Promise<ListUsersResult> {
        const eksekutor = this.query(ctx);
        const dasar = () => {
            let q = eksekutor.selectFrom("users");
            if (filter.status !== undefined) q = q.where("status", "=", filter.status);
            if (filter.roleId !== undefined)
                q = q.where("role_id", "=", String(filter.roleId));
            if (filter.unitKerja !== undefined)
                q = q.where("unit_kerja", "=", filter.unitKerja);
            return q;
        };

        const [rows, hitung] = await Promise.all([
            dasar()
                .select(KOLOM_USER)
                .orderBy("id", "asc")
                .limit(filter.perPage)
                .offset((filter.page - 1) * filter.perPage)
                .execute(),
            dasar()
                .select(sql<string>`count(*)`.as("total"))
                .executeTakeFirst(),
        ]);

        return { rows, total: Number(hitung?.total ?? 0) };
    }

    async existsByEmail(
        ctx: AuthContext,
        email: string,
        excludeId?: number,
    ): Promise<boolean> {
        let q = this.query(ctx)
            .selectFrom("users")
            .select("id")
            .where(sql<boolean>`lower(email) = lower(${email})`);
        if (excludeId !== undefined) q = q.where("id", "!=", String(excludeId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    async existsByNipNis(
        ctx: AuthContext,
        nipNis: string,
        excludeId?: number,
    ): Promise<boolean> {
        let q = this.query(ctx)
            .selectFrom("users")
            .select("id")
            .where("nip_nis", "=", nipNis);
        if (excludeId !== undefined) q = q.where("id", "!=", String(excludeId));
        return (await q.executeTakeFirst()) !== undefined;
    }

    /**
     * ID akun aktif ber-`role_id` tertentu, TERKUNCI `FOR UPDATE` (SDD-05 §4.3):
     * "BR-068 + BR-070a: minimal dua Administrator aktif — ditegakkan di service
     * layer... dengan SELECT ... FOR UPDATE pada baris Administrator."
     */
    async lockActiveUserIdsByRole(
        ctx: AuthContext,
        roleId: string,
    ): Promise<readonly string[]> {
        const rows = await this.query(ctx)
            .selectFrom("users")
            .select("id")
            .where("role_id", "=", roleId)
            .where("status", "=", "AKTIF")
            .forUpdate()
            .execute();
        return rows.map((r) => r.id);
    }

    async insert(ctx: AuthContext, data: CreateUserData): Promise<UserRow> {
        return this.query(ctx)
            .insertInto("users")
            .values({
                nama: data.nama,
                email: data.email,
                password_hash: data.passwordHash,
                nip_nis: data.nipNis,
                role_id: data.roleId,
                unit_kerja: data.unitKerja,
                telepon: data.telepon,
                status: "AKTIF",
                must_change_password: true,
                created_by: ctx.userId,
                updated_by: ctx.userId,
            })
            .returning(KOLOM_USER)
            .executeTakeFirstOrThrow();
    }

    async update(ctx: AuthContext, id: number, data: UpdateUserData): Promise<UserRow> {
        return this.query(ctx)
            .updateTable("users")
            .set({
                nama: data.nama,
                email: data.email,
                nip_nis: data.nipNis,
                role_id: data.roleId,
                unit_kerja: data.unitKerja,
                telepon: data.telepon,
                updated_by: ctx.userId,
            })
            .where("id", "=", String(id))
            .returning(KOLOM_USER)
            .executeTakeFirstOrThrow();
    }

    async updateStatus(
        ctx: AuthContext,
        id: number,
        status: "AKTIF" | "NONAKTIF",
    ): Promise<UserRow> {
        return this.query(ctx)
            .updateTable("users")
            .set({ status, updated_by: ctx.userId })
            .where("id", "=", String(id))
            .returning(KOLOM_USER)
            .executeTakeFirstOrThrow();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02) — lihat shared/db/repository.ts. */
export function createUserRepository(executor: QueryExecutor): UserRepository {
    return defineRepository(new UserRepository(executor));
}
