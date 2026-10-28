// Riwayat satu entitas bisnis dari activity log (m18 §11; PR-03-27, keputusan 17e log phase-03).
// PRIVAT — dibuka lewat `services/entity-history.ts`.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface EntriRiwayat {
    readonly waktu: Date;
    readonly aksi: string;
    readonly user_nama: string | null;
    readonly entitas_id: string | null;
    readonly status: string | null;
    readonly keterangan: string | null;
}

export class EntityHistoryRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Entri SUKSES atas `entitas` ber-id `ids`, lama → baru. Hanya status sesudah — snapshot lain tak dibuka. */
    async riwayat(ctx: AuthContext, entitas: string, ids: readonly string[], batas: number): Promise<readonly EntriRiwayat[]> {
        if (ids.length === 0) return [];
        return this.query(ctx)
            .selectFrom("activity_logs as l")
            .leftJoin("users as u", "u.id", "l.user_id")
            // Nama saat aksi (snapshot AL-04) bila ada; selain itu nama pengguna kini. Null = SYSTEM (AL-06).
            .select(["l.waktu", "l.aksi", sql<string | null>`coalesce(l.user_nama, u.nama)`.as("user_nama"), "l.entitas_id", sql<string | null>`l.nilai_sesudah->>'status'`.as("status"), "l.keterangan"])
            .where("l.entitas", "=", entitas)
            .where("l.entitas_id", "in", [...ids])
            .where("l.hasil", "=", "SUKSES")
            .orderBy("l.waktu")
            .orderBy("l.id")
            .limit(batas)
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createEntityHistoryRepository(executor: QueryExecutor): EntityHistoryRepository {
    return defineRepository(new EntityHistoryRepository(executor));
}
