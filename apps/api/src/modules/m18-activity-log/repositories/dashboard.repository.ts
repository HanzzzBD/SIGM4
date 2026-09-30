// Kueri ringkasan activity log untuk kartu Dashboard Administrator (19.2; SDD-14 §4.3a,
// keputusan 82). PRIVAT — dibuka lewat `services/dashboard-source.ts`.

import { sql } from "kysely";
import type { AuthContext } from "../../../shared/auth/index.js";
import { BaseRepository, defineRepository } from "../../../shared/db/index.js";
import type { QueryExecutor } from "../../../shared/db/index.js";

export interface EntriTerbaru {
    readonly waktu: Date;
    readonly user_nama: string | null;
    readonly role: string | null;
    readonly modul: string;
    readonly aksi: string;
    readonly entitas: string | null;
    readonly entitas_id: string | null;
    readonly hasil: "SUKSES" | "GAGAL";
}

export class DashboardLogRepository extends BaseRepository {
    constructor(executor: QueryExecutor) {
        super(executor);
    }

    async hitungLogin(ctx: AuthContext, sejak: Date): Promise<{ sukses: number; gagal: number }> {
        const b = await this.query(ctx)
            .selectFrom("activity_logs")
            .select([
                sql<string>`count(*) filter (where aksi = 'LOGIN_SUCCESS')`.as("sukses"),
                sql<string>`count(*) filter (where aksi = 'LOGIN_FAILED')`.as("gagal"),
            ])
            .where("aksi", "in", ["LOGIN_SUCCESS", "LOGIN_FAILED"])
            .where("waktu", ">=", sejak)
            .executeTakeFirstOrThrow();
        return { sukses: Number(b.sukses), gagal: Number(b.gagal) };
    }

    /** Satu baris per tanggal WIB yang berisi aktivitas (hari kosong tidak dikembalikan). */
    async perHari(ctx: AuthContext, mulai: Date, akhir: Date): Promise<readonly { tanggal: string; jumlah: number }[]> {
        const tanggal = sql<string>`to_char(waktu at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;
        const baris = await this.query(ctx)
            .selectFrom("activity_logs")
            .select([tanggal.as("tanggal"), sql<string>`count(*)`.as("jumlah")])
            .where("waktu", ">=", mulai)
            .where("waktu", "<", akhir)
            .groupBy(tanggal)
            .orderBy(tanggal)
            .execute();
        return baris.map((b) => ({ tanggal: b.tanggal, jumlah: Number(b.jumlah) }));
    }

    async terbaru(ctx: AuthContext, batas: number): Promise<readonly EntriTerbaru[]> {
        return this.query(ctx)
            .selectFrom("activity_logs")
            .select(["waktu", "user_nama", "role", "modul", "aksi", "entitas", "entitas_id", "hasil"])
            .orderBy("waktu", "desc")
            .orderBy("id", "desc")
            .limit(batas)
            .execute();
    }
}

/** Gerbang kompilasi `ScopedRepository` (SDD-AUTH-02). */
export function createDashboardLogRepository(executor: QueryExecutor): DashboardLogRepository {
    return defineRepository(new DashboardLogRepository(executor));
}
