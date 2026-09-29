// Ringkasan aset untuk kartu Dashboard Petugas & Pimpinan (19.3, 19.4; SDD-14 §4.3a,
// keputusan 82). Satu kueri agregat ber-FILTER, bukan satu kueri per segmen (SDD-PERF-02).
// PRIVAT — dibuka lewat `services/dashboard-source.ts`.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export const KONDISI_ASET = ["BAIK", "RUSAK_RINGAN", "RUSAK_BERAT", "HILANG"] as const;
export const STATUS_ASET = ["TERSEDIA", "DIRESERVASI", "DIPINJAM", "DALAM_PERBAIKAN", "TIDAK_TERSEDIA"] as const;

export interface RingkasanAset {
    readonly total: number;
    readonly kondisi: Readonly<Record<(typeof KONDISI_ASET)[number], number>>;
    readonly status: Readonly<Record<(typeof STATUS_ASET)[number], number>>;
    readonly belum_berlabel_qr: number;
    /** Rupiah, string desimal (`nilai_perolehan` numeric) — hanya untuk kartu berizin finansial. */
    readonly total_nilai: string;
}

export class DashboardAssetRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    /** Aset yang sudah dihapuskan (`dihapuskan`) tidak lagi dihitung "aktif" (19.3). */
    async ringkasan(ctx: AuthContext): Promise<RingkasanAset> {
        const hitung = (kolom: "kondisi" | "status", nilai: string) => sql<string>`count(*) filter (where ${sql.ref(kolom)} = ${nilai})`.as(`${kolom}_${nilai}`);
        const b = (await this.query(ctx)
            .selectFrom("assets")
            .select([
                sql<string>`count(*)`.as("total"),
                ...KONDISI_ASET.map((k) => hitung("kondisi", k)),
                ...STATUS_ASET.map((s) => hitung("status", s)),
                sql<string>`count(*) filter (where not qr_terpasang)`.as("belum_qr"),
                sql<string>`coalesce(sum(nilai_perolehan), 0)::text`.as("total_nilai"),
            ])
            .where("dihapuskan", "=", false)
            .executeTakeFirstOrThrow()) as unknown as Record<string, string>;
        const angka = (k: string) => Number(b[k] ?? 0);
        return {
            total: angka("total"),
            kondisi: Object.fromEntries(KONDISI_ASET.map((k) => [k, angka(`kondisi_${k}`)])) as RingkasanAset["kondisi"],
            status: Object.fromEntries(STATUS_ASET.map((s) => [s, angka(`status_${s}`)])) as RingkasanAset["status"],
            belum_berlabel_qr: angka("belum_qr"),
            total_nilai: b["total_nilai"] ?? "0",
        };
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDashboardAssetRepository(executor: QueryExecutor): DashboardAssetRepository {
    return defineRepository(new DashboardAssetRepository(executor));
}
