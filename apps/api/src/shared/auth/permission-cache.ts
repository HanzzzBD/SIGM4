// Cache permission efektif (SDD-AUTH-04, PM-05, `PR-01-04`).
//
// Dipakai `Phase 02` (login, `PR-02-02`) untuk membangun `AuthContext` — berkas
// ini sendiri tidak pernah menerima satu, sebab ia berjalan SEBELUM AuthContext
// ada. Peran & `role_version` pengguna dibaca ULANG setiap panggilan (kueri
// murah, indeks primer); yang di-cache hanya daftar permission×scope milik
// role itu — join yang lebih mahal terhadap `role_permissions`. Karena kunci
// cache memuat `role_version`, menaikkannya (PUT /roles/{id}/permissions)
// membuat kunci lama tidak pernah terbaca lagi tanpa penghapusan eksplisit
// (SDD-03 §4.5).

import type { Redis } from "ioredis";
import type { Kysely } from "kysely";
import type { Database } from "../db/index.js";
import type { Scope } from "./context.js";

/** TTL cache (`PM-05`): permintaan berikutnya melihat matriks terbaru ≤ 60 detik. */
const TTL_DETIK = 60;
const PREFIX_KUNCI = "sigm4:perm";

const PETA_SCOPE: Record<"ALL" | "OWN" | "ASSIGNED" | "RESTRICTED", Scope> = {
    ALL: "all",
    OWN: "own",
    ASSIGNED: "assigned",
    RESTRICTED: "restricted",
};

export interface EffectivePermissions {
    readonly roleId: string;
    readonly roleCode: string;
    readonly roleVersion: string;
    /** Status akun pada saat dibaca — dibaca ulang setiap panggilan, tidak pernah dari cache. */
    readonly userStatus: "AKTIF" | "NONAKTIF";
    readonly scopes: ReadonlyMap<string, Scope>;
}

function kunciCache(userId: number, roleVersion: string): string {
    return `${PREFIX_KUNCI}:${String(userId)}:${roleVersion}`;
}

export class PermissionCache {
    constructor(
        private readonly db: Kysely<Database>,
        private readonly redis: Redis,
    ) {}

    /** Permission efektif pengguna — dari cache Redis, atau basis data bila baru/basi. */
    async load(userId: number): Promise<EffectivePermissions | undefined> {
        const peran = await this.muatPeran(userId);
        if (peran === undefined) return undefined;

        const kunci = kunciCache(userId, peran.roleVersion);
        const tersimpan = await this.redis.get(kunci);
        if (tersimpan !== null) {
            return { ...peran, scopes: new Map(JSON.parse(tersimpan) as [string, Scope][]) };
        }

        const scopes = await this.muatPermissionRole(peran.roleId);
        await this.redis.set(kunci, JSON.stringify([...scopes]), "EX", TTL_DETIK);
        return { ...peran, scopes };
    }

    private async muatPeran(
        userId: number,
    ): Promise<Pick<EffectivePermissions, "roleId" | "roleCode" | "roleVersion" | "userStatus"> | undefined> {
        const baris = await this.db
            .selectFrom("users as u")
            .innerJoin("roles as r", "r.id", "u.role_id")
            .select(["r.id as role_id", "r.kode as role_kode", "r.role_version as role_version", "u.status as user_status"])
            .where("u.id", "=", String(userId))
            .executeTakeFirst();
        if (baris === undefined) return undefined;
        return {
            roleId: baris.role_id,
            roleCode: baris.role_kode,
            roleVersion: baris.role_version,
            userStatus: baris.user_status,
        };
    }

    private async muatPermissionRole(roleId: string): Promise<ReadonlyMap<string, Scope>> {
        const baris = await this.db
            .selectFrom("role_permissions as rp")
            .innerJoin("permissions as p", "p.id", "rp.permission_id")
            .select(["p.kode as kode", "rp.scope as scope"])
            .where("rp.role_id", "=", roleId)
            .execute();
        return new Map(baris.map((b) => [b.kode, PETA_SCOPE[b.scope]] as const));
    }
}
