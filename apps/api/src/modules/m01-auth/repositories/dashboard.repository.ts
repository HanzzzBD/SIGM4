// Antrean permintaan reset password untuk kartu Dashboard Administrator (19.2; SDD-14
// §4.3a, keputusan 82). PRIVAT — dibuka lewat `services/dashboard-source.ts`.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface PermintaanMenunggu {
    readonly id: number;
    readonly user_id: number;
    readonly nama: string;
    readonly diminta_pada: Date;
}

export class DashboardResetRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Jumlah + `batas` terlama (paling lama menunggu dulu) dalam dua kueri. */
    async menunggu(ctx: AuthContext, batas: number): Promise<{ jumlah: number; daftar: readonly PermintaanMenunggu[] }> {
        const q = this.query(ctx);
        const [n] = await q.selectFrom("password_reset_requests").select(sql<string>`count(*)`.as("n")).where("status", "=", "MENUNGGU").execute();
        const daftar = await q
            .selectFrom("password_reset_requests as r")
            .innerJoin("users as u", "u.id", "r.user_id")
            .select(["r.id", "r.user_id", "u.nama", "r.diminta_pada"])
            .where("r.status", "=", "MENUNGGU")
            .orderBy("r.diminta_pada")
            .orderBy("r.id")
            .limit(batas)
            .execute();
        return { jumlah: Number(n?.n ?? 0), daftar: daftar.map((d) => ({ id: Number(d.id), user_id: Number(d.user_id), nama: d.nama, diminta_pada: d.diminta_pada })) };
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDashboardResetRepository(executor: QueryExecutor): DashboardResetRepository {
    return defineRepository(new DashboardResetRepository(executor));
}
