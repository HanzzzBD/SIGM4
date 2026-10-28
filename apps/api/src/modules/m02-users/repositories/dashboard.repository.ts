// Kueri ringkasan pengguna untuk kartu Dashboard Administrator (19.2; SDD-14 §4.3a,
// keputusan 82). PRIVAT — dibuka lewat `services/dashboard-source.ts`.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface PenggunaPerRole {
    readonly kode: string;
    readonly nama: string;
    readonly jumlah: number;
}

export class DashboardUserRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Satu kueri `GROUP BY` — setiap role tercantum, termasuk yang belum berpengguna aktif. */
    async aktifPerRole(ctx: AuthContext): Promise<readonly PenggunaPerRole[]> {
        const baris = await this.query(ctx)
            .selectFrom("roles as r")
            .leftJoin("users as u", (j) => j.onRef("u.role_id", "=", "r.id").on("u.status", "=", "AKTIF"))
            .select(["r.kode", "r.nama", sql<string>`count(u.id)`.as("jumlah")])
            .groupBy(["r.kode", "r.nama"])
            .orderBy("r.kode")
            .execute();
        return baris.map((b) => ({ kode: b.kode, nama: b.nama, jumlah: Number(b.jumlah) }));
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDashboardUserRepository(executor: QueryExecutor): DashboardUserRepository {
    return defineRepository(new DashboardUserRepository(executor));
}
