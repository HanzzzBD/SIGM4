// Ringkasan approval untuk kartu dashboard (19.2 Status Konfigurasi, 19.6/19.7 Pengajuan
// Saya; SDD-14 §4.3a, keputusan 82). PRIVAT — dibuka lewat `services/dashboard-source.ts`.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";
import type { JenisPengajuan } from "../services/dsl.js";

export type StatusPengajuan = "MENUNGGU" | "DISETUJUI" | "DITOLAK" | "PERLU_REVISI" | "DIBATALKAN";

export class DashboardApprovalRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async aturanAktifPerJenis(ctx: AuthContext): Promise<ReadonlyMap<JenisPengajuan, number>> {
        const baris = await this.query(ctx)
            .selectFrom("approval_rules")
            .select(["jenis_pengajuan", sql<string>`count(*)`.as("jumlah")])
            .where("status_aktif", "=", true)
            .groupBy("jenis_pengajuan")
            .execute();
        return new Map(baris.map((b) => [b.jenis_pengajuan, Number(b.jumlah)]));
    }

    /** Pengajuan milik pemohon yang DIBUAT dalam rentang, per status (satu `GROUP BY`). */
    async perStatusPemohon(ctx: AuthContext, pemohonId: number, mulai: Date, akhir: Date): Promise<ReadonlyMap<StatusPengajuan, number>> {
        const baris = await this.query(ctx)
            .selectFrom("approval_instances")
            .select(["status", sql<string>`count(*)`.as("jumlah")])
            .where("pemohon_id", "=", String(pemohonId))
            .where("created_at", ">=", mulai)
            .where("created_at", "<", akhir)
            .groupBy("status")
            .execute();
        return new Map(baris.map((b) => [b.status, Number(b.jumlah)]));
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDashboardApprovalRepository(executor: QueryExecutor): DashboardApprovalRepository {
    return defineRepository(new DashboardApprovalRepository(executor));
}
