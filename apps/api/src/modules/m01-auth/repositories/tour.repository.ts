// Repository progres tur produk (SDD-AUTH-05). Semua metode terbatas pada baris milik
// pemanggil sendiri (`ctx.userId`) — scope `own`, tidak menerima id pengguna lain.
//
// PRIVAT terhadap modul (SDD-SYS-03).

import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export type StatusTur = "SELESAI" | "DILEWATI";

export interface TurRow {
    readonly kunci_tur: string;
    readonly status: StatusTur;
    readonly versi: number;
    readonly updated_at: Date;
}

export class TourRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async milik(ctx: AuthContext): Promise<readonly TurRow[]> {
        return this.query(ctx)
            .selectFrom("product_tour_progress")
            .select(["kunci_tur", "status", "versi", "updated_at"])
            .where("user_id", "=", String(ctx.userId))
            .orderBy("kunci_tur")
            .execute();
    }

    async ambil(ctx: AuthContext, kunci: string): Promise<TurRow | undefined> {
        return this.query(ctx)
            .selectFrom("product_tour_progress")
            .select(["kunci_tur", "status", "versi", "updated_at"])
            .where("user_id", "=", String(ctx.userId))
            .where("kunci_tur", "=", kunci)
            .executeTakeFirst();
    }

    /** Upsert satu tur; waktu dari `Clock` yang di-inject pemanggil (SDD-SYS-07). */
    async simpan(ctx: AuthContext, kunci: string, status: StatusTur, versi: number, pada: Date): Promise<TurRow> {
        return this.query(ctx)
            .insertInto("product_tour_progress")
            .values({ user_id: ctx.userId, kunci_tur: kunci, status, versi, created_at: pada, updated_at: pada })
            .onConflict((oc) =>
                oc.columns(["user_id", "kunci_tur"]).doUpdateSet((eb) => ({
                    status: eb.ref("excluded.status"),
                    versi: eb.ref("excluded.versi"),
                    updated_at: eb.ref("excluded.updated_at"),
                })),
            )
            .returning(["kunci_tur", "status", "versi", "updated_at"])
            .executeTakeFirstOrThrow();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createTourRepository(executor: QueryExecutor): TourRepository {
    return defineRepository(new TourRepository(executor));
}
